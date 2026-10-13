import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CODEX } from "./config.ts";

export interface CodexOptions {
  cwd: string;
  prompt: string;
  sandbox: "read-only" | "workspace-write";
  /** JSON Schema file for the final message (structured output). */
  schema?: string;
  /** Resume this thread instead of starting a new one. */
  resume?: string;
  images?: string[];
  effort?: string;
  /** Model for this turn (overrides CODEX_MODEL / the user's config). */
  model?: string;
  ephemeral?: boolean;
  /** Where to append the raw JSONL event stream. */
  log?: string;
  onActivity?: (text: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface CodexResult {
  ok: boolean;
  threadId?: string;
  lastMessage: string;
  exitCode: number | null;
  error?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cached_input_tokens?: number };
  commands: number;
}

const short = (text: string, n = 160) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** A shell command Codex ran, in words a reader understands. */
export function friendlyCommand(raw: string): string {
  const command = raw.replace(/^\/bin\/(ba|z)?sh\s+-lc\s+/, "").replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  if (/node\s+check\.mjs/.test(command)) return "running the check";
  const files = [...new Set((command.match(/[\w./-]+\.(?:md|js|mjs|json)\b/g) || []).map((f) => f.split("/").pop()!))];
  if (/^(cat|sed|head|tail|rg|grep|ls|nl|wc|find)\b/.test(command)) return files.length ? `reading ${files.slice(0, 3).join(", ")}${files.length > 3 ? "…" : ""}` : "looking around the workspace";
  if (/(>|tee|apply_patch|python3?)\b[\s\S]*demo\.js/.test(command)) return "writing demo.js";
  if (/^node\b/.test(command)) return "trying the code in node";
  return `$ ${short(command, 100)}`;
}

/** What a JSONL event says, in a few words, for the progress line. */
function describe(event: Record<string, any>): string | null {
  const item = event.item;
  if (!item) return null;
  if (item.type === "agent_message" && event.type === "item.completed") return short(item.text || "");
  if (item.type === "reasoning" && event.type === "item.completed") return short(item.text || item.summary || "thinking");
  if (item.type === "command_execution" && event.type === "item.started") return friendlyCommand(String(item.command || ""));
  if (item.type === "file_change" && event.type === "item.completed") {
    const files = (item.changes || []).map((c: { path?: string }) => (c.path || "").split("/").pop()).filter(Boolean);
    return files.length ? `edited ${files.join(", ")}` : "edited files";
  }
  if (item.type === "web_search") return "searching the web";
  return null;
}

export function codexArgs(options: CodexOptions, lastFile: string): string[] {
  const args = ["exec", "--json", "--skip-git-repo-check", "-c", `sandbox_mode="${options.sandbox}"`];
  // The agent never needs the network: it writes one file and runs a local check.
  if (options.sandbox === "workspace-write") args.push("-c", "sandbox_workspace_write.network_access=false");
  const model = options.model || CODEX.model;
  if (model) args.push("-m", model);
  if (options.effort) args.push("-c", `model_reasoning_effort="${options.effort}"`);
  if (options.ephemeral) args.push("--ephemeral");
  if (options.schema) args.push("--output-schema", options.schema);
  if (options.resume) {
    args.push("resume", options.resume);
    for (const image of options.images || []) args.push("-i", image);
    args.push("-o", lastFile, "-");
  } else {
    args.push("-C", options.cwd, "-o", lastFile);
  }
  return args;
}

/** Codex processes we started; they are stopped when the server stops, so none are left running. */
const children = new Set<ReturnType<typeof spawn>>();
let hooked = false;
function hookShutdown() {
  if (hooked) return;
  hooked = true;
  const stopAll = () => {
    for (const child of children) child.kill("SIGTERM");
  };
  process.on("exit", stopAll);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      stopAll();
      process.exit(0);
    });
  }
}

const TRANSIENT = /capacity|rate.?limit|overloaded|temporar|try again|too many requests|\b(429|500|502|503|504)\b|stream (disconnected|error)|connection (reset|closed)/i;

/**
 * Runs one `codex exec` turn and retries it when the service is briefly unavailable
 * ("Selected model is at capacity", rate limits): 30 s, 90 s, then 180 s apart.
 */
export async function runCodex(options: CodexOptions): Promise<CodexResult> {
  const waits = [30000, 90000, 180000];
  const fallbacks = fallbackModels();
  for (let attempt = 0; ; attempt++) {
    const result = await runCodexOnce(options);
    if (result.ok || options.signal?.aborted || attempt >= waits.length || !TRANSIENT.test(result.error || "")) return result;
    // a model at capacity: after one patient retry, move on to the next model the plan offers
    if (/capacity/i.test(result.error || "") && attempt >= 1 && fallbacks.length) options = { ...options, model: fallbacks[(attempt - 1) % fallbacks.length] };
    options.onActivity?.(`Codex is busy (${(result.error || "").slice(0, 80)}); retrying in ${waits[attempt] / 1000} s`);
    await new Promise((done) => setTimeout(done, waits[attempt]));
    if (options.signal?.aborted) return result;
    // a turn that already started a thread continues it rather than starting over
    if (result.threadId && !options.resume && !options.ephemeral) options = { ...options, resume: result.threadId, prompt: "Continue where you left off." };
  }
}

