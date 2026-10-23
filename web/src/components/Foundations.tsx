/* One line naming what something builds on that the learner is forgetting (the concepts it needs
 * first, with recall under 55%), linked to their pages, with a refresher when there's one to offer.
 * Nothing at all when no foundation is fading: it never locks anything, it only says. */
import { useEffect, useState } from "react";
import { type ConceptBrief, learn } from "../api";
import { levelOf } from "./GraphView";

export function Foundations({
  concepts,
  lead,
  onRefresh,
}: {
  /** The concepts (names or ids) whose foundations to look at. */
  concepts: string[];
  /** How the line starts: "This chapter builds on", "Your misses build on". */
  lead: string;
  /** Starts a refresher on the fading ones (their ids). */
  onRefresh?: (ids: string[]) => void;
}) {
  const [list, setList] = useState<ConceptBrief[]>([]);
  const key = concepts.join("\u0000");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the list of concepts
  useEffect(() => {
    let alive = true;
    setList([]);
    if (concepts.length)
      learn
        .foundations(concepts)
        .then((found) => alive && setList(found))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  const fading = list.filter((c) => levelOf(c.mastery) === "weak").slice(0, 3);
  if (!fading.length) return null;
  return (
    <p className="notice foundations">
      <span>
        {lead}{" "}
        {fading.map((c, i) => (
          <span key={c.id}>
            {i > 0 && (i === fading.length - 1 ? " and " : ", ")}
            <a href={`#/brain/concept/${c.id}`}>{c.title}</a>
          </span>
        ))}
        , which you’re forgetting.{" "}
        {onRefresh && (
          <button type="button" className="link" onClick={() => onRefresh(fading.map((c) => c.id))}>
            Refresh {fading.length === 1 ? "it" : "them"} first
          </button>
        )}
      </span>
    </p>
  );
}
