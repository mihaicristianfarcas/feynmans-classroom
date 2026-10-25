/* One door to the model, whichever subscription is behind it.
 *
 *   structured()  JSON that matches a schema (figures, cards, quizzes, grading): one quick turn
 *   text()        a plain answer (tutor replies, explanations)
 *   agent()       an agent with a real shell (rg, sed, ls, jq…) in a folder: read-only, or allowed to
 *                 write there and nowhere else
 *
 * Agents run inside the CLI's own OS sandbox (Seatbelt on macOS, bubblewrap/Landlock on Linux): they
 * can read only their folder (plus system tools), write only their folder when allowed, never touch
 * .git, and have no network. Codex gets a custom permission profile; Claude Code runs restricted with
 * its sandbox settings. (Both verified: tests/agent-sandbox.test.ts.)
 *
 * Codex runs as `codex exec` (ChatGPT login); Claude Code as `claude -p` (Claude subscription).
 * Neither needs an API key. Calls share a small concurrency limit so a burst of requests never
 * hammers the user's plan. A call stops when the vault it was made for is closed (VaultClosed). */
import { activeProvider, getSettings, type Provider } from "../settings.ts";
import { VaultClosed, visitSignal } from "../vault/current.ts";
import { runClaude } from "./claude.ts";
import { callCodex } from "./codex-call.ts";
import { codexConfiguredModel } from "./codex-config.ts";
import { parseJsonLoose } from "./json.ts";
import { slot } from "./limit.ts";
import { type Confinement, claudeSandbox, codexProfile } from "./sandbox.ts";

export { llmLoad } from "./limit.ts";

/** "fast": quick, cheap work (figures, cards, grading); "smart": the learner's careful model (agents). */
export type Tier = "fast" | "smart";

export interface CallOptions {
  prompt: string;
  tier?: Tier;
  /** Overrides the tier's effort (low | medium | high). */
  effort?: string;
  signal?: AbortSignal;
  onActivity?: (text: string) => void;
  timeoutMs?: number;
  /** Append the raw event stream here (Codex). */
  log?: string;
  /** Let the model search the web (live). */
  search?: boolean;
  /** Pictures to look at (absolute paths). */
  images?: string[];
}

export interface CallResult<T = string> {
  data: T;
  ms: number;
  provider: Provider;
  model: string;
}

export interface AgentOptions extends CallOptions, Confinement {
  schema?: object;
}

/** The model and effort a tier uses on a provider (Settings). An empty model means the CLI's default. */
function modelFor(provider: Provider, tier: Tier) {
  const s = getSettings();
  const conf = provider === "codex" ? s.codex : s.claude;
  return tier === "fast"
    ? { model: conf.fastModel, effort: conf.fastEffort }
    : { model: conf.smartModel, effort: conf.smartEffort };
}

/** The model a call ran on, by name, for the record ("codex (default)" when even the CLI names none). */
function modelName(provider: Provider, model: string) {
  if (model) return model;
  if (provider === "claude") return "claude (default)";
  return codexConfiguredModel() || "codex (default)";
}

/** The call's options, with a signal of its own that also stops it when the vault it is made for is
 * closed (its own, so the listeners a call adds go with it). */
function untilClosed<O extends CallOptions>(options: O): O {
  return { ...options, signal: AbortSignal.any([visitSignal(), ...(options.signal ? [options.signal] : [])]) };
}

/** Runs one call in a concurrency slot, on the active provider, and times it. */
function call<T>(
  options: CallOptions,
  defaultTier: Tier,
  run: (provider: Provider, model: string, effort: string) => Promise<T>,
): Promise<CallResult<T>> {
  const closed = visitSignal();
  return slot(async () => {
    if (closed.aborted) throw new VaultClosed();
    const provider = activeProvider();
    const { model, effort } = modelFor(provider, options.tier || defaultTier);
    const started = Date.now();
    try {
      const data = await run(provider, model, options.effort || effort);
      return { data, ms: Date.now() - started, provider, model: modelName(provider, model) };
    } catch (error) {
      throw closed.aborted ? new VaultClosed() : error;
    }
  });
}

/** JSON matching `schema` (strict structured output on Codex; --json-schema on Claude Code). */
export function structured<T>(input: CallOptions & { schema: object }): Promise<CallResult<T>> {
  const options = untilClosed(input);
  return call(options, "fast", async (provider, model, effort) => {
    if (provider === "claude") return (await runClaude({ ...options, model, effort })).structured as T;
    return parseJsonLoose(await callCodex({ ...options, model, effort, sandbox: "read-only" })) as T;
  });
}

/** A plain-text answer. */
export function text(input: CallOptions): Promise<CallResult<string>> {
  const options = untilClosed(input);
  return call(options, "fast", async (provider, model, effort) => {
    if (provider === "claude") return (await runClaude({ ...options, model, effort })).text;
    return callCodex({ ...options, model, effort, sandbox: "read-only" });
  });
}

/** An agent with a shell, confined to `cwd` by the CLI's OS sandbox: it reads there (and `readRoots`), writes there only if `write`, no network. */
export function agent(input: AgentOptions): Promise<CallResult<string | unknown>> {
  const options = untilClosed(input);
  return call(options, "smart", async (provider, model, effort) => {
    if (provider === "claude") {
      const tools = options.write
        ? ["Bash", "Read", "Grep", "Glob", "Edit", "Write"]
        : ["Bash", "Read", "Grep", "Glob"];
      const out = await runClaude({
        ...options,
        model,
        effort,
        tools,
        sandbox: claudeSandbox(options),
        restricted: true,
        addDirs: options.readRoots,
      });
      return options.schema ? out.structured : out.text;
    }
    const answer = await callCodex({
      ...options,
      model,
      effort,
      sandbox: "profile",
      config: codexProfile(options),
      timeoutMs: options.timeoutMs ?? 8 * 60 * 1000,
    });
    return options.schema ? parseJsonLoose(answer) : answer;
  });
}
