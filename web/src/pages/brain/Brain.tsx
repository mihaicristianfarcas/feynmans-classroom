import { useEffect, useState } from "react";
import { openLink } from "../../app/navigation";
import { useIndicator } from "../../components/ui";
import { ConceptPage } from "./ConceptPage";
import { GraphTab } from "./GraphTab";
import { ConceptsTab, FiguresTab, NotesTab } from "./lists";

type Tab = "graph" | "concepts" | "notes" | "figures";

/** #/brain[/tab] · #/brain/concept/:id · #/brain/note/:id · #/brain/new · #/brain/find/:target */
export function Brain({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const path = hash.split("?")[0].replace(/^#\/brain\/?/, "");
  const [section, id] = [path.split("/")[0], decodeURIComponent(path.split("/").slice(1).join("/"))];
  if (section === "concept" && id) return <ConceptPage key={id} id={id} theme={theme} />;
  if (section === "note" && id) return <Redirect to={`#/notes/${id}`} />;
  if (section === "new") return <Redirect to="#/notes" />;
  if (section === "find" && id) return <Find target={id} />;
  return (
    <BrainHome
      tab={(["graph", "concepts", "notes", "figures"].includes(section) ? section : "graph") as Tab}
      theme={theme}
    />
  );
}

/** Old [[link]] routes: resolve the link the same way notes do. */
function Find({ target }: { target: string }) {
  useEffect(() => {
    openLink(target);
  }, [target]);
  return <div className="center-note">Opening “{target}”…</div>;
}

function BrainHome({ tab, theme }: { tab: Tab; theme: "light" | "dark" }) {
  const [filter, setFilter] = useState("");
  const tabs = useIndicator<HTMLElement>(tab);
  return (
    <div className="brain rise">
      <header className="page-head row">
        <h1 className="page-title">Your brain</h1>
        <span className="spacer" />
        <input
          className="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter"
        />
        <a className="button primary" href="#/notes">
          Notes
        </a>
      </header>
      <nav className="tabs" aria-label="Brain sections" ref={tabs}>
        {(["graph", "concepts", "notes", "figures"] as Tab[]).map((t) => (
          <a key={t} href={`#/brain/${t}`} className="tab" aria-current={tab === t ? "page" : undefined}>
            {t[0].toUpperCase() + t.slice(1)}
          </a>
        ))}
      </nav>
      {tab === "graph" && <GraphTab filter={filter} />}
      {tab === "concepts" && <ConceptsTab filter={filter} />}
      {tab === "notes" && <NotesTab filter={filter} theme={theme} />}
      {tab === "figures" && <FiguresTab filter={filter} theme={theme} />}
    </div>
  );
}

/** Notes moved to #/notes: old links go there. */
function Redirect({ to }: { to: string }) {
  useEffect(() => {
    location.replace(to);
  }, [to]);
  return <div className="center-note">Opening…</div>;
}
