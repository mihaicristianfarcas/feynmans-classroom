/* The outside vaults the learner added (Obsidian vaults, or any folder of Markdown): the list, kept in
 * DATA_DIR/vaults.json; adding, renaming and forgetting one (its files are never touched); whether the
 * Notes page leaves out the app's own notes while there are other vaults; and keeping
 * each one's index in step with its folder, so edits made in Obsidian (or by sync, git, any editor)
 * show up in the app by themselves:
 *
 *   - a watcher on each folder re-reads what changed a moment after it settles (atomic saves, sync
 *     tools writing in steps), and announces it on the app's event stream ("vaults");
 *   - every VAULTS_POLL_MS (a minute) the folder is compared with the index anyway, in case the
 *     watcher missed something (network drives, a folder that was away and came back);
 *   - at start, each vault is read afresh, so what changed while the app was closed is there too.
 * Changed notes are snapshotted into the vault's history (history.ts). */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, type FSWatcher, mkdirSync, realpathSync, rmSync, statSync, watch } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve, sep } from "node:path";
import { DATA_DIR, VAULT_DIR } from "../config.ts";
import { NotFound } from "../errors.ts";
import { publish } from "../events.ts";
import { readJson, writeJson } from "../fs.ts";
import { getSettings, saveSettings } from "../settings.ts";
import { dropMeta, noteChanged, startHistory } from "./history.ts";
import { type Change, skipped, Vault } from "./vault.ts";

export interface VaultInfo {
  id: string;
  name: string;
  /** The folder on the server; "" for a synced vault. */
  path: string;
  added: string;
  /** Kept in sync with a folder on the learner's computer by their browser (web/src/vaults/sync/). */
  synced?: boolean;
}

export type VaultStatus = "ready" | "missing";

const FILE = () => join(DATA_DIR, "vaults.json");
const POLL_MS = Number(process.env.VAULTS_POLL_MS) || 60_000;
const SETTLE_MS = 200;

export const listVaults = (): VaultInfo[] => readJson<VaultInfo[]>(FILE(), []);

/** Where a vault's files are on the server: its own folder, or for a synced vault the server's copy. */
export const rootOf = (v: VaultInfo) => (v.synced ? join(DATA_DIR, "vaults", v.id) : v.path);

const live = new Map<string, { vault: Vault; watcher: FSWatcher | null; timers: Map<string, NodeJS.Timeout> }>();
let poller: NodeJS.Timeout | null = null;

/** Tells open pages what changed in a vault. */
function announce(id: string, changes: Change[]) {
  for (const c of changes) publish("global", { type: "vaults", data: { vault: id, ...c } });
  const state = live.get(id);
  if (state && changes.some((c) => /\.md$/i.test(c.path))) noteChanged(state.vault);
}

const statusOf = (path: string): VaultStatus => {
  try {
    return statSync(path).isDirectory() ? "ready" : "missing";
  } catch {
    return "missing";
  }
};

/** Watches a vault's folder; changes are re-read once a path has been quiet for a moment. */
function startWatching(id: string) {
  const state = live.get(id);
  if (!state || state.watcher || statusOf(state.vault.root) !== "ready") return;
  try {
    state.watcher = watch(state.vault.root, { recursive: true }, (_event, file) => {
      if (!file) return;
      const rel = String(file).replace(/\\/g, "/");
      if (skipped(rel)) return;
      clearTimeout(state.timers.get(rel));
      state.timers.set(
        rel,
        setTimeout(() => {
          state.timers.delete(rel);
          // a file is re-read if its size or time changed (the app's own saves are already in the index);
          // a folder that appeared, moved or went is read again whole
          announce(id, state.vault.reconcile(rel));
        }, SETTLE_MS),
      );
    });
    state.watcher.on("error", () => {
      // the folder went away (an unplugged drive, a moved vault): polling picks it up when it's back
      state.watcher?.close();
      state.watcher = null;
    });
  } catch (error) {
    console.warn(`[vaults] not watching ${state.vault.root}:`, (error as Error).message);
  }
}

/** The vault with this id, indexed (read now if it hasn't been). */
export function getVault(id: string): Vault {
  let state = live.get(id);
  if (!state) {
    const info = listVaults().find((v) => v.id === id);
    if (!info) throw new NotFound("no such vault");
    state = { vault: new Vault(info.id, rootOf(info)), watcher: null, timers: new Map() };
    live.set(id, state);
    state.vault.reconcile();
    startWatching(id);
    startHistory(state.vault);
  }
  return state.vault;
}

/** The vaults with what's in them, and whether their folder is there. */
export function vaultsWithStatus() {
  return listVaults().map((v) => {
    const root = rootOf(v);
    const status = statusOf(root);
    const counts = status === "ready" ? getVault(v.id).counts() : { notes: 0, files: 0, folders: 0 };
    return { ...v, status, obsidian: existsSync(join(root, ".obsidian")), ...counts };
  });
}

