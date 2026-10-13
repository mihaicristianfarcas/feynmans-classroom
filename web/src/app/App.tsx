/* The app: picks the page from the URL's hash (#/library, #/book/<id>, #/notes/<id>…), sends a new
 * learner to the welcome page first, and puts every page except the reader inside the Shell (Notes
 * and the Brain's graph fill the window below its bar; the rest scroll). */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { learn } from "../api";
import { Notes } from "../notes/Notes";
import { Ask } from "../pages/Ask";
import { Brain } from "../pages/brain/Brain";
import { Gallery } from "../pages/Gallery";
import { Journey } from "../pages/Journey";
import { Library } from "../pages/Library";
import { Review } from "../pages/Review";
import { Settings } from "../pages/Settings";
import { Today } from "../pages/Today";
import { Welcome } from "../pages/Welcome";
import { Reader } from "../reader/Reader";
import { openLink } from "./navigation";
import { Palette } from "./Palette";
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
        | "ask"
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
  ask: "Ask",
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
  if (
    ["library", "notes", "review", "brain", "ask", "journey", "settings", "gallery", "welcome", "open"].includes(name)
  )
    return { name: name as Route["name"], full } as Route;
  return { name: "today" };
}

export function App() {
  const [current, setCurrent] = useState(route);
  const [theme, setTheme] = useTheme();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    const onHash = () => {
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
        <Reader key={current.id} bookId={current.id} theme={theme} setTheme={setTheme} />
        <Palette />
      </>
    );
  if (current.name === "welcome") page = <Welcome />;
  else if (current.name === "library") page = <Library theme={theme} />;
  else if (current.name === "notes") page = <Notes theme={theme} />;
  else if (current.name === "open") page = <OpenLink />;
  else if (current.name === "review") page = <Review theme={theme} />;
  else if (current.name === "brain") page = <Brain theme={theme} />;
  else if (current.name === "ask") page = <Ask theme={theme} />;
  else if (current.name === "journey") page = <Journey />;
  else if (current.name === "settings") page = <Settings />;
  else if (current.name === "gallery") page = <Gallery theme={theme} />;
  else page = <Today />;
  return (
    <>
      <Shell theme={theme} setTheme={setTheme} full={current.full}>
        {page}
      </Shell>
      <Palette />
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
