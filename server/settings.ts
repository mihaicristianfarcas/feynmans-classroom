/* Settings a self-hoster changes from the app: which subscription does the thinking (Codex, Claude
 * Code or OpenCode), and which model and effort each tier uses. Stored in DATA_DIR/settings.json. */
import { join } from "node:path";
import { CODEX, DATA_DIR } from "./config.ts";
import { readJson, writeJson } from "./fs.ts";
import { claudeStatus } from "./llm/claude.ts";
import { codexStatus } from "./llm/codex.ts";
import { fastCodexModel } from "./llm/codex-config.ts";
import { opencodeStatus } from "./llm/opencode.ts";

export type Provider = "codex" | "claude" | "opencode";
export const PROVIDERS: Provider[] = ["codex", "claude", "opencode"];

export interface Settings {
  /** "auto": Codex when it is installed and logged in, else Claude Code, else OpenCode. */
  provider: Provider | "auto";
  codex: Tiers;
  claude: Tiers;
  /** Models as provider/model; efforts are the model's variants. */
  opencode: Tiers;
  /** Parallel model calls for quick work (figures, cards, quizzes). */
  concurrency: number;
  /** Links the agent finds between notes: "suggest" waits for the learner's OK; "auto" adds them (removable). */
  connections: "suggest" | "auto";
}

/** The model and effort of the quick and careful tiers on one provider. */
export interface Tiers {
  fastModel: string;
  fastEffort: string;
  smartModel: string;
  smartEffort: string;
}

const FILE = () => join(DATA_DIR, "settings.json");

export const DEFAULT_SETTINGS: Settings = {
  provider: (process.env.LLM_PROVIDER as Provider) || "auto",
  // empty model: whatever ~/.codex/config.toml says
  codex: {
    fastModel: process.env.CODEX_FAST_MODEL || fastCodexModel() || CODEX.model || "",
    fastEffort: process.env.CODEX_FAST_EFFORT || "low",
    smartModel: CODEX.model || "",
    smartEffort: CODEX.planEffort || "medium",
  },
  claude: {
    fastModel: process.env.CLAUDE_FAST_MODEL || "sonnet",
    fastEffort: "low",
    smartModel: process.env.CLAUDE_SMART_MODEL || "opus",
    smartEffort: "medium",
  },
  // empty model: the one the learner's OpenCode config names, else OpenCode's own default
  opencode: {
    fastModel: process.env.OPENCODE_FAST_MODEL || "",
    fastEffort: "low",
    smartModel: process.env.OPENCODE_SMART_MODEL || "",
    smartEffort: "medium",
  },
  concurrency: Number(process.env.LLM_CONCURRENCY) || 3,
  connections: "suggest",
};

export function getSettings(): Settings {
  const saved = readJson<Partial<Settings>>(FILE(), {});
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    codex: { ...DEFAULT_SETTINGS.codex, ...(saved.codex || {}) },
    claude: { ...DEFAULT_SETTINGS.claude, ...(saved.claude || {}) },
    opencode: { ...DEFAULT_SETTINGS.opencode, ...(saved.opencode || {}) },
  };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    codex: { ...current.codex, ...(patch.codex || {}) },
    claude: { ...current.claude, ...(patch.claude || {}) },
    opencode: { ...current.opencode, ...(patch.opencode || {}) },
  };
  if (next.provider !== "auto" && !PROVIDERS.includes(next.provider)) next.provider = "auto";
  next.concurrency = Math.max(1, Math.min(8, Math.round(Number(next.concurrency) || 3)));
  writeJson(FILE(), next);
  return next;
}

/** The provider that will actually run, after "auto" is resolved. */
export function activeProvider(settings = getSettings()): Provider {
  if (settings.provider !== "auto") return settings.provider;
  const codex = codexStatus();
  if (codex.installed && codex.loggedIn) return "codex";
  if (claudeStatus().installed) return "claude";
  if (opencodeStatus().installed) return "opencode";
  return "codex";
}
