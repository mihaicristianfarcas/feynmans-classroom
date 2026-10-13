/* What the platform reads from the Codex CLI's own configuration in ~/.codex: the model it defaults
 * to (config.toml) and the models the learner's plan offers (models_cache.json, which Codex keeps). */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CODEX } from "../config.ts";

interface CodexModel {
  slug: string;
  description?: string;
}

/** The models Codex lists for this account, in its order (hidden ones left out). */
export function codexModels(): CodexModel[] {
  try {
    const cache = JSON.parse(readFileSync(join(homedir(), ".codex", "models_cache.json"), "utf8"));
    const list: { slug?: string; visibility?: string; description?: string }[] = Array.isArray(cache)
      ? cache
      : cache.models || cache.data || [];
    return list
      .filter((m) => m.slug && m.visibility !== "hide")
      .map((m) => ({ slug: m.slug!, description: m.description }));
  } catch {
    return [];
  }
}

let configured: string | null = null;
/** The model in ~/.codex/config.toml ("" when none is set). Read once. */
export function codexConfiguredModel(): string {
  if (configured === null) {
    try {
      const toml = readFileSync(join(homedir(), ".codex", "config.toml"), "utf8");
      configured = /^\s*model\s*=\s*"([^"]+)"/m.exec(toml)?.[1] || "";
    } catch {
      configured = "";
    }
  }
  return configured;
}

/** Codex's "fast and affordable" model (figures in about 15 s instead of a minute), or "". */
export function fastCodexModel(): string {
  const models = codexModels();
  return (
    models.find((m) => /luna|mini|fast/i.test(m.slug) || /fast and affordable/i.test(m.description || ""))?.slug || ""
  );
}

/** Models to try when the configured one is at capacity: CODEX_FALLBACK_MODELS, else the next two Codex lists. */
export function fallbackModels(): string[] {
  if (CODEX.fallbackModels.length) return CODEX.fallbackModels;
  const slugs = codexModels().map((m) => m.slug);
  const current = CODEX.model || codexConfiguredModel();
  const at = slugs.indexOf(current);
  return (at >= 0 ? slugs.slice(at + 1) : slugs.filter((m) => m !== current)).slice(0, 2);
}
