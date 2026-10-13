/* Settings a self-hoster changes from the app: which subscription does the thinking (Codex or
 * Claude Code), and which model and effort each tier uses. Stored in DATA_DIR/settings.json. */
import { join } from "node:path";
import { CODEX, DATA_DIR } from "./config.ts";
import { readJson, writeJson } from "./fs.ts";
import { claudeStatus } from "./llm/claude.ts";
import { codexStatus } from "./llm/codex.ts";
import { fastCodexModel } from "./llm/codex-config.ts";

export type Provider = "codex" | "claude";

export interface Settings {
  /** "auto": Codex when it is installed and logged in, else Claude Code. */
  provider: Provider | "auto";
  codex: { fastModel: string; fastEffort: string; smartModel: string; smartEffort: string };
  claude: { fastModel: string; fastEffort: string; smartModel: string; smartEffort: string };
  /** Parallel model calls for quick work (figures, cards, quizzes). */
  concurrency: number;
  /** Links the agent finds between notes: "suggest" waits for the learner's OK; "auto" adds them (removable). */
  connections: "suggest" | "auto";
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
  };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    codex: { ...current.codex, ...(patch.codex || {}) },
    claude: { ...current.claude, ...(patch.claude || {}) },
  };
  if (!["auto", "codex", "claude"].includes(next.provider)) next.provider = "auto";
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
  return "codex";
}
