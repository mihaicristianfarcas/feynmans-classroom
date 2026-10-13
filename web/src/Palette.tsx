import { useEffect, useRef, useState } from "react";
import { bookLink, go, learn, type SearchHit } from "./api";

/** ⌘K: search everything (concepts, notes, cards, the books' text) and jump. */
export function Palette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 10);
  }, [open]);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    const t = setTimeout(() => learn.search(q).then((h) => (setHits(h), setIndex(0))), 140);
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
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Search">
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes, concepts, annotations, cards and your books… (↵ on nothing asks the library)"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIndex((i) => Math.min(hits.length - 1, i + 1));
            else if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
            else if (e.key === "Enter") pick(hits[index]);
          }}
        />
        <ul className="palette-hits">
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.id}`} data-on={i === index || undefined} onMouseEnter={() => setIndex(i)} onClick={() => pick(h)}>
              <span className="eyebrow">{h.kind}</span>
              <span className="hit-title">{h.title}</span>
              <span className="fine">{h.snippet}</span>
            </li>
          ))}
          {q.trim() && !hits.length && <li className="fine">No matches. Press ↵ to ask your library instead.</li>}
        </ul>
      </div>
    </div>
  );
}
