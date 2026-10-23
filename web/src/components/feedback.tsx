/* Small status pieces used across pages: a spinner that says what it's waiting for (and for how long),
 * something local still on its way, and a concept's mastery as a bar. */
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

/**
 * Something on its way from this computer (a page's code, its data, a book being opened): nothing for a
 * moment, since it's nearly always quicker than that, then a spinner saying what it waits for, in the
 * middle of the space or, `inline`, where it stands. Nothing pretends to be the content in the meantime.
 */
export function Loading({ label = "Loading", inline = false }: { label?: string; inline?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // a deadline, not a poll: the spinner shows only once the wait is long enough to notice
    const t = setTimeout(() => setShown(true), 400);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;
  return inline ? (
    <Spinner label={label} />
  ) : (
    <div className="center-note">
      <Spinner label={label} />
    </div>
  );
}

/** Mastery as a small bar (null: not studied yet). */
export function Mastery({ value, wide = false }: { value: number | null | undefined; wide?: boolean }) {
  if (value === null || value === undefined)
    return (
      <span className="mastery none" title="Not studied yet">
        Not studied
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
