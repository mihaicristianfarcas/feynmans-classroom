import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { learn, useTheme } from "./api";
import { Ask } from "./Ask";
import { Brain } from "./Brain";
import { Gallery } from "./Gallery";
import { Journey } from "./Journey";
import { Library } from "./Library";
import { Palette } from "./Palette";
import { Reader } from "./Reader";
import { Review } from "./Review";
import { Settings } from "./Settings";
import { Shell } from "./Shell";
import { Today } from "./Today";
import { Welcome } from "./Welcome";
import "./styles.css";
import "./app.css";

type Route = { name: "book"; id: string } | { name: "today" | "library" | "review" | "brain" | "ask" | "journey" | "settings" | "gallery" | "welcome" };

function route(): Route {
  const hash = location.hash.split("?")[0];
  const book = hash.match(/^#\/book\/([a-z0-9]+)/i);
  if (book) return { name: "book", id: book[1] };
  const name = hash.replace(/^#\/?/, "").split("/")[0];
  if (["library", "review", "brain", "ask", "journey", "settings", "gallery", "welcome"].includes(name)) return { name: name as Route["name"] } as Route;
  return { name: "today" };
}

function App() {
  const [current, setCurrent] = useState(route);
  const [theme, setTheme] = useTheme();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    const onHash = () => {
      const next = route();
      setCurrent((old) => (old.name === next.name && (old as { id?: string }).id === (next as { id?: string }).id ? old : next));
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

  let page;
  if (current.name === "book") return (
    <>
      <Reader key={current.id} bookId={current.id} theme={theme} setTheme={setTheme} />
      <Palette />
    </>
  );
  if (current.name === "welcome") page = <Welcome />;
  else if (current.name === "library") page = <Library />;
  else if (current.name === "review") page = <Review theme={theme} />;
  else if (current.name === "brain") page = <Brain theme={theme} />;
  else if (current.name === "ask") page = <Ask theme={theme} />;
  else if (current.name === "journey") page = <Journey />;
  else if (current.name === "settings") page = <Settings />;
  else if (current.name === "gallery") page = <Gallery theme={theme} />;
  else page = <Today />;
  return (
    <>
      <Shell theme={theme} setTheme={setTheme}>
        {page}
      </Shell>
      <Palette />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
