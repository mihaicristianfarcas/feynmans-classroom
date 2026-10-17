/* This browser's synced folders, in IndexedDB: for each vault, the folder's handle (where the browser
 * gives one) and what both sides looked like after the last sync (the base the next sync compares against). */
import type { FolderHandle } from "./folder";

/** Size and time of a file on disk (d) and in the server's copy (c) when last in step. */
export type Base = Record<string, { d: [number, number]; c: [number, number] }>;

export interface Linked {
  /** Absent where the browser can only read a folder when it's picked (Firefox, Safari). */
  handle?: FolderHandle;
  base: Base;
}

const DB = "classroom-vault-sync";
const STORE = "linked";

function open(): Promise<IDBDatabase> {
  return new Promise((done, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => done(req.result);
    req.onerror = () => fail(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise((done, fail) => {
    const req = act(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => done(req.result as T);
    req.onerror = () => fail(req.error);
  }).finally(() => db.close()) as Promise<T>;
}

export const getLinked = (id: string) => run<Linked | undefined>("readonly", (s) => s.get(id));
export const putLinked = (id: string, value: Linked) => run<void>("readwrite", (s) => s.put(value, id));
export const dropLinked = (id: string) => run<void>("readwrite", (s) => s.delete(id));
