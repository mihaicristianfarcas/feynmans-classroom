/* What pages loaded last, kept for the visit: a page opened again shows it at once while it loads anew,
 * and a page you're about to open (pointing at its link) can start loading before you click. */

const kept = new Map<string, { value: unknown; at: number }>();
const pending = new Map<string, Promise<unknown>>();
/** An answer this new is used as it is (it was loaded ahead a moment ago, by pointing at the link). */
const FRESH = 3000;

/** The last answer kept under `key`, if any. */
export function cached<T>(key: string): T | undefined {
  return kept.get(key)?.value as T | undefined;
}

/** Whether the answer kept under `key` was loaded a moment ago. */
export function fresh(key: string): boolean {
  const entry = kept.get(key);
  return !!entry && Date.now() - entry.at < FRESH;
}

/** Keeps `value` as the answer for `key`. */
export function keep<T>(key: string, value: T) {
  kept.set(key, { value, at: Date.now() });
}

/** Loads `key` ahead (once at a time), so the page that needs it finds it kept. Errors are the page's to show. */
export function prime<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = pending.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = load().then(
    (value) => {
      keep(key, value);
      pending.delete(key);
      return value;
    },
    (error) => {
      pending.delete(key);
      throw error;
    },
  );
  pending.set(key, p);
  return p;
}
