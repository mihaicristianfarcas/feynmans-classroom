import {
  BookOpen,
  ChartNoAxesColumn,
  House,
  Layers,
  type LucideIcon,
  Moon,
  NotebookPen,
  Search,
  Settings,
  Sparkles,
  Sun,
  Waypoints,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { learn } from "./api";
import { openPalette, useIndicator } from "./ui";

const NAV: { route: string; label: string; match: RegExp; icon: LucideIcon }[] = [
  { route: "#/", label: "Today", match: /^#\/?$/, icon: House },
  { route: "#/library", label: "Library", match: /^#\/library/, icon: BookOpen },
  { route: "#/notes", label: "Notes", match: /^#\/notes/, icon: NotebookPen },
  { route: "#/review", label: "Review", match: /^#\/review/, icon: Layers },
  { route: "#/brain", label: "Brain", match: /^#\/brain/, icon: Waypoints },
  { route: "#/ask", label: "Ask", match: /^#\/ask/, icon: Sparkles },
  { route: "#/journey", label: "Journey", match: /^#\/journey/, icon: ChartNoAxesColumn },
  { route: "#/settings", label: "Settings", match: /^#\/settings/, icon: Settings },
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

export function Shell({
  children,
  theme,
  setTheme,
  full = false,
}: {
  children: ReactNode;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  full?: boolean;
}) {
  const due = useDueCount();
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const on = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const current = NAV.findIndex((item) => item.match.test(hash));
  const nav = useIndicator<HTMLUListElement>(current, "y");
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <a className="brand" href="#/" title="Today">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Feynman’s Classroom</span>
        </a>
        <button type="button" className="side-search" onClick={openPalette} title="Search everything">
          <Search aria-hidden="true" />
          <span>Search</span>
          <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        <ul className="side-nav" ref={nav}>
          {NAV.map((item, i) => (
            <li key={item.route}>
              <a
                href={item.route}
                className="side-link"
                aria-current={i === current ? "page" : undefined}
                title={item.label}
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
                {item.label === "Review" && due ? <span className="badge">{due}</span> : null}
              </a>
            </li>
          ))}
        </ul>
        <div className="side-foot">
          <ThemeButton theme={theme} setTheme={setTheme} />
        </div>
      </nav>
      <main className={full ? "page page-full" : "page"}>{children}</main>
    </div>
  );
}

export function ThemeButton({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void }) {
  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label="Switch theme"
      title={theme === "light" ? "Switch to dark" : "Switch to light"}
    >
      {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
    </button>
  );
}

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

export function timeAgo(ts: number | string) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}
