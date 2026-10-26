/* OpenCode (2 or later) as a provider: each call is one `opencode run --standalone` (a private server,
 * not the learner's background service) with their OpenCode login: no API key passes through here. The
 * run gets a config of its own (opencode-config.ts): one agent with our system prompt and permission
 * rules, and no plugins, MCP servers or project config; its session is deleted when it ends, so none
 * is kept (as Codex's --ephemeral). Calls get no tools (web search and fetch when asked to search) and
 * see pictures as attached files; agents get only OpenCode's shell, which runs every command under the
 * OS sandbox (sandboxedShell). Also reports whether OpenCode is installed, which accounts it has
 * connected, and the models it offers. */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OPENCODE } from "../config.ts";
import { friendlyCommand, short } from "./codex.ts";
import type { CallOptions } from "./index.ts";
import { parseJsonLoose } from "./json.ts";
import { AGENT, only, opencodeConfig } from "./opencode-config.ts";
import { type Confinement, sandboxedShell } from "./sandbox.ts";
import { SYSTEM } from "./system.ts";

export interface OpencodeRun extends CallOptions {
  /** provider/model ("" for OpenCode's default). */
  model: string;
  /** The model's variant (its reasoning effort). */
  effort?: string;
  schema?: object;
  /** An agent's folder and what it may do there: the run gets the sandboxed shell. Without, no tools. */
  confine?: Confinement;
}

/** What one `opencode run` came back with: its session, its answer (the last step's text), or what went wrong. */
interface Turn {
  session?: string;
  text: string;
  error?: string;
}

/** One line of `opencode run --format json` (the fields the platform reads). */
interface OpencodeEvent {
  type?: string;
  sessionID?: string;
  part?: { text?: string; tool?: string; state?: { input?: Record<string, unknown> } };
  error?: { type?: string; message?: string };
}

const TITLE = "Feynman's Classroom";

/** The arguments of one run (the prompt goes in on stdin). */
export function opencodeArgs(run: { model?: string; variant?: string; session?: string; images?: string[] }): string[] {
  // a title of our own spares the model call OpenCode would make to name the session
  const args = ["run", "--standalone", "--format", "json", "--agent", AGENT, "--title", TITLE];
  if (run.model) args.push("-m", run.variant ? `${run.model}#${run.variant}` : run.model);
  if (run.session) args.push("--session", run.session);
  for (const image of run.images || []) args.push("-f", image);
  return args;
}

/** The prompt, asking for JSON that matches `schema` (OpenCode's run has no structured output of its own). */
export function withSchema(prompt: string, schema: object): string {
  return `${prompt}\n\nAnswer with one JSON value that matches this JSON Schema, and nothing else (no prose, no code fence):\n${JSON.stringify(schema)}`;
}

/** What an event says, in a few words, for the progress line. */
function describe(event: OpencodeEvent): string | null {
  const part = event.part;
  if (event.type === "text" && part?.text) return short(part.text);
  if (event.type !== "tool_use" || !part) return null;
  const input = part.state?.input || {};
  if (part.tool === "shell") return friendlyCommand(String(input.command || ""));
  if (part.tool === "websearch") return "searching the web";
  if (part.tool === "webfetch") {
    try {
      return `reading ${new URL(String(input.url)).host}`;
    } catch {
      return "reading a page";
    }
  }
  return null;
}

/** The environment of an OpenCode process: the config in `configDir` and nothing else (the learner's
 * own, and any they point OpenCode at, left out), no project config or Claude Code files, no file
 * watcher, no update check. */
