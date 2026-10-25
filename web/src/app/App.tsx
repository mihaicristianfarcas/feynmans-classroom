/* The app: picks the page from the URL's hash (#/library, #/book/<id>, #/notes/<id>…), sends a new
 * learner to the welcome page first, and puts every page except the reader inside the Shell (Notes
 * and the Brain's graph fill the window below its bar; the rest scroll). It starts again at Today when
 * another vault is opened. The ⌘K palette and the agent
 * (⌘J) sit over every page; old #/ask links open the agent. Each page but Today is its own chunk
 * (app/pages.ts), all fetched ahead once the app is idle; one that isn't here yet shows nothing (or,
 * after a moment, a spinner).
 * A page that fails to draw or load says so, with a way to reload. */
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { AgentPanel } from "../agent/AgentPanel";
import { openAgent } from "../agent/store";
import { learn, vaults } from "../api";
import { showVault } from "../api/client";
import { Loading } from "../components/feedback";
import { prime } from "../lib/cache";
import { Today } from "../pages/Today";
import { followOpenVault } from "../vaults/open";
import { openLink } from "./navigation";
import { PageBoundary } from "./PageBoundary";
import { Palette } from "./Palette";
import { Brain, Gallery, Journey, Library, Notes, preloadAll, Reader, Review, Settings, Welcome } from "./pages";
import { Shell } from "./Shell";
import { useTheme } from "./theme";

type Route =
  | { name: "book"; id: string }
  | {
      full?: boolean;
      name:
        | "today"
        | "library"
        | "notes"
        | "review"
        | "brain"
        | "journey"
        | "settings"
        | "gallery"
        | "welcome"
        | "open";
    };

const TITLES: Record<Exclude<Route["name"], "book">, string> = {
  today: "Today",
  library: "Library",
  notes: "Notes",
  review: "Review",
  brain: "Brain",
  journey: "Journey",
  settings: "Settings",
  gallery: "Figure gallery",
  welcome: "Welcome",
  open: "Opening a link",
};

/** The page the URL's hash names. */
function route(): Route {
  const hash = location.hash.split("?")[0];
  const book = hash.match(/^#\/book\/([a-z0-9]+)/i);
  if (book) return { name: "book", id: book[1] };
  const name = hash.replace(/^#\/?/, "").split("/")[0];
  // pages that fill the window: Notes, and the Brain's graph (not a concept's own page)
  const full = name === "notes" || (name === "brain" && !hash.startsWith("#/brain/concept/"));
  if (["library", "notes", "review", "brain", "journey", "settings", "gallery", "welcome", "open"].includes(name))
    return { name: name as Route["name"], full } as Route;
  return { name: "today" };
}

/** #/ask?q=… (the page the agent replaced): open the agent with the question instead. */
function redirectAsk() {
  if (!/^#\/ask\b/.test(location.hash)) return;
  const q = new URLSearchParams(location.hash.split("?")[1] || "").get("q")?.trim();
  history.replaceState(null, "", "#/");
  setTimeout(() => openAgent(q ? { text: q, send: true } : {}));
}

const sameRoute = (a: Route, b: Route) =>
  a.name === b.name &&
  (a as { id?: string }).id === (b as { id?: string }).id &&
  (a as { full?: boolean }).full === (b as { full?: boolean }).full;

export function App() {
  const [current, setCurrent] = useState(route);
  const [theme, setTheme] = useTheme();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const showing = useRef(current);
  showing.current = current;
  useEffect(() => {
    redirectAsk();
    const onHash = () => {
      redirectAsk();
      const next = route();
      if (sameRoute(showing.current, next)) return;
      setCurrent(next);
    };
    window.addEventListener("hashchange", onHash);
    // every page's code, fetched ahead once nothing else is going on, so moving between pages is instant
    // (a timer only where the browser has no idle callback)
    const idle = window.requestIdleCallback || ((f: () => void) => setTimeout(f, 2000));
    idle(preloadAll);
    learn.profile().then(
      (p) => setOnboarded(p.onboarded),
      () => setOnboarded(true),
    );
    // which vault this page shows (every call says so), and a fresh start when another one is opened
    prime("vaults", vaults.list).then(
      (list) => {
        const open = list.find((v) => v.open);
        if (open) showVault(open.id);
      },
      () => {},
    );
    const unfollow = followOpenVault();
    return () => {
      window.removeEventListener("hashchange", onHash);
      unfollow();
    };
  }, []);
  useEffect(() => {
    if (onboarded === false && current.name === "today") location.hash = "#/welcome";
  }, [onboarded, current]);
  // each page names itself in the title, and after a move, keyboard and screen-reader users start at its content
  const shown = useRef(current);
  useEffect(() => {
    if (current.name !== "book") document.title = `${TITLES[current.name]} · Feynman’s Classroom`;
    // only after moving to another page (compared with the last one, so a re-run effect doesn't count)
    if (shown.current === current) return;
    shown.current = current;
    requestAnimationFrame(() => {
      // unless the new page already put focus somewhere on purpose (a search field, say)
      const main = document.getElementById("main");
      if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
    });
  }, [current]);

  let page: ReactNode;
  if (current.name === "book")
    return (
      <>
        <PageBoundary key={current.id}>
          <Suspense fallback={<Loading label="Opening the book" />}>
            <Reader key={current.id} bookId={current.id} theme={theme} setTheme={setTheme} />
          </Suspense>
        </PageBoundary>
        <Palette />
        <AgentPanel theme={theme} />
      </>
    );
  if (current.name === "welcome") page = <Welcome />;
  else if (current.name === "library") page = <Library theme={theme} />;
  else if (current.name === "notes") page = <Notes theme={theme} />;
  else if (current.name === "open") page = <OpenLink />;
  else if (current.name === "review") page = <Review theme={theme} />;
  else if (current.name === "brain") page = <Brain theme={theme} />;
  else if (current.name === "journey") page = <Journey />;
  else if (current.name === "settings") page = <Settings theme={theme} setTheme={setTheme} />;
  else if (current.name === "gallery") page = <Gallery theme={theme} />;
  else page = <Today />;
  return (
    <>
      <Shell theme={theme} setTheme={setTheme} full={current.full}>
        <PageBoundary key={current.name}>
          <Suspense fallback={<Loading label={`Opening ${TITLES[current.name].toLowerCase()}`} />}>{page}</Suspense>
        </PageBoundary>
      </Shell>
      <Palette />
      <AgentPanel theme={theme} />
    </>
  );
}

/** #/open?target=…&sub=…: where a [[link]] goes when opened directly (a new tab, a pasted URL). */
function OpenLink() {
  useEffect(() => {
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    openLink(q.get("target") || "", q.get("sub") || undefined);
  }, []);
  return <div className="center-note">Opening…</div>;
}
