/* The Brain (#/brain): your vault as one graph that fills the page (BrainGraph), and each concept's own
 * page (#/brain/concept/<id>). Older routes still land somewhere: the lists that were tabs here open
 * the graph, figures moved to the library, notes to #/notes, and #/brain/find/<target> opens a link. */
import { useEffect, useState } from "react";
import { openLink } from "../../app/navigation";
import { BrainGraph } from "./BrainGraph";
import { ConceptPage } from "./ConceptPage";

/** #/brain · #/brain/concept/:id · #/brain/note/:id · #/brain/new · #/brain/figures · #/brain/find/:target */
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
  if (section === "figures") return <Redirect to="#/library/figures" />;
  if (section === "find" && id) return <Find target={id} />;
  return <BrainGraph theme={theme} />;
}

/** Old [[link]] routes: resolve the link the same way notes do. */
function Find({ target }: { target: string }) {
  useEffect(() => {
    openLink(target);
  }, [target]);
  return <div className="center-note">Opening “{target}”…</div>;
}

/** Routes that moved: old links go to the new place. */
function Redirect({ to }: { to: string }) {
  useEffect(() => {
    location.replace(to);
  }, [to]);
  return <div className="center-note">Opening…</div>;
}
