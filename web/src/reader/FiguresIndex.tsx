/* The reader's Figures pane: an index of the figures made in this book, for the section you're in,
 * its chapter or the whole book, grouped by chapter and section. Each is a still of the figure with its
 * number and title: choosing it goes to its passage (its card opens in the margin); the button beside
 * it opens it large. Figures are made from passages (select, then Visualize), so this pane only lists. */
import { Clapperboard, Maximize2, Shapes } from "lucide-react";
import { useMemo, useState } from "react";
import type { TocEntry } from "../api";
import { useIndicator } from "../components/ui";
import { usePoster } from "../manim/poster";
import { SceneThumb } from "../scene/SceneThumb";
import type { FigureEntry } from "./figures";

type Scope = "section" | "chapter" | "book";

export function FiguresIndex({
  entries,
  chapter,
  section,
  theme,
  onGo,
  onOpen,
}: {
  entries: FigureEntry[];
  chapter: TocEntry | null;
  section: { id: string; title: string } | null;
  theme: "light" | "dark";
  onGo: (entry: FigureEntry) => void;
  onOpen: (entry: FigureEntry) => void;
}) {
  const [picked, setScope] = useState<Scope>(() => {
    try {
      return (localStorage.getItem("classroom-figures-scope") as Scope) || "chapter";
    } catch {
      return "chapter";
    }
  });
  const hasSections = !!chapter?.sections.length;
  const scope: Scope = picked === "section" && !hasSections ? "chapter" : picked;
  const choose = (s: Scope) => {
    setScope(s);
    try {
      localStorage.setItem("classroom-figures-scope", s);
    } catch {}
  };
  const scopes = useIndicator<HTMLFieldSetElement>(scope);
  const shown = useMemo(
    () =>
      entries.filter((e) =>
        scope === "book"
          ? true
          : scope === "chapter"
            ? e.chapter?.id === chapter?.id
            : e.chapter?.id === chapter?.id && e.section?.id === section?.id,
      ),
    [entries, scope, chapter, section],
  );
  // chapters, then sections, in reading order
  const groups = useMemo(() => {
    const out: { chapter: TocEntry | null; sections: { section: FigureEntry["section"]; items: FigureEntry[] }[] }[] =
      [];
    for (const e of shown) {
      let g = out.find((x) => x.chapter?.id === e.chapter?.id);
      if (!g) {
        g = { chapter: e.chapter, sections: [] };
        out.push(g);
      }
      let s = g.sections.find((x) => x.section?.id === e.section?.id);
      if (!s) {
        s = { section: e.section, items: [] };
        g.sections.push(s);
      }
      s.items.push(e);
    }
    return out;
  }, [shown]);
  const where = scope === "book" ? "this book" : scope === "chapter" ? "this chapter" : "this section";

  return (
    <div className="figures-index">
      <div className="figures-head">
        <fieldset className="segmented" ref={scopes}>
          <legend className="visually-hidden">Which figures</legend>
          {hasSections && (
            <button
              type="button"
              aria-pressed={scope === "section"}
              onClick={() => choose("section")}
              title={section ? `Figures in “${section.title}”` : "Figures in this section"}
            >
              Section
            </button>
          )}
          <button type="button" aria-pressed={scope === "chapter"} onClick={() => choose("chapter")}>
            Chapter
          </button>
          <button type="button" aria-pressed={scope === "book"} onClick={() => choose("book")}>
            Book
          </button>
        </fieldset>
        <span className="fine" aria-live="polite">
          {shown.length} figure{shown.length === 1 ? "" : "s"}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="fine figures-empty">
          No figures in {where} yet. The figures and animations you make from passages are listed here.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.chapter?.id || "none"} className="figures-group" aria-label={g.chapter?.title || "Figures"}>
            {(scope === "book" || scope === "chapter") && (
              <h2 className="figures-chapter">
                {g.chapter?.title || "Before the first chapter"}
                {g.chapter?.subtitle ? <span> · {g.chapter.subtitle}</span> : null}
              </h2>
            )}
            {g.sections.map((s) => (
              <div key={s.section?.id || "none"}>
                {s.section && scope !== "section" && <h3 className="figures-section">{s.section.title}</h3>}
                <ul className="figure-rows">
                  {s.items.map((e) => (
                    <li key={e.id}>
                      <button type="button" className="figure-row" onClick={() => onGo(e)} data-status={e.status}>
                        <span className="figure-still" data-kind={e.kind}>
                          {e.kind === "scene" && e.scene && e.status === "ready" ? (
                            <SceneThumb spec={e.scene} theme={theme} />
                          ) : e.kind === "animation" && e.animation && e.status === "ready" ? (
                            <AnimationStill code={e.animation} theme={theme} />
                          ) : e.kind === "animation" ? (
                            <Clapperboard aria-hidden="true" />
                          ) : (
                            <Shapes aria-hidden="true" />
                          )}
                        </span>
                        <span className="figure-text">
                          <span className="figure-fig">
                            {e.fig}
                            {e.kind === "animation" ? " · animation" : e.kind === "handbuilt" ? " · hand-built" : ""}
                            {e.loc.page !== undefined ? ` · p. ${e.loc.page}` : ""}
                          </span>
                          <span className="figure-title">{e.title}</span>
                          <span className="figure-caption">
                            {e.status === "pending"
                              ? "Being drawn…"
                              : e.status === "failed"
                                ? `Couldn’t finish: ${e.error || "something went wrong"}`
                                : e.caption || `“${e.quote.slice(0, 90)}${e.quote.length > 90 ? "…" : ""}”`}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Open ${e.fig} large`}
                        title="Open large"
                        disabled={e.status !== "ready"}
                        onClick={() => onOpen(e)}
                      >
                        <Maximize2 aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/** An animation's still, or its sign until there is one. */
function AnimationStill({ code, theme }: { code: string; theme: "light" | "dark" }) {
  const still = usePoster(code, theme);
  return still ? <img className="figure-still-img" src={still} alt="" /> : <Clapperboard aria-hidden="true" />;
}
