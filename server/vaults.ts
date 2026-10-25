/* The learner's vaults, from the app's side: what each holds, making one (with books brought along and
 * the learner's profile), opening one, and deleting one (the list itself is vault/vaults.ts).
 *
 * Opening a vault happens at startup and when the learner opens another one (no restart). Closing the
 * one that was open first settles it: the change in progress is closed in its history, the reading
 * sittings and pending indexes are written, the agent's runs are stopped, and the watcher stops. Its
 * other work (model calls, figures being drawn) is stopped with its visit (vault/current.ts) and starts
 * again, from what its files say, the next time it is opened. Then the new vault is set up as on
 * startup, its interrupted work is picked up, and open pages hear of it (they load the new vault). */
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { prepareAgents, stopRuns } from "./agents/index.ts";
import { resumeAnnotations } from "./annotations/index.ts";
import { shareInto } from "./books/shared.ts";
import { RUNS_DIR } from "./config.ts";
import { publish } from "./events.ts";
import { safeJoin } from "./fs.ts";
import { resumeInterrupted } from "./handbuilt/index.ts";
import { queue } from "./jobs.ts";
import { endReading } from "./learn/reading.ts";
import { resumeFigures } from "./scene/figures.ts";
import { checkpoint, currentVault, docs, enterVault, initVault, inVisit, vaultDir } from "./vault/index.ts";
import { finishIndexing, startIndexing } from "./vault/indexes.ts";
import { exportMissingBooks } from "./vault/library.ts";
import {
  addVault,
  findVault,
  listVaults,
  rememberOpen,
  removeVault,
  type VaultEntry,
  vaultPath,
} from "./vault/vaults.ts";
import { stopWatching } from "./vault/watch.ts";

/* ---------------- what each holds ---------------- */

export interface VaultSummary extends VaultEntry {
  open: boolean;
  /** Its folder, in full. */
  path: string;
  books: number;
  notes: number;
  cards: number;
  concepts: number;
}

/** The Markdown files under a folder of a vault that isn't open (its generated index aside). */
function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md") n++;
  }
  return n;
}

/** How many books a vault's library holds. */
function countBooks(path: string): number {
  const library = join(path, "library");
  if (!existsSync(library)) return 0;
  return readdirSync(library).filter((name) => existsSync(join(library, name, "book.json"))).length;
}

/** Every vault, with what it holds (the open one from memory, the others from their folders). */
export function vaultSummaries(): VaultSummary[] {
  const openId = currentVault().id;
  return listVaults().map((vault) => {
    const path = vaultPath(vault);
    const open = vault.id === openId;
    return {
      ...vault,
      open,
      path,
      books: countBooks(path),
      notes: open ? docs.count("note") : countFiles(join(path, "notes")),
      cards: open ? docs.count("card") : countFiles(join(path, "cards")),
      concepts: open ? docs.count("concept") : countFiles(join(path, "concepts")),
    };
  });
}

/* ---------------- making and deleting ---------------- */

/** Makes a new vault, with these books (from any vault: linked, not copied) and the learner's profile
 * from the open one. It isn't opened (openVault does that). */
export function makeVault(name: string, bookIds: string[] = []): VaultEntry {
  const vault = addVault(name);
  const path = vaultPath(vault);
  shareInto(vault, bookIds);
  // the same learner: who they are and how they learn come along (changed in the new vault, it's its own)
  const profile = join(vaultDir(), "profile.md");
  if (existsSync(profile)) copyFileSync(profile, join(path, "profile.md"));
  return vault;
}

/** Deletes a vault for good (not the open one): its folder, and its agents' scratch copies. A book it
 * shares with another vault stays there. */
export function deleteVault(id: string) {
  removeVault(id);
  const runs = safeJoin(RUNS_DIR, id);
  if (runs && runs !== RUNS_DIR && existsSync(runs) && statSync(runs).isDirectory())
    rmSync(runs, { recursive: true, force: true });
}

/* ---------------- opening ---------------- */

/** Sets up the open vault and picks up what was left unfinished in it. */
function prepare() {
  initVault();
  exportMissingBooks();
  startIndexing();
  resumeAnnotations();
  resumeInterrupted();
  resumeFigures();
  prepareAgents();
}

/** At startup: opens the vault that was open last. Throws when jj is missing (the vault needs it). */
export const openAtStart = () => inVisit(prepare);

/** Settles the open vault before another one is opened (in its own visit, while it is still open). */
function close() {
  stopRuns();
  endReading();
  try {
    finishIndexing();
  } catch (error) {
    console.warn("[vault] could not write the indexes:", (error as Error).message);
  }
  checkpoint();
  stopWatching();
}

/** Opens another vault, closing the one open now; returns it. If it can't be set up, the one that was
 * open is opened again and the error thrown. */
export function openVault(id: string): VaultEntry {
  const vault = findVault(id);
  if (!vault) throw new Error("no such vault");
  const was = currentVault();
  if (vault.id === was.id) return vault;
  inVisit(close);
  const open = (entry: VaultEntry) =>
    enterVault(entry, () => {
      // pages hear of it before anything the new vault says while it is set up
      publish("global", { type: "vault-open", data: { id: entry.id, name: entry.name } });
      // the closed vault's jobs stop with it (aborted from here, their ends belong to its visit)
      queue.stopAll();
      prepare();
      rememberOpen(entry.id);
    });
  try {
    open(vault);
  } catch (error) {
    open(was);
    throw error;
  }
  return vault;
}
