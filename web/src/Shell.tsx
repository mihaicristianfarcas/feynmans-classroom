import { useEffect, useState, type ReactNode } from "react";
import { learn } from "./api";

const NAV = [
  { route: "#/", label: "Today", match: /^#\/?$/ },
  { route: "#/library", label: "Library", match: /^#\/library/ },
  { route: "#/review", label: "Review", match: /^#\/review/ },
  { route: "#/brain", label: "Brain", match: /^#\/brain/ },
  { route: "#/ask", label: "Ask", match: /^#\/ask/ },
  { route: "#/journey", label: "Journey", match: /^#\/journey/ },
  { route: "#/settings", label: "Settings", match: /^#\/settings/ },
];

/** How many cards are waiting, for the nav badge (refreshed every minute and on focus). */
export function useDueCount() {
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      learn.today().then(
        (t) => alive && setDue(t.queue.due + t.queue.learning + t.queue.fresh),
        () => {},
      );
    load();
    const timer = setInterval(load, 60000);
    window.addEventListener("focus", load);
    window.addEventListener("classroom:reviewed", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("classroom:reviewed", load);
    };
  }, []);
  return due;
}

export function Shell({ children, theme, setTheme }: { children: ReactNode; theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void }) {
  const due = useDueCount();
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <a className="brand" href="#/" title="Today">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Feynman’s Classroom</span>
        </a>
        <ul className="side-nav">
          {NAV.map((item) => (
            <li key={item.route}>
              <a href={item.route} className="side-link" aria-current={item.match.test(hash) ? "page" : undefined}>
                <span>{item.label}</span>
                {item.label === "Review" && due ? <span className="badge">{due}</span> : null}
              </a>
            </li>
          ))}
        </ul>
        <div className="side-foot">
          <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Switch theme" title="Switch theme">
            {theme === "light" ? "◐" : "◑"}
          </button>
          <kbd title="Search">⌘K</kbd>
        </div>
      </nav>
      <main className="page">{children}</main>
    </div>
  );
}

/** A small hook for loading data with an error and a reload. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string | null; reload: () => void; setData: (t: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
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
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: () => setTick((n) => n + 1), setData };
}

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
  if (value === null || value === undefined) return <span className="mastery none" title="Not studied yet">—</span>;
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

export function timeAgo(ts: number | string) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}