function envFor(configDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: "1",
    OPENCODE_CONFIG_DIR: configDir,
    OPENCODE_CONFIG_PROJECT_DISABLE: "1",
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_FILEWATCHER_DISABLE: "1",
    OPENCODE_DISABLE_FILEWATCHER: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
  };
  for (const key of ["OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "OPENCODE_PERMISSION"]) delete env[key];
  return env;
}

let base: string | null = null;
/** A config of the learner's models and providers alone, for the commands that only ask OpenCode
 * something (accounts, models, deleting a session). Its folder, made once, is also where they run. */
function baseConfig(): { dir: string; env: NodeJS.ProcessEnv } {
  if (!base) {
    base = realpathSync(mkdtempSync(join(tmpdir(), "classroom-opencode-")));
    hookShutdown();
  }
  writeFileSync(join(base, "opencode.json"), JSON.stringify(opencodeConfig()));
  return { dir: base, env: { ...envFor(base), PWD: base } };
}

/** Where calls without a folder of their own run: always the same one, as OpenCode keeps a project for
 * each folder it is run in. */
function callsDir() {
  const dir = join(tmpdir(), "classroom-opencode-calls");
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

/** Runs going now, with their sessions: stopped, and the sessions deleted, when the server stops. */
const live = new Map<ReturnType<typeof spawn>, { session?: string }>();
let hooked = false;
function hookShutdown() {
  if (hooked) return;
  hooked = true;
  process.on("exit", () => {
    for (const [child, run] of live) {
      child.kill("SIGTERM");
      if (!run.session) continue;
      const { dir, env } = baseConfig();
      spawnSync(OPENCODE.bin, ["session", "delete", "--standalone", run.session], { cwd: dir, env, timeout: 5000 });
    }
    if (base) rmSync(base, { recursive: true, force: true });
  });
}

/** Deletes sessions, so none is left in the learner's OpenCode history. */
async function deleteSessions(ids: string[]) {
  const { dir, env } = baseConfig();
  for (const id of ids)
    await new Promise<void>((done) => {
      const child = spawn(OPENCODE.bin, ["session", "delete", "--standalone", id], { cwd: dir, env, stdio: "ignore" });
      child.on("error", () => done());
      child.on("close", () => done());
    });
}

/** One `opencode run`: it ends when the process does (a timeout or a cancel stops it first). */
function runOnce(args: string[], prompt: string, cwd: string, env: NodeJS.ProcessEnv, options: OpencodeRun) {
  return new Promise<Turn>((resolve) => {
    hookShutdown();
    // OpenCode takes its folder from PWD, not from where it was started
    const child = spawn(OPENCODE.bin, args, { cwd, env: { ...env, PWD: cwd }, stdio: ["pipe", "pipe", "pipe"] });
    const run: { session?: string } = {};
    live.set(child, run);
    const turn: Turn = { text: "" };
    // the text of the step going on: the answer is the last step's
    let step: string[] = [];
    let buffer = "";
    let stderr = "";
    const stop = (error: string) => {
      turn.error ||= error;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 4000).unref();
    };
    const ms = options.timeoutMs ?? 5 * 60 * 1000;
    const timer = setTimeout(() => stop(`opencode timed out after ${Math.round(ms / 60000)} min`), ms);
    const cancel = () => stop("cancelled");
    if (options.signal?.aborted) cancel();
    options.signal?.addEventListener("abort", cancel, { once: true });
    const read = (line: string) => {
      if (!line.trim()) return;
      if (options.log) {
        try {
          appendFileSync(options.log, `${line}\n`);
        } catch {}
      }
      let event: OpencodeEvent;
      try {
        event = JSON.parse(line) as OpencodeEvent;
      } catch {
        return;
      }
      run.session ||= event.sessionID;
      if (event.type === "step_start") step = [];
      if (event.type === "text" && event.part?.text) {
        step.push(event.part.text);
        turn.text = step.join("\n\n");
      }
      if (event.type === "error")
        turn.error ||= short(event.error?.message || event.error?.type || "opencode reported an error", 400);
      const text = describe(event);
      if (text) {
        try {
          options.onActivity?.(text);
        } catch {}
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // the last piece is a line still being written
      for (const line of lines) read(line);
    });
    child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString("utf8")).slice(-8000)));
    child.stdin.on("error", () => {}); // it may exit before reading the prompt
    const done = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      live.delete(child);
      turn.session = run.session;
      resolve(turn);
    };
    child.on("error", (error) => {
      turn.error ||= `could not start opencode: ${error.message}`;
      done();
    });
    child.on("close", (code) => {
      read(buffer);
      if (code !== 0 && !turn.error)
        turn.error = short(
          stderr.split("\n").filter(Boolean).slice(-3).join(" ") || `opencode exited with ${code}`,
          400,
        );
      done();
    });
    options.onActivity?.("OpenCode is thinking");
    child.stdin.end(prompt);
  });
}

/** Models whose variant OpenCode refused ("model#variant"): asked for without one from then on. */
const noVariant = new Set<string>();

/** One OpenCode call: the answer's text, and the JSON in it when a schema was given (asked for once
 * more, in the same session, when the first answer isn't JSON). Throws when OpenCode fails. */
