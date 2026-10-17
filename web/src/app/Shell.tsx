/* The frame around every page except the reader: a slim bar along the top (the active vault beside the
 * brand, once vaults are added; the pages, with the number of cards due on Review; the agent, search, the
 * theme switch and settings at the right end) and the page itself. */
import { Moon, Search, Settings, Sun } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AgentButton } from "../agent/AgentButton";
import { learn } from "../api";
import { openPalette, useIndicator } from "../components/ui";
import { under, useVaultEvents } from "../lib/useVaultEvents";
import { VaultPicker } from "../vaults/VaultPicker";

const NAV: { route: string; label: string; match: RegExp }[] = [
  { route: "#/", label: "Today", match: /^#\/?$/ },
  { route: "#/library", label: "Library", match: /^#\/library/ },
  { route: "#/notes", label: "Notes", match: /^#\/(notes|vaults)/ },
  { route: "#/review", label: "Review", match: /^#\/review/ },
  { route: "#/brain", label: "Brain", match: /^#\/brain/ },
  { route: "#/journey", label: "Journey", match: /^#\/journey/ },
];

/** How many cards are waiting, for the nav badge (refreshed every minute and on focus). */
export function useDueCount() {
  const [due, setDue] = useState<number | null>(null);
  const reload = useRef<() => void>(() => {});
  // cards the agent (or another editor) makes count at once
  useVaultEvents(() => reload.current(), under("cards/"));
  useEffect(() => {
    let alive = true;
    const load = () =>
      learn.today().then(
        (t) => alive && setDue(t.queue.due + t.queue.learning + t.queue.fresh),
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
  // the bar draws its hairline only once the page scrolls under it
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onHash = () => setHash(location.hash || "#/");
    const onScroll = () => setScrolled(window.scrollY > 2);
    onScroll();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("scroll", onScroll);
    };
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
      <header className="topnav" data-line={scrolled || full || undefined}>
        <div className="topnav-start">
          <a className="brand" href="#/" title="Today">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Feynman’s Classroom</span>
          </a>
          <VaultPicker />
        </div>
        <nav className="topnav-nav" aria-label="Main">
          <ul className="topnav-links" ref={nav}>
            {NAV.map((item, i) => (
              <li key={item.route}>
                <a href={item.route} className="topnav-link" aria-current={i === current ? "page" : undefined}>
                  {item.label}
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
          <AgentButton />
          <button
            type="button"
            className="icon-button"
            onClick={openPalette}
            aria-label="Search"
            aria-haspopup="dialog"
            aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
            title={`Search (${mac ? "⌘K" : "Ctrl K"})`}
          >
            <Search aria-hidden="true" />
          </button>
          <ThemeButton theme={theme} setTheme={setTheme} />
          <a
            className="icon-button"
            href="#/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={path.startsWith("#/settings") ? "page" : undefined}
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
