/* The server's side of a synced vault: its copy of the learner's folder, which their browser keeps in
 * step with the folder (web/src/vaults/sync/). Lists every file with its size and time, and reads, writes
 * and deletes single files; the index is updated and the change announced right away. */
import { mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { announceChanges } from "./index.ts";
import type { Vault } from "./vault.ts";

/** Folders the sync leaves out. */
const IGNORED = new Set([".git", "node_modules", ".DS_Store"]);

/** A path inside the vault: no "..", nothing absolute; hidden files allowed (.obsidian, .trash). */
export function syncRel(rel: string): string | null {
  const parts = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== ".");
  if (!parts.length || parts.some((p) => p === ".." || IGNORED.has(p) || /\.\d+\.tmp$/.test(p))) return null;
  return parts.join("/");
}

export interface SyncEntry {
  path: string;
  size: number;
  mtime: number;
}

/** Every file in the copy. */
export function manifest(vault: Vault): SyncEntry[] {
  const out: SyncEntry[] = [];
  const walk = (rel: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(join(vault.root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (!syncRel(child)) continue;
      if (e.isDirectory()) walk(child);
      else if (e.isFile()) {
        const st = statSync(join(vault.root, child));
        out.push({ path: child, size: st.size, mtime: Math.floor(st.mtimeMs) });
      }
    }
  };
  walk("");
  return out;
}

function full(vault: Vault, rel: string) {
  const clean = syncRel(rel);
  if (!clean) throw new Error("that path is outside the vault");
  return { clean, path: join(vault.root, ...clean.split("/")) };
}

/** Re-reads `rel` into the index and tells open pages. */
function settle(vault: Vault, rel: string) {
  // hidden files (Obsidian's settings, the trash) aren't in the index
  if (rel.split("/").some((p) => p.startsWith("."))) return;
  announceChanges(vault.id, vault.reconcile(rel));
}

export function writeFile(vault: Vault, rel: string, bytes: Uint8Array): SyncEntry {
  const { clean, path } = full(vault, rel);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, path);
  settle(vault, clean);
  const st = statSync(path);
  return { path: clean, size: st.size, mtime: Math.floor(st.mtimeMs) };
}

export function deleteFile(vault: Vault, rel: string) {
  const { clean, path } = full(vault, rel);
  try {
    unlinkSync(path);
  } catch {}
  // empty folders left behind go too
  for (let dir = posix.dirname(clean); dir !== "."; dir = posix.dirname(dir))
    try {
      rmdirSync(join(vault.root, dir));
    } catch {
      break;
    }
  settle(vault, clean);
}

export function readPath(vault: Vault, rel: string): string {
  return full(vault, rel).path;
}
