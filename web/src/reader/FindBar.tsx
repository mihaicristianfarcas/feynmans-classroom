/* Find in the book (⌘F or /): a field over the book's top corner that finds a phrase on every page
 * (not just the ones on screen), steps through the places it occurs (Enter, Shift+Enter, the arrows),
 * says which one you're on, and goes there with the phrase marked. Below it, every place it occurs,
 * by chapter, each with its page and the words around it: choose one to go straight there (the list
 * can be hidden, and stays as you left it). */
import { ChevronDown, ChevronUp, List, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { api, type Book, type FindHit } from "../api";
import { announce, useArrowKeys } from "../lib/a11y";

const LIST_KEY = "classroom-find-list";
const listShown = () => {
  try {
    return localStorage.getItem(LIST_KEY) !== "0";
  } catch {
    return true;
  }
};

/** The words before a hit, cut at a word so the line starts cleanly. */
const lead = (prefix: string) => {
  const text = prefix.replace(/\s+/g, " ");
  const at = text.indexOf(" ");
  return at > 0 && at < text.length - 1 && text.length >= 24 ? `…${text.slice(at + 1)}` : text;
};
const tail = (suffix: string) => {
  const text = suffix.replace(/\s+/g, " ");
  const at = text.lastIndexOf(" ");
  return at > 0 && text.length >= 24 ? `${text.slice(0, at)}…` : text;
};

export function FindBar({
  book,
  onGo,
  onClose,
}: {
  book: Book;
  /** Goes to a place the phrase occurs (null when there is none to show). */
  onGo: (hit: FindHit | null, key: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FindHit[] | null>(null);
  const [index, setIndex] = useState(0);
  const [showList, setShowList] = useState(listShown);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  useArrowKeys(list, { selector: ".find-hit", orientation: "vertical", select: true });
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: searches again as the phrase changes (a moment after typing stops)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      onGo(null, "");
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api.find(book.id, q).then(
        (found) => {
          if (!alive) return;
          setHits(found);
          setIndex(0);
          announce(found.length ? `${found.length} found` : "Not found");
          onGo(found[0] || null, `find-${q}-0`);
        },
        () => alive && setHits([]),
      );
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, book.id]);
  const go = (next: number) => {
    if (!hits?.length) return;
    setIndex(next);
    onGo(hits[next], `find-${query.trim()}-${next}`);
  };
  const step = (by: number) => hits?.length && go((index + by + hits.length) % hits.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the current place stays in view in the list as you step through (and when it opens)
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, hits, showList]);
  const toggleList = () => {
    setShowList(!showList);
    try {
      localStorage.setItem(LIST_KEY, showList ? "0" : "1");
    } catch {}
  };
  const hit = hits?.[index];
  const titleOf = (id?: string) => (id ? book.toc.find((c) => c.id === id)?.title : undefined);
  const chapter = titleOf(hit?.chapterId);
  const where = (h: FindHit) =>
    h.page !== undefined
      ? `p. ${h.page}`
      : `${Math.round(((h.block ?? 0) / Math.max(1, book.blockCount || 1)) * 100)}%`;
  return (
    <search
      className="find-bar"
      aria-label="Find in the book"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <input
        ref={field}
        type="search"
        value={query}
        aria-label="Find in the book"
        placeholder="Find in the book"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            step(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
          }
        }}
      />
      <span className="find-count" aria-live="polite">
        {hits === null
          ? ""
          : hits.length
            ? `${index + 1} of ${hits.length}${hits.length >= 500 ? "+" : ""}`
            : "Not found"}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label="Previous"
        title="Previous (Shift+Enter)"
        disabled={!hits?.length}
        onClick={() => step(-1)}
      >
        <ChevronUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Next"
        title="Next (Enter)"
        disabled={!hits?.length}
        onClick={() => step(1)}
      >
        <ChevronDown aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="List every place"
        aria-expanded={showList}
        aria-controls="find-list"
        title={showList ? "Hide the list" : "List every place"}
        onClick={toggleList}
      >
        <List aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" aria-label="Close" title="Close (Esc)" onClick={onClose}>
        <X aria-hidden="true" />
      </button>
      {chapter && !(showList && hits && hits.length > 1) && <span className="find-where">{chapter}</span>}
      {showList && hits && hits.length > 1 && (
        <ol className="find-list" id="find-list" ref={list} aria-label="Every place it occurs">
          {hits.map((h, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one search's results, replaced whole when the phrase changes
            <Fragment key={i}>
              {h.chapterId !== hits[i - 1]?.chapterId && titleOf(h.chapterId) && (
                <li className="find-chapter" aria-hidden="true">
                  {titleOf(h.chapterId)}
                </li>
              )}
              <li>
                <button
                  type="button"
                  className="find-hit"
                  aria-current={i === index ? "true" : undefined}
                  aria-label={`${where(h)}${titleOf(h.chapterId) ? `, ${titleOf(h.chapterId)}` : ""}: ${lead(h.prefix)}${h.quote}${tail(h.suffix)}`}
                  onClick={() => go(i)}
                >
                  <span className="find-at">{where(h)}</span>
                  <span className="find-context">
                    {lead(h.prefix)}
                    <mark>{h.quote}</mark>
                    {tail(h.suffix)}
                  </span>
                </button>
              </li>
            </Fragment>
          ))}
        </ol>
      )}
    </search>
  );
}