/** "~/Notes" or a path relative to home, as an absolute, real path. */
function folderPath(input: string): string {
  const raw = input.trim().replace(/^["']|["']$/g, "");
  if (!raw) throw new Error("give the vault's folder");
  const expanded = raw === "~" ? homedir() : raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
  const full = isAbsolute(expanded) ? expanded : resolve(homedir(), expanded);
  if (statusOf(full) !== "ready") throw new Error(`there's no folder at ${full}`);
  return realpathSync(full);
}

const within = (a: string, b: string) => a === b || a.startsWith(b + sep);

export function addVault(input: string, name?: string): VaultInfo {
  const path = folderPath(input);
  const own = existsSync(VAULT_DIR) ? realpathSync(VAULT_DIR) : VAULT_DIR;
  if (within(path, own) || within(own, path))
    throw new Error("that's the app's own vault (or holds it): it's already in Notes");
  const list = listVaults();
  const same = list.find((v) => !v.synced && (within(path, v.path) || within(v.path, path)));
  if (same) throw new Error(`that folder is already part of the vault “${same.name}”`);
  const info: VaultInfo = {
    id: createHash("sha1").update(path).digest("hex").slice(0, 10),
    name: name?.trim() || basename(path),
    path,
    added: new Date().toISOString(),
  };
  writeJson(FILE(), [...list, info]);
  getVault(info.id);
  publish("global", { type: "vaults", data: { vault: info.id, path: "", change: "added" } });
  return info;
}

/** Adds a vault whose files the browser copies here from a folder on the learner's computer and keeps in sync. */
export function addSyncedVault(name: string): VaultInfo {
  if (!name.trim()) throw new Error("give it a name");
  const info: VaultInfo = {
    id: randomBytes(5).toString("hex"),
    name: name.trim(),
    path: "",
    added: new Date().toISOString(),
    synced: true,
  };
  mkdirSync(rootOf(info), { recursive: true });
  writeJson(FILE(), [...listVaults(), info]);
  getVault(info.id);
  publish("global", { type: "vaults", data: { vault: info.id, path: "", change: "added" } });
  return info;
}

export function renameVault(id: string, name: string): VaultInfo {
  const list = listVaults();
  const info = list.find((v) => v.id === id);
  if (!info) throw new NotFound("no such vault");
  if (!name.trim()) throw new Error("give it a name");
  info.name = name.trim();
  writeJson(FILE(), list);
  publish("global", { type: "vaults", data: { vault: id, path: "", change: "changed" } });
  return info;
}

/** Forgets a vault: the app stops showing and watching it. Its folder stays as it is; a synced vault's
 * copy on the server is deleted (the learner's folder is untouched). */
export function removeVault(id: string) {
  const list = listVaults();
  const info = list.find((v) => v.id === id);
  if (!info) throw new NotFound("no such vault");
  writeJson(
    FILE(),
    list.filter((v) => v.id !== id),
  );
  const state = live.get(id);
  state?.watcher?.close();
  for (const t of state?.timers.values() || []) clearTimeout(t);
  live.delete(id);
  if (info.synced) rmSync(rootOf(info), { recursive: true, force: true });
  dropMeta(id);
  // with no vault left, the app's own notes show again, so the Notes page always has one
  if (list.length === 1 && getSettings().hideOwnNotes) saveSettings({ hideOwnNotes: false });
  publish("global", { type: "vaults", data: { vault: id, path: "", change: "removed" } });
}

/** Whether the Notes page leaves out the app's own notes (only while there are other vaults). */
export const ownNotesHidden = () => getSettings().hideOwnNotes && listVaults().length > 0;

/** Leaves the app's own notes out of the Notes page, or shows them again; nothing is deleted. */
export function hideOwnNotes(hidden: boolean) {
  if (hidden && !listVaults().length) throw new Error("add a vault first: the Notes page needs one to show");
  saveSettings({ hideOwnNotes: hidden });
  publish("global", { type: "vaults", data: { vault: "", path: "", change: "own" } });
  return { hidden: ownNotesHidden() };
}

/** Reads every vault and starts watching them, and checks them against their folders every so often. */
export function startVaults() {
  for (const v of listVaults())
    try {
      getVault(v.id);
    } catch (error) {
      console.warn(`[vaults] couldn't read ${v.path}:`, (error as Error).message);
    }
  poller ??= setInterval(() => {
    for (const [id, state] of live) {
      if (statusOf(state.vault.root) !== "ready") {
        state.watcher?.close();
        state.watcher = null;
        continue;
      }
      startWatching(id);
      announce(id, state.vault.reconcile());
    }
  }, POLL_MS);
  poller.unref();
}

/** Announces changes the app made itself (saves, renames, attachments). */
export const announceChanges = announce;
