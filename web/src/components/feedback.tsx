/* Small status pieces used across pages: a spinner that says what it's waiting for (and for how long),
 * and a concept's mastery as a bar. */
import { useEffect, useState } from "react";

/** Something is being worked on: an announced status with a label and, given `since`, the seconds so far. */
export function Spinner({ label, since }: { label: string; since?: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [since]);
  return (
    <span className="spinner" role="status">
      <span className="spinner-mark" aria-hidden="true" />
      {label}
      {since ? <span className="muted"> · {Math.round((Date.now() - since) / 1000)}s</span> : null}
    </span>
  );
}

/** Mastery as a small bar (null: not studied yet). */
export function Mastery({ value, wide = false }: { value: number | null | undefined; wide?: boolean }) {
  if (value === null || value === undefined)
    return (
      <span className="mastery none" title="Not studied yet">
        —
      </span>
    );
  const pct = Math.round(value * 100);
  return (
    <span className={`mastery ${wide ? "wide" : ""}`} title={`${pct}% recall`}>
      <span className="mastery-bar">
        <span style={{ width: `${pct}%` }} data-level={value >= 0.8 ? "strong" : value >= 0.55 ? "ok" : "weak"} />
      </span>
      <span className="mastery-pct">{pct}%</span>
    </span>
  );
}
