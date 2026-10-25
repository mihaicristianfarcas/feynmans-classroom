/* Edits made outside the app (in an editor, in Obsidian, by jj bringing an agent's work in or taking
 * it out) are picked up here: the changed file is re-read as a document, noted in the change in
 * progress, and announced. */
import { existsSync, type FSWatcher, statSync, watch } from "node:fs";
import { join } from "node:path";
import { takeSelfWrite, touched } from "./changes.ts";
import { vaultDir, vaultState } from "./current.ts";
import { docs, isGenerated } from "./docs.ts";
import { changed } from "./jj.ts";
import { forgetLog } from "./logs.ts";

/** Re-reads a file (after an outside edit, or a merge): a document's, or a log's. */
export function reloadFile(rel: string): boolean {
  forgetLog(rel);
  const isDoc = docs.owns(rel);
  if (isDoc) docs.loadFile(rel);
  return isDoc || rel.startsWith("log/");
}

const watching = vaultState(() => ({
  watcher: null as FSWatcher | null,
  debounce: new Map<string, ReturnType<typeof setTimeout>>(),
}));

/** Watches the vault for edits made outside the app and loads them (debounced per file). */
export function startWatching() {
  const state = watching();
  if (state.watcher) return;
  const { debounce } = state;
  try {
    state.watcher = watch(vaultDir(), { recursive: true }, (_event, file) => {
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
          // a folder that appeared, moved or went: rescan what lives in it (the files in it are the change)
          const full = join(vaultDir(), rel);
          if ((existsSync(full) && statSync(full).isDirectory()) || (!existsSync(full) && !/\.\w+$/.test(rel))) {
            docs.loadDir(rel);
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

/** Stops watching (the vault is being closed); edits made from now on are read when it is opened again. */
export function stopWatching() {
  const state = watching();
  state.watcher?.close();
  state.watcher = null;
  for (const timer of state.debounce.values()) clearTimeout(timer);
  state.debounce.clear();
}
