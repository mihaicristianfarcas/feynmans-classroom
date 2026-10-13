/* Edits made outside the app (in an editor, in Obsidian, by jj bringing an agent's work in or taking
 * it out) are picked up here: the changed file is re-read into its collection, noted in the change in
 * progress, and announced. */
import { existsSync, statSync, watch } from "node:fs";
import { join } from "node:path";
import { takeSelfWrite, touched } from "./changes.ts";
import { isGenerated } from "./collection.ts";
import { COLLECTIONS } from "./collections.ts";
import { VAULT } from "./files.ts";
import { changed } from "./jj.ts";
import { forgetLog } from "./logs.ts";

/** Re-reads a file into whichever collection owns it (after an outside edit, or a merge). */
export function reloadFile(rel: string): boolean {
  forgetLog(rel);
  const owner = COLLECTIONS.find((c) => c.owns(rel));
  if (owner) owner.loadFile(rel);
  return !!owner || rel.startsWith("log/");
}

/** Watches the vault for edits made outside the app and loads them (debounced per file). */
export function startWatching() {
  try {
    const debounce = new Map<string, ReturnType<typeof setTimeout>>();
    watch(VAULT, { recursive: true }, (_event, file) => {
      if (!file) return;
      const rel = String(file).replace(/\\/g, "/");
      if (
        rel.startsWith(".git") ||
        rel.startsWith(".jj") ||
        rel.startsWith(".trash") ||
        rel.endsWith(".tmp") ||
        isGenerated(rel) ||
        rel.startsWith("brain/links") ||
        rel.startsWith("brain/unresolved")
      )
        return;
      clearTimeout(debounce.get(rel));
      debounce.set(
        rel,
        setTimeout(() => {
          debounce.delete(rel);
          if (takeSelfWrite(rel)) return;
          // a folder that appeared or moved: rescan what lives in it (the files in it are the change)
          const full = join(VAULT, rel);
          if (existsSync(full) && statSync(full).isDirectory()) {
            for (const c of COLLECTIONS) if (c.dir === rel.split("/")[0]) c.load();
            touched(rel);
            return;
          }
          if (!reloadFile(rel) && !rel.startsWith("brain/") && !rel.startsWith("attachments/")) return;
          changed(`edit ${rel}`);
          touched(rel);
        }, 300),
      );
    });
  } catch (error) {
    console.warn("[vault] not watching for outside edits:", (error as Error).message);
  }
}
