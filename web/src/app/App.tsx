/* The app: picks the page from the URL's hash (#/library, #/book/<id>, #/vaults/<id>…), sends a new
 * learner to the welcome page first, and puts every page except the reader inside the Shell (Notes, for
 * every vault, and the Brain's graph fill the window below its bar; the rest scroll). The ⌘K palette and the agent
 * (⌘J) sit over every page; old #/ask links open the agent. Each page but Today is its own chunk,
 * loaded on first visit (the reader's, with the PDF engine, is fetched ahead once the app is idle); a
 * page that fails to draw or load says so, with a way to reload. */
import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { AgentPanel } from "../agent/AgentPanel";
import { openAgent } from "../agent/store";
import { learn } from "../api";
import { Loading } from "../components/feedback";
import { Today } from "../pages/Today";
import { startVaultSync } from "../vaults/sync/engine";
import { openLink } from "./navigation";
import { PageBoundary } from "./PageBoundary";
import { Palette } from "./Palette";
import { Shell } from "./Shell";
import { useTheme } from "./theme";

const loadReader = () => import("../reader/Reader");
const Reader = lazy(() => loadReader().then((m) => ({ default: m.Reader })));
const Vaults = lazy(() => import("../vaults/Vaults").then((m) => ({ default: m.Vaults })));
const Brain = lazy(() => import("../pages/brain/Brain").then((m) => ({ default: m.Brain })));
const Gallery = lazy(() => import("../pages/Gallery").then((m) => ({ default: m.Gallery })));
const Journey = lazy(() => import("../pages/Journey").then((m) => ({ default: m.Journey })));
const Library = lazy(() => import("../pages/Library").then((m) => ({ default: m.Library })));
const Review = lazy(() => import("../pages/Review").then((m) => ({ default: m.Review })));
const Settings = lazy(() => import("../pages/Settings").then((m) => ({ default: m.Settings })));
const Welcome = lazy(() => import("../pages/Welcome").then((m) => ({ default: m.Welcome })));

type Route =
  | { name: "book"; id: string }
  | {
      full?: boolean;
      name:
        | "today"
        | "library"
        | "notes"
        | "vaults"
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
  vaults: "Notes",
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
  // pages that fill the window: Notes (the vaults), and the Brain's graph (not a concept's own page)
  const full = name === "notes" || name === "vaults" || (name === "brain" && !hash.startsWith("#/brain/concept/"));
  if (
    ["library", "notes", "vaults", "review", "brain", "journey", "settings", "gallery", "welcome", "open"].includes(
      name,
    )
  )
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

export function App() {
  const [current, setCurrent] = useState(route);
  const [theme, setTheme] = useTheme();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  // synced vaults follow their folders on this computer whichever page is open
  useEffect(() => startVaultSync(), []);
  useEffect(() => {
    redirectAsk();
    const onHash = () => {
      redirectAsk();
      const next = route();
      setCurrent((old) =>
        old.name === next.name &&
        (old as { id?: string }).id === (next as { id?: string }).id &&
        (old as { full?: boolean }).full === (next as { full?: boolean }).full
          ? old
          : next,
      );
    };
    window.addEventListener("hashchange", onHash);
    // the reader is where most visits lead: fetch its code ahead, once nothing else is going on
    const idle = window.requestIdleCallback || ((f: () => void) => setTimeout(f, 2000));
    idle(() => void loadReader().catch(() => {}));
    learn.profile().then(
      (p) => setOnboarded(p.onboarded),
      () => setOnboarded(true),
    );
    return () => window.removeEventListener("hashchange", onHash);
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
  else if (current.name === "notes" || current.name === "vaults") page = <Vaults theme={theme} />;
  else if (current.name === "open") page = <OpenLink />;
  else if (current.name === "review") page = <Review theme={theme} />;
  else if (current.name === "brain") page = <Brain theme={theme} />;
  else if (current.name === "journey") page = <Journey />;
  else if (current.name === "settings") page = <Settings />;
  else if (current.name === "gallery") page = <Gallery theme={theme} />;
  else page = <Today />;
  return (
    <>
      <Shell theme={theme} setTheme={setTheme} full={current.full}>
        <PageBoundary key={current.name}>
          <Suspense fallback={<Loading />}>{page}</Suspense>
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
