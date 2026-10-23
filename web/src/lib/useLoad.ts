/* Loading data for a page: the result, the error message, a reload, and setData for optimistic edits.
 * Given a key, the last answer is kept (lib/cache.ts): a page opened again shows it at once and quietly
 * loads it anew. */
import { useEffect, useState } from "react";
import { cached, fresh, keep, prime } from "./cache";

/** A small hook for loading data with an error and a reload. */
export function useLoad<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  key?: string,
): { data: T | null; error: string | null; reload: () => void; setData: (t: T) => void } {
  const [data, setState] = useState<T | null>(() => (key ? (cached<T>(key) ?? null) : null));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller's deps decide when to load again (and `tick` forces it)
  useEffect(() => {
    let alive = true;
    setError(null);
    if (key && tick === 0 && fresh(key)) {
      setState(cached<T>(key) ?? null);
      return;
    }
    // the first load joins one already started ahead (pointing at the page's link); a reload asks again
    (key && tick === 0 ? prime(key, load) : load()).then(
      (d) => {
        if (key) keep(key, d);
        if (alive) setState(d);
      },
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  const setData = (t: T) => {
    if (key) keep(key, t);
    setState(t);
  };
  return { data, error, reload: () => setTick((n) => n + 1), setData };
}
