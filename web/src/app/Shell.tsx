/* The frame around every page except the reader: a slim bar along the top (the wordmark, with the open
 * vault's name to switch vaults once there are several; the pages beside it with the number of cards due
 * on Review; search drawn as a field, the agent, the theme switch and settings at the right end) and the
 * page itself. On a phone the pages move to a tab bar along the bottom, each with its icon. Pointing at
 * (or focusing) a page's link fetches that page ahead. The number on Review is drawn with the bar (the
 * last one known), so the row never moves when it arrives. */
import {
  Brain,
  Layers,
  Library,
  type LucideIcon,
  Moon,
  NotebookPen,
  Route,
  Search,
  Settings,
  Sun,
  Sunrise,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AgentButton } from "../agent/AgentButton";
import { learn } from "../api";
import { openPalette, useIndicator } from "../components/ui";
import { cached, prime } from "../lib/cache";
import { under, useVaultEvents } from "../lib/useVaultEvents";
import { VaultSwitch } from "../vaults/VaultSwitch";
import { ahead } from "./pages";

const NAV: { route: string; label: string; icon: LucideIcon; match: RegExp }[] = [
  { route: "#/", label: "Today", icon: Sunrise, match: /^#\/?$/ },
  { route: "#/library", label: "Library", icon: Library, match: /^#\/library/ },
  { route: "#/notes", label: "Notes", icon: NotebookPen, match: /^#\/notes/ },
  { route: "#/review", label: "Review", icon: Layers, match: /^#\/review/ },
  { route: "#/brain", label: "Brain", icon: Brain, match: /^#\/brain/ },
  { route: "#/journey", label: "Journey", icon: Route, match: /^#\/journey/ },
];

type TodayData = Awaited<ReturnType<typeof learn.today>>;
const dueIn = (t: TodayData) => t.queue.due + t.queue.learning + t.queue.fresh;
/** The last count seen, kept on this device: a reload draws the badge with the bar instead of after it. */
const DUE_KEY = "classroom-due";
function lastDue(): number | null {
  const today = cached<TodayData>("today");
  if (today) return dueIn(today);
  try {
    const kept = localStorage.getItem(DUE_KEY);
    return kept === null ? null : Number(kept) || 0;
  } catch {
    return null;
  }
}

/**
 * How many cards are waiting, for the nav badge: the last count known at once, then the count now (asked
 * with Today's own load, under its key, so the two share one request), again every minute and on focus.
 */
export function useDueCount() {
  const [due, setDue] = useState<number | null>(lastDue);
  const reload = useRef<() => void>(() => {});
  // cards the agent (or another editor) makes count at once
  useVaultEvents(() => reload.current(), under("cards/"));
  useEffect(() => {
    let alive = true;
    const load = () =>
      prime("today", learn.today).then(
        (t) => {
          const n = dueIn(t);
          try {
            localStorage.setItem(DUE_KEY, String(n));
          } catch {}
          if (alive) setDue(n);
        },
        () => {},
      );
    load();
    reload.current = load;
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
    const onHash = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const path = hash.split("?")[0];
  const current = NAV.findIndex((item) => item.match.test(path));
  const nav = useIndicator<HTMLUListElement>(current);
  // on a narrow screen the pages scroll sideways: keep the current one in view
  // biome-ignore lint/correctness/useExhaustiveDependencies: again when the page changes, or the badge widens the row
  useEffect(() => {
    const link = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const strip = nav.current?.parentElement;
    if (!link || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2 });
  }, [current, nav, due]);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div className="shell">
      <SkipLink />
      <header className="topnav">
        <div className="topnav-start">
          <a className="brand" href="#/" title="Today" {...ahead("#/")}>
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Feynman’s Classroom</span>
          </a>
          <VaultSwitch />
        </div>
        <nav className="topnav-nav" aria-label="Main">
          <ul className="topnav-links" ref={nav}>
            {NAV.map((item, i) => (
              <li key={item.route}>
                <a
                  href={item.route}
                  className="topnav-link"
                  aria-current={i === current ? "page" : undefined}
                  {...ahead(item.route)}
                >
                  <item.icon className="topnav-icon" aria-hidden="true" />
                  <span className="topnav-label">{item.label}</span>
                  {item.label === "Review" && due ? (
                    <span className="badge">
                      <span className="visually-hidden">, </span>
                      {due}
                      <span className="visually-hidden"> due</span>
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="topnav-tools">
          <button
            type="button"
            className="topnav-search"
            onClick={openPalette}
            aria-label="Search"
            aria-haspopup="dialog"
            aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
            title={`Search (${mac ? "⌘K" : "Ctrl K"})`}
          >
            <Search aria-hidden="true" />
            {/* the label names the button; these only show it */}
            <span>Search</span>
            <kbd>{mac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <AgentButton />
          <ThemeButton theme={theme} setTheme={setTheme} />
          <a
            className="icon-button"
            href="#/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={path.startsWith("#/settings") ? "page" : undefined}
            {...ahead("#/settings")}
          >
            <Settings aria-hidden="true" />
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={full ? "page page-full" : "page"}>
        {children}
      </main>
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

/** The first thing Tab reaches: jumps past the navigation to the page's content (#main, or `target`). */
export function SkipLink({ target = "main", label = "Skip to content" }: { target?: string; label?: string }) {
  return (
    <a
      className="skip-link"
      href={`#${target}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(target)?.focus();
      }}
    >
      {label}
    </a>
  );
}
