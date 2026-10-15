/* Keeps synced vaults in step with their folders. Where the browser can use a folder any time (Chromium),
 * each linked folder is compared with the server's copy every few seconds and right after the app changes
 * a file, and differences go both ways (plan.ts). Elsewhere (Firefox, Safari) the folder's files come in
 * each time it's picked; changes made in the app stay in the app's copy. One tab syncs a vault at a time
 * (a Web Lock). Each vault's status is readable with useVaultSync. */
import { useSyncExternalStore } from "react";
import { type SyncEntry, vaultSync, vaults } from "../../api";
import { onServerEvent } from "../../api/events";
import {
  canOpenFolders,
  chooseFolder,
  type DiskFile,
  type FolderHandle,
  listFiles,
  pickFolderFiles,
  removeFile,
  writeFile,
} from "./folder";
import { conflictName, plan, type Stat } from "./plan";
import { type Base, dropLinked, getLinked, putLinked } from "./store";

export type SyncState =
  | { state: "unlinked" } // no folder for it in this browser
  | { state: "permission" } // the browser needs a click to allow the folder again
  | { state: "syncing"; done: number; total: number }
  | { state: "synced"; at: number }
  | { state: "copied"; at: number } // read once from a picked folder (Firefox, Safari)
  | { state: "error"; message: string };

const INTERVAL_MS = 3000;
const status = new Map<string, SyncState>();
const listeners = new Set<() => void>();
const set = (id: string, s: SyncState) => {
  status.set(id, s);
  for (const l of listeners) l();
};

/** This vault's sync status in this browser (undefined: not checked yet). */
export function useVaultSync(id: string | undefined): SyncState | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (id ? status.get(id) : undefined),
  );
}

const equal = async (a: Blob, b: Blob) => {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
  return true;
};

/** The folder's side of a sync: its files, and a handle if it can be written to. */
interface Disk {
  files: Map<string, DiskFile>;
  handle?: FolderHandle;
}

/** One sync of vault `id` with its folder; updates `base` in place, saving it after each file (a page
 * closed mid-sync mustn't lose what was done, or a file the app deleted would come back). */
async function syncOnce(id: string, disk: Disk, base: Base, save: () => Promise<void>) {
  const list = await vaultSync.list(id);
  const copy = new Map(list.map((e) => [e.path, e]));
  const stat = (m: { size: number; mtime: number }): Stat => [m.size, m.mtime];
  const { handle, files } = disk;
  const actions = plan(
    new Map([...files].map(([p, f]) => [p, stat(f)])),
    new Map(list.map((e) => [e.path, stat(e)])),
    base,
  ).filter(([, a]) => handle || (a !== "download" && a !== "delete-disk"));
  if (!actions.length) return;
  let done = 0;
  set(id, { state: "syncing", done, total: actions.length });
  const keep = (path: string, d: { size: number; lastModified: number }, c: SyncEntry) => {
    base[path] = { d: [d.size, d.lastModified], c: [c.size, c.mtime] };
  };
  const taken = (p: string) => files.has(p) || copy.has(p);
  const upload = async (path: string) => {
    const file = await (files.get(path) as DiskFile).read();
    keep(path, file, await vaultSync.write(id, path, file));
  };
  for (const [path, action] of actions) {
    if (action === "upload") await upload(path);
    else if (action === "download" && handle)
      keep(path, await writeFile(handle, path, await vaultSync.read(id, path)), copy.get(path) as SyncEntry);
    else if (action === "delete-copy") {
      await vaultSync.remove(id, path);
      delete base[path];
    } else if (action === "delete-disk" && handle) {
      await removeFile(handle, path);
      delete base[path];
    } else if (action === "forget") delete base[path];
    else if (action === "compare") {
      const file = await (files.get(path) as DiskFile).read();
      const theirs = await vaultSync.read(id, path);
      if (await equal(file, theirs)) keep(path, file, copy.get(path) as SyncEntry);
      else {
        // both changed: the folder's version wins, the app's is kept beside it
        const aside = conflictName(path, taken);
        if (handle) await writeFile(handle, aside, theirs);
        else await vaultSync.write(id, aside, theirs);
        await upload(path);
      }
    }
    await save();
    set(id, { state: "syncing", done: ++done, total: actions.length });
  }
}

