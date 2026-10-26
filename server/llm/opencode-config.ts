/* What the platform takes from OpenCode's own setup, and the configuration a run gets instead. A run
 * never loads the learner's OpenCode config as it is: its plugins, MCP servers, agents, shell and
 * permissions would change what an agent may do. It gets a config of its own, with one agent (our
 * system prompt and permission rules), carrying over only the learner's models and providers. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** The agent every run uses. */
export const AGENT = "classroom";

/** One permission rule; OpenCode applies the last that matches. */
export interface Rule {
  action: string;
  resource: string;
  effect: "allow" | "deny";
}

/** Rules that allow what is listed and nothing else (no tool, no folder outside the run's own). */
export function only(allowed: { action: string; resource?: string }[]): Rule[] {
  return [
    { action: "*", resource: "*", effect: "deny" },
    ...allowed.map((a) => ({ action: a.action, resource: a.resource || "*", effect: "allow" as const })),
  ];
}

/** Parses JSON with comments and trailing commas (OpenCode's config files are JSONC). */
export function parseJsonc(text: string): unknown {
  const out: string[] = [];
  // the index of the last comma written, while only space follows it
  let comma = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      out.push(text.slice(i, end + 1));
      i = end;
      comma = -1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else {
      if ((c === "}" || c === "]") && comma >= 0) out[comma] = "";
      if (c === ",") comma = out.length;
      else if (!/\s/.test(c)) comma = -1;
      out.push(c);
    }
  }
  return JSON.parse(out.join(""));
}

/** The learner's OpenCode config folder, by OpenCode's own rule. */
function userConfigDir() {
  return process.env.OPENCODE_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode");
}

/** What a run carries over from the learner's config: which models, and how to reach them. */
const CARRIED = ["model", "small_model", "provider", "providers", "enabled_providers", "disabled_providers"];

/** The learner's models and providers from their global OpenCode config ({} when there is none). A
 * `{file:…}` path in it is made absolute, as the run reads it from elsewhere. */
export function learnerConfig(): Record<string, unknown> {
  const dir = userConfigDir();
  const merged: Record<string, unknown> = {};
  for (const name of ["config.json", "opencode.json", "opencode.jsonc"]) {
    try {
      Object.assign(merged, parseJsonc(readFileSync(join(dir, name), "utf8")));
    } catch {}
  }
  const carried = Object.fromEntries(CARRIED.filter((key) => key in merged).map((key) => [key, merged[key]]));
  return JSON.parse(
    JSON.stringify(carried).replace(/\{file:([^}]+)\}/g, (all, path: string) =>
      path.startsWith("~") || isAbsolute(path) ? all : `{file:${join(dir, path)}}`,
    ),
  );
}

/** The model the learner's OpenCode config names ("" when none). */
export function opencodeConfiguredModel(): string {
  const model = learnerConfig().model;
  return typeof model === "string" ? model : "";
}

export interface RunSetup {
  system: string;
  permissions: Rule[];
  /** The shell for its commands (an agent's sandboxed one). */
  shell?: string;
  /** Instruction files to read first (an agent's AGENTS.md). */
  instructions?: string[];
}

/** A run's whole config: the learner's models and providers, our one agent, and nothing that would run
 * on its own (no snapshots, formatters, language servers, sharing or update checks). */
export function opencodeConfig(setup?: RunSetup): Record<string, unknown> {
  return {
    $schema: "https://opencode.ai/config.json",
    ...learnerConfig(),
    snapshots: false,
    share: "disabled",
    autoupdate: false,
    formatter: false,
    lsp: false,
    instructions: setup?.instructions || [],
    ...(setup?.shell ? { shell: setup.shell } : {}),
    ...(setup
      ? {
          default_agent: AGENT,
          agents: { [AGENT]: { mode: "primary", system: setup.system, permissions: setup.permissions } },
        }
      : {}),
  };
}