export async function runOpencode(options: OpencodeRun): Promise<{ text: string; structured?: unknown }> {
  // the run's own folder, which its commands can't write but for tmp/: its config, and an agent's shell
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "classroom-opencode-")));
  const tmp = join(scratch, "tmp");
  mkdirSync(tmp);
  const sessions = new Set<string>();
  try {
    const confine = options.confine;
    const agentsFile = confine && join(confine.cwd, "AGENTS.md");
    const config = opencodeConfig({
      system: SYSTEM,
      // an agent: the shell, and its commands may name the folders it reads and its temp folder (the
      // sandbox has the last word); a call: nothing, or the web when it searches
      permissions: confine
        ? only([
            { action: "shell" },
            ...[...(confine.readRoots || []), tmp].flatMap((root) => [
              { action: "external_directory", resource: root },
              { action: "external_directory", resource: join(root, "*") },
            ]),
          ])
        : only(options.search ? [{ action: "websearch" }, { action: "webfetch" }] : []),
      shell: confine && sandboxedShell(confine, scratch, tmp),
      instructions: agentsFile && existsSync(agentsFile) ? [agentsFile] : [],
    });
    mkdirSync(join(scratch, "config"));
    writeFileSync(join(scratch, "config", "opencode.json"), JSON.stringify(config));
    const env = envFor(join(scratch, "config"));
    const cwd = confine?.cwd || callsDir();
    const ask = async (prompt: string, session?: string) => {
      const images = session ? [] : options.images;
      const refused = `${options.model}#${options.effort}`;
      const variant = options.effort && !noVariant.has(refused) ? options.effort : undefined;
      let turn = await runOnce(
        opencodeArgs({ model: options.model, variant, session, images }),
        prompt,
        cwd,
        env,
        options,
      );
      if (turn.session) sessions.add(turn.session);
      if (variant && /variant unavailable/i.test(turn.error || "")) {
        noVariant.add(refused);
        turn = await runOnce(opencodeArgs({ model: options.model, session, images }), prompt, cwd, env, options);
        if (turn.session) sessions.add(turn.session);
      }
      if (turn.error) throw new Error(`opencode: ${turn.error}`);
      return turn;
    };
    const first = await ask(options.schema ? withSchema(options.prompt, options.schema) : options.prompt);
    if (!options.schema) return { text: first.text };
    try {
      return { text: first.text, structured: parseJsonLoose(first.text) };
    } catch {
      const again = await ask(
        "That answer wasn't valid JSON. Reply with only the JSON value the schema asks for, nothing else.",
        first.session,
      );
      try {
        return { text: again.text, structured: parseJsonLoose(again.text) };
      } catch {
        throw new Error("opencode returned something unreadable");
      }
    }
  } finally {
    await deleteSessions([...sessions]);
    rmSync(scratch, { recursive: true, force: true });
  }
}

export interface OpencodeStatus {
  installed: boolean;
  version?: string;
  /** The integrations it has an account or key for (OpenAI, Anthropic…); its free models need none. */
  accounts: string[];
  detail?: string;
}

let cached: { at: number; status: OpencodeStatus } | null = null;
/** Whether OpenCode 2 is installed, and what it is connected to (checked at most once a minute). */
export function opencodeStatus(): OpencodeStatus {
  if (cached && Date.now() - cached.at < 60000) return cached.status;
  const run = spawnSync(OPENCODE.bin, ["--version"], { encoding: "utf8", timeout: 10000 });
  const version = run.status === 0 ? run.stdout.trim() : "";
  let status: OpencodeStatus;
  if (!version) status = { installed: false, accounts: [], detail: "Install OpenCode: npm i -g @opencode/cli" };
  else if (Number(/(\d+)\.\d+/.exec(version)?.[1]) < 2)
    status = { installed: false, version, accounts: [], detail: "This needs OpenCode 2: run opencode upgrade --major" };
  else status = { installed: true, version, accounts: accounts() };
  cached = { at: Date.now(), status };
  return status;
}

/** The integrations OpenCode holds credentials for, by name (never the credentials). */
function accounts(): string[] {
  const { dir, env } = baseConfig();
  const run = spawnSync(OPENCODE.bin, ["auth", "list", "--standalone", "--format", "json"], {
    cwd: dir,
    env,
    encoding: "utf8",
    timeout: 15000,
  });
  try {
    const list = JSON.parse(run.stdout) as { id?: string; name?: string; connections?: unknown[] }[];
    return list
      .filter((i) => i.connections?.length)
      .map((i) => i.name || i.id || "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

let models: { at: number; list: Promise<string[]> } | null = null;
/** The models OpenCode offers this learner (provider/model), listed at most every ten minutes. */
export function opencodeModels(): Promise<string[]> {
  if (models && Date.now() - models.at < 10 * 60 * 1000) return models.list;
  const list = new Promise<string[]>((resolve) => {
    const { dir, env } = baseConfig();
    const child = spawn(OPENCODE.bin, ["models", "--standalone"], {
      cwd: dir,
      env,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    child.on("error", () => resolve([]));
    child.on("close", () =>
      resolve(
        out
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => /^[^\s/]+\/\S+$/.test(line)),
      ),
    );
  });
  models = { at: Date.now(), list };
  // a failed listing (OpenCode missing, or busy) is tried again next time
  list.then((found) => {
    if (!found.length) models = null;
  });
  return list;
}
