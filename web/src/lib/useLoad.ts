/* Loading data for a page: the result, the error message, a reload, and setData for optimistic edits. */
import { useEffect, useState } from "react";

/** A small hook for loading data with an error and a reload. */
export function useLoad<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; error: string | null; reload: () => void; setData: (t: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller's deps decide when to load again (and `tick` forces it)
  useEffect(() => {
    let alive = true;
    setError(null);
    load().then(
      (d) => alive && setData(d),
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  return { data, error, reload: () => setTick((n) => n + 1), setData };
}