const running = new Set<string>();

async function exclusive(id: string, work: () => Promise<void>) {
  if (navigator.locks) await navigator.locks.request(`vault-sync-${id}`, { ifAvailable: true }, (l) => l && work());
  else await work();
}

const failed = (id: string, e: unknown) =>
  set(id, {
    state: "error",
    message:
      (e as Error).name === "NotFoundError"
        ? "The folder was moved or deleted. Open it again."
        : `Couldn't sync: ${(e as Error).message}`,
  });

/** Syncs vault `id` now, if this browser has its folder and may use it. */
export async function syncVault(id: string) {
  if (running.has(id)) return;
  running.add(id);
  try {
    const linked = await getLinked(id);
    const handle = linked?.handle;
    if (!linked || !handle) {
      if (!linked) set(id, { state: "unlinked" });
      else if (!status.has(id)) set(id, { state: "copied", at: 0 });
      return;
    }
    if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") return set(id, { state: "permission" });
    await exclusive(id, async () => {
      await syncOnce(id, { files: await listFiles(handle), handle }, linked.base, () => putLinked(id, linked));
      set(id, { state: "synced", at: Date.now() });
    });
  } catch (e) {
    failed(id, e);
  } finally {
    running.delete(id);
  }
}

/** Links vault `id` to a folder chosen in this browser and syncs it. */
export async function linkFolder(id: string, handle: FolderHandle) {
  const old = await getLinked(id);
  await putLinked(id, { handle, base: old?.base || {} });
  await syncVault(id);
  const s = status.get(id);
  if (s?.state === "error") throw new Error(s.message);
}

/** Brings in a folder's files as they are now (Firefox, Safari: picked in a folder input). */
export async function importFolder(id: string, files: Map<string, DiskFile>) {
  const linked = (await getLinked(id)) ?? { base: {} };
  try {
    await exclusive(id, async () => {
      const save = () => putLinked(id, { base: linked.base });
      await syncOnce(id, { files }, linked.base, save);
      await save();
      set(id, { state: "copied", at: Date.now() });
    });
  } catch (e) {
    failed(id, e);
    throw new Error((status.get(id) as { message: string }).message);
  }
}

/** Picks a folder in whichever way this browser can: its name and how to sync it into vault `id`; null if cancelled. */
export async function pickVaultFolder(): Promise<{ name: string; sync: (id: string) => Promise<void> } | null> {
  if (canOpenFolders()) {
    const handle = await chooseFolder();
    return handle && { name: handle.name, sync: (id) => linkFolder(id, handle) };
  }
  const picked = await pickFolderFiles();
  return picked && { name: picked.name, sync: (id) => importFolder(id, picked.files) };
}

/** Asks the browser to allow the folder again (needs a click), then syncs. */
export async function reconnect(id: string) {
  const handle = (await getLinked(id))?.handle;
  if (handle && (await handle.requestPermission({ mode: "readwrite" })) === "granted") await syncVault(id);
}

let started = false;

/** Starts syncing every synced vault while the app is open. */
export function startVaultSync() {
  if (started) return;
  started = true;
  let ids: string[] = [];
  const refresh = () =>
    vaults.list().then(
      (list) => {
        ids = list.filter((v) => v.synced).map((v) => v.id);
        for (const id of ids) void syncVault(id);
      },
      () => {},
    );
  void refresh();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  onServerEvent("vaults", (data) => {
    const c = data as { vault: string; path: string; change: string };
    if (!c.path) {
      if (c.change === "removed") {
        void dropLinked(c.vault);
        status.delete(c.vault);
      }
      return void refresh();
    }
    if (!ids.includes(c.vault)) return;
    clearTimeout(timers.get(c.vault));
    timers.set(
      c.vault,
      setTimeout(() => void syncVault(c.vault), 300),
    );
  });
  if (canOpenFolders())
    setInterval(() => {
      for (const id of ids) void syncVault(id);
    }, INTERVAL_MS);
}