/** Models to fall back to when the configured one is at capacity: CODEX_FALLBACK_MODELS, else the next listed models in Codex's cache. */
export function fallbackModels(): string[] {
  if (CODEX.fallbackModels.length) return CODEX.fallbackModels;
  try {
    const cache = JSON.parse(readFileSync(join(homedir(), ".codex", "models_cache.json"), "utf8"));
    const list: { slug?: string; visibility?: string }[] = Array.isArray(cache) ? cache : cache.models || cache.data || [];
    const visible = list.filter((m) => m.slug && m.visibility !== "hide").map((m) => m.slug!);
    const current = CODEX.model || configuredModel();
    const at = visible.indexOf(current);
    return (at >= 0 ? visible.slice(at + 1) : visible.filter((m) => m !== current)).slice(0, 2);
  } catch {
    return [];
  }
}
function configuredModel(): string {
  try {
    return readFileSync(join(homedir(), ".codex", "config.toml"), "utf8").match(/^model\s*=\s*"([^"]+)"/m)?.[1] || "";
  } catch {
    return "";
  }
}

function runCodexOnce(options: CodexOptions): Promise<CodexResult> {
  const lastFile = join(options.cwd, `.codex-last-${Date.now()}.txt`);
  const args = codexArgs(options, lastFile);
  return new Promise((resolve) => {
    hookShutdown();
    const child = spawn(CODEX.bin, args, { cwd: options.cwd, env: { ...process.env, NO_COLOR: "1" }, stdio: ["pipe", "pipe", "pipe"] });
    children.add(child);
    const result: CodexResult = { ok: false, lastMessage: "", exitCode: null, commands: 0 };
    let buffer = "";
    let stderr = "";
    let settled = false;
    // "error" events can be notices ("Reconnecting... 2/5"); only a failed turn, or an error with no
    // completed turn after it, fails the run
    let softError = "";
    let completed = false;
    const finish = (patch: Partial<CodexResult>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      Object.assign(result, patch);
      if (existsSync(lastFile)) result.lastMessage = readFileSync(lastFile, "utf8").trim() || result.lastMessage;
      result.ok = result.exitCode === 0 && !result.error;
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 4000);
      finish({ error: `codex timed out after ${Math.round((options.timeoutMs ?? CODEX.timeoutMs) / 60000)} min` });
    }, options.timeoutMs ?? CODEX.timeoutMs);
    options.signal?.addEventListener("abort", () => {
      child.kill("SIGTERM");
      finish({ error: "cancelled" });
    });
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        if (options.log) {
          try {
            appendFileSync(options.log, `${line}\n`);
          } catch (error) {
            // the demo was deleted mid-run (its folder is gone): stop Codex and fail this turn
            result.error = `log unavailable: ${(error as Error).message}`;
            child.kill("SIGTERM");
            options.log = undefined;
          }
        }
        let event: Record<string, any>;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "thread.started") result.threadId = event.thread_id;
        if (event.type === "turn.completed") {
          result.usage = event.usage;
          completed = true;
        }
        if (event.type === "turn.failed") result.error = short(event.error?.message || event.message || "codex reported an error", 400);
        if (event.type === "error") softError = short(event.message || event.error?.message || "codex reported an error", 400);
        if (event.item?.type === "agent_message" && event.type === "item.completed") result.lastMessage = event.item.text || result.lastMessage;
        if (event.item?.type === "command_execution" && event.type === "item.started") result.commands++;
        const text = describe(event);
        if (text) {
          try {
            options.onActivity?.(text);
          } catch {}
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on("error", (error) => finish({ error: `could not start codex: ${error.message}` }));
    child.on("close", (code) => {
      children.delete(child);
      if (!completed && !result.error && softError) result.error = softError;
      if (code !== 0 && !result.error) result.error = short(stderr.split("\n").filter(Boolean).slice(-3).join(" ") || `codex exited with ${code}`, 400);
      finish({ exitCode: code });
    });
    child.stdin.end(options.prompt);
  });
}

export interface CodexStatus {
  installed: boolean;
  version?: string;
  loggedIn: boolean;
  detail?: string;
}

let cached: { at: number; status: CodexStatus } | null = null;
export function codexStatus(): CodexStatus {
  if (cached && Date.now() - cached.at < 60000) return cached.status;
  const version = spawnSync(CODEX.bin, ["--version"], { encoding: "utf8", timeout: 10000 });
  let status: CodexStatus;
  if (version.status !== 0) status = { installed: false, loggedIn: false, detail: "Install the Codex CLI: npm i -g @openai/codex" };
  else {
    const login = spawnSync(CODEX.bin, ["login", "status"], { encoding: "utf8", timeout: 10000 });
    const text = `${login.stdout || ""}${login.stderr || ""}`.trim();
    status = { installed: true, version: version.stdout.trim(), loggedIn: login.status === 0 && !/not logged in/i.test(text), detail: text.split("\n")[0] };
  }
  cached = { at: Date.now(), status };
  return status;
}
