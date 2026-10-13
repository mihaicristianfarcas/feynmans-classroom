/* Change notifications: every write to the vault, from the app or from outside (an editor,
 * Obsidian, an agent), is announced with its vault-relative path, so indexes, links and open pages
 * can follow. The server's own writes are remembered so the file watcher doesn't report them twice. */

const listeners = new Set<(rel: string) => void>();
/** Paths the server itself just wrote; the watcher skips their next event. */
const selfWrites = new Set<string>();

/** Calls `fn` with a vault-relative path whenever a file changes. Returns an unsubscribe function. */
export function onVaultChange(fn: (rel: string) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tells the listeners a file changed (writes that don't go through a collection call this themselves). */
export function touched(rel: string) {
  for (const fn of listeners) {
    try {
      fn(rel);
    } catch (error) {
      console.warn("[vault] change listener:", (error as Error).message);
    }
  }
}

/** Marks a path as written by the server, so the watcher doesn't treat it as an outside edit. */
export const wroteItself = (rel: string) => selfWrites.add(rel);

/** True (once) if the server wrote this path itself. */
export const takeSelfWrite = (rel: string) => selfWrites.delete(rel);
