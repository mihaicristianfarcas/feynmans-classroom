/* ⌘K (Ctrl K): search everything (concepts, notes, annotations, cards, the books' text) and jump to
 * it; with no match, Enter asks the library instead. A combobox: type to search, arrow keys move
 * through the results, Enter opens one, Escape closes and gives focus back. */
import { CornerDownLeft, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { learn, type SearchHit } from "../api";
import { announce, useFocusTrap } from "../lib/a11y";
import { bookLink, go } from "./navigation";

const KIND_TONE: Record<string, string> = {
  concept: "sage",
  note: "sky",
  annotation: "lavender",
  card: "butter",
  book: "peach",
  passage: "peach",
};

export function Palette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, open, { onEscape: () => setOpen(false), initial: "input" });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("classroom:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("classroom:palette", onOpen);
    };
  }, []);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    const t = setTimeout(
      () =>
        learn.search(q).then((h) => {
          setHits(h);
          setIndex(0);
          announce(h.length ? `${h.length} result${h.length === 1 ? "" : "s"}` : "No matches");
        }),
      140,
    );
    return () => clearTimeout(t);
  }, [q]);
  if (!open) return null;
  const pick = (h: SearchHit | undefined) => {
    if (!h) {
      if (q.trim()) go(`#/ask?q=${encodeURIComponent(q.trim())}`);
    } else if (h.kind === "concept") go(`#/brain/concept/${h.id}`);
    else if (h.kind === "note") go(`#/notes/${h.id}`);
    else if (h.kind === "card") go("#/brain/concepts");
    else if (h.kind === "annotation") go(`${bookLink({ bookId: h.bookId, ...(h.loc || {}) })}&focus=${h.id}`);
    else go(bookLink({ bookId: h.bookId, ...(h.loc || {}) }));
    setOpen(false);
    setQ("");
  };
  const optionId = (i: number) => `palette-hit-${i}`;
  const listed = hits.length > 0 || !!q.trim();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a click outside closes it; Escape does the same from the keyboard
    <div className="modal-back instant" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search everything" ref={box}>
        <div className="palette-field">
          <Search aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes, concepts, annotations, cards and books…"
            aria-label="Search notes, concepts, annotations, cards and books"
            role="combobox"
            aria-expanded={listed}
            aria-controls="palette-hits"
            aria-autocomplete="list"
            aria-activedescendant={hits.length ? optionId(index) : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(hits.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") pick(hits[index]);
            }}
          />
          <kbd>esc</kbd>
        </div>
        {listed && (
          // options are chosen from the field (arrow keys and Enter) or with the pointer; they aren't Tab stops
          <div className="palette-hits" id="palette-hits" role="listbox" aria-label="Results">
            {hits.map((h, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox field handles the keys for its options
              <div
                key={`${h.kind}-${h.id}`}
                id={optionId(i)}
                role="option"
                tabIndex={-1}
                aria-selected={i === index}
                data-on={i === index || undefined}
                onMouseEnter={() => setIndex(i)}
                onClick={() => pick(h)}
              >
                <span className="tag-pill" data-tone={KIND_TONE[h.kind] || undefined}>
                  {h.kind}
                </span>
                <span className="hit-text">
                  <span className="hit-title">{h.title}</span>
                  {h.snippet && <span className="hit-snippet">{h.snippet}</span>}
                </span>
                {i === index && <CornerDownLeft className="hit-enter" aria-hidden="true" />}
              </div>
            ))}
            {q.trim() && !hits.length && (
              // biome-ignore lint/a11y/useKeyWithClickEvents: Enter in the field does the same
              <div
                className="palette-empty"
                role="option"
                tabIndex={-1}
                aria-selected="true"
                onClick={() => pick(undefined)}
              >
                No matches. Press <kbd>↵</kbd> to ask your library instead.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
