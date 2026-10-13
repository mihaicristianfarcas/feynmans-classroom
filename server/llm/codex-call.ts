/* One Codex turn for structured(), text() and agent(): a scratch folder for the schema file and the
 * pictures, `codex exec` in the given sandbox (ephemeral: no session is kept), and its last message. */
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CodexOptions, runCodex } from "./codex.ts";
import type { CallOptions } from "./index.ts";

export interface CodexCall extends CallOptions {
  model: string;
  effort: string;
  sandbox: CodexOptions["sandbox"];
  /** The working folder (an agent's); a call without one runs in its scratch folder. */
  cwd?: string;
  /** Extra `-c` settings (a permission profile). */
  config?: string[];
  schema?: object;
}

/** Codex splits -i values on commas: give it copies with plain names, in the call's own folder. */
function copyImages(images: string[] | undefined, dir: string): string[] | undefined {
  return images?.map((image, i) => {
    const copy = join(dir, `image-${i + 1}${image.match(/\.[a-z0-9]+$/i)?.[0] || ".png"}`);
    copyFileSync(image, copy);
    return copy;
  });
}

/** Runs the turn and returns Codex's final message; throws when Codex fails. */
export async function callCodex(options: CodexCall): Promise<string> {
  const scratch = mkdtempSync(join(tmpdir(), "classroom-llm-"));
  try {
    let schema: string | undefined;
    if (options.schema) {
      schema = join(scratch, "schema.json");
      writeFileSync(schema, JSON.stringify(options.schema));
    }
    const result = await runCodex({
      cwd: options.cwd ?? scratch,
      prompt: options.prompt,
      sandbox: options.sandbox,
      config: [...(options.config || []), ...(options.search ? ['web_search="live"'] : [])],
      images: copyImages(options.images, scratch),
      schema,
      ephemeral: true,
      model: options.model || undefined,
      effort: options.effort,
      signal: options.signal,
      onActivity: options.onActivity,
      timeoutMs: options.timeoutMs ?? 5 * 60 * 1000,
      log: options.log,
    });
    if (!result.ok) throw new Error(result.error || "no answer from Codex");
    return result.lastMessage;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
