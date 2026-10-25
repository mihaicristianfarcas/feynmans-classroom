/* Which vault is open, and which work belongs to it.
 *
 * One vault is open at a time, and another can be opened without restarting the server. Each opening
 * is a visit: every request runs in the visit that was current when it came in (AsyncLocalStorage), and
 * so does everything it starts (model calls, timers, jobs). Once another vault is opened, the old visit's
 * work can't reach the new vault: its model calls are stopped, and the moment it asks for the vault's
 * folder (to read or write anything) it gets VaultClosed instead. What it was doing is still marked as
 * pending in its own vault's files, so it starts again when that vault is next opened, as after a restart.
 *
 * What a module keeps in memory about the vault (an index, a cache, a timer) lives in vaultState(): each
 * visit has its own, so a vault opened again starts from its files, and late work only sees its own. */
import { AsyncLocalStorage } from "node:async_hooks";
import { relative } from "node:path";
import { openEntry, type VaultEntry, vaultPath } from "./vaults.ts";

/** Thrown at work that belongs to a vault that has been closed (another one is open now). */
export class VaultClosed extends Error {
  constructor() {
    super("That vault was closed: another one is open now.");
    this.name = "VaultClosed";
  }
}

interface Visit {
  vault: VaultEntry;
  dir: string;
  /** Aborted when the visit ends: stops the model calls made in it. */
  stop: AbortController;
}

const visits = new AsyncLocalStorage<Visit>();
const visitOf = (vault: VaultEntry): Visit => ({ vault, dir: vaultPath(vault), stop: new AbortController() });
let current: Visit | null = null;
/** The open vault's visit (the one the registry names, until another is entered). */
const open = (): Visit => {
  current ??= visitOf(openEntry());
  return current;
};
/** The visit the running work belongs to: the one it started in, or the open one. */
const mine = () => visits.getStore() ?? open();

/** Whether the running work belongs to the open vault. */
export const stillOpen = () => mine() === open();

/** Throws VaultClosed when the running work belongs to a vault that has been closed. */
export function assertOpen() {
  if (!stillOpen()) throw new VaultClosed();
}

/** The open vault's folder. */
export function vaultDir(): string {
  assertOpen();
  return open().dir;
}

/** The vault the running work belongs to (the open one, for a request): its id, name and folder. */
export const currentVault = (): VaultEntry => mine().vault;

/** A vault-relative path from an absolute one (or null when it's outside the vault). */
export function vaultRel(abs: string) {
  const rel = relative(vaultDir(), abs).replace(/\\/g, "/");
  return rel.startsWith("..") ? null : rel;
}

/** Aborted once the running work's vault is closed (model calls stop with it). */
export const visitSignal = () => mine().stop.signal;

/** Runs `fn` in the open vault's visit (each request does, and what it starts belongs to that vault). */
export const inVisit = <T>(fn: () => T): T => visits.run(open(), fn);

/** Makes `vault` the open one: the visit before ends (its model calls are stopped, its work can't reach
 * the vault any more), and `fn` runs in the new one. */
export function enterVault<T>(vault: VaultEntry, fn: () => T): T {
  const was = current;
  current = visitOf(vault);
  was?.stop.abort();
  return visits.run(current, fn);
}

/**
 * State a module keeps about the open vault, made afresh (by `make`) for each visit: a vault opened again
 * starts from its files, and work of a closed vault only ever sees the state of its own visit.
 */
export function vaultState<T>(make: () => T): () => T {
  const states = new WeakMap<Visit, T>();
  return () => {
    const visit = mine();
    if (!states.has(visit)) states.set(visit, make());
    return states.get(visit)!;
  };
}
