/* The bookcase: every book standing on planks, in runs (a topic, a month, a length) labelled under the
 * plank. Books are placed absolutely, so sorting or filtering slides each one to its new place instead
 * of reflowing; the shelves draw in and the books drop onto them when the page opens, and a book that
 * arrives while you look falls into its place. One Tab stop: the arrow keys walk along the shelf, and
 * Enter or a click takes a book down. */
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../api";
import { useArrowKeys } from "../lib/a11y";
import { bylineOf, Spine, TopicIcon } from "./Spine";
import { AREA, arrange, fmtMinutes, lookOf, minutesOf, PAD, PITCH, PLANK, progressOf, type Sort } from "./shelf";

interface Props {
  /** Every book that could stand on the shelf, in order. */
  books: Book[];
  /** The ids that pass the search and filter. */
  shown: Set<string>;
  sort: Sort;
  /** The book in your hands (its place stays empty). */
  openId: string | null;
  /** Books that just arrived: they fall into place. */
  fresh: Set<string>;
  onOpen: (book: Book, spine: HTMLElement, byKeyboard: boolean) => void;
  /** A label for a topic was clicked: show only that topic. */
  onTopic: (topic: string) => void;
}

export const Bookcase = memo(function Bookcase({ books, shown, sort, openId, fresh, onOpen, onTopic }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [entering, setEntering] = useState(true);
  useArrowKeys(ref, { selector: ".bk:not([data-out])", orientation: "both" });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    const t = setTimeout(() => setEntering(false), 1400);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, []);

  const visible = useMemo(() => books.filter((b) => shown.has(b.id)), [books, shown]);
  const { spots, labels, rows, ends } = useMemo(() => arrange(visible, width, sort), [visible, width, sort]);

  // a book filtered out stays where it stood while it fades; one coming back appears in its new place
  const last = useRef(new Map<string, { x: number; y: number }>());
  const wasOut = useRef(new Set<string>());
  const placed = books.map((book) => {
    const spot = spots.get(book.id);
    const out = !spot;
    const at = spot ?? last.current.get(book.id) ?? { x: PAD, y: AREA - lookOf(book).h };
    const jump = !out && (wasOut.current.has(book.id) || !last.current.has(book.id));
    return { book, at, out, jump };
  });
  useLayoutEffect(() => {
    for (const p of placed) if (!p.out) last.current.set(p.book.id, p.at);
    wasOut.current = new Set(placed.filter((p) => p.out).map((p) => p.book.id));
  });
  const order = new Map(visible.map((b, i) => [b.id, i]));
  const free = width - PAD - (ends[rows - 1] ?? PAD);

  return (
    <div ref={ref} className="bookcase" data-entering={entering || undefined} style={{ height: rows * PITCH - 6 }}>
      {Array.from({ length: rows }, (_, r) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: shelves are numbered from the top
          key={r}
          className="plank"
          style={{ transform: `translateY(${r * PITCH + AREA}px)`, ["--i" as string]: r }}
          aria-hidden="true"
        />
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: one bookend per shelf
          key={`end-${r}`}
          className="bookend"
          style={{ transform: `translate(${(ends[r] ?? PAD) + 4}px, ${r * PITCH + AREA - 58}px)` }}
          aria-hidden="true"
        />
      ))}
      <div
        className="shelf-stack"
        data-hidden={free < 200 || undefined}
        style={{ transform: `translate(${width - PAD - 150}px, ${(rows - 1) * PITCH + AREA - 40}px)` }}
        aria-hidden="true"
      >
        <span data-tone="sky" />
        <span data-tone="butter" />
        <span data-tone="rose" />
      </div>

      {labels.map((label) => {
        const style = { transform: `translate(${label.x}px, ${label.row * PITCH + AREA + PLANK + 8}px)` };
        const body = (
          <>
            {label.topic && <TopicIcon topic={label.topic} size={14} />}
            {label.label}
            <span className="plank-count">{label.count}</span>
          </>
        );
        return label.topic ? (
          <button
            key={`${sort}-${label.key}`}
            type="button"
            className="plank-label"
            style={style}
            onClick={() => onTopic(label.topic!)}
            aria-label={`Show only ${label.label} (${label.count})`}
          >
            {body}
          </button>
        ) : (
          <span key={`${sort}-${label.key}`} className="plank-label" style={style} aria-hidden="true">
            {body}
          </span>
        );
      })}

      <ul className="bk-list" aria-label="Your shelf">
        {width > 0 &&
          placed.map(({ book, at, out, jump }) => {
            const look = lookOf(book);
            const i = order.get(book.id) ?? 0;
            const pct = progressOf(book);
            const reading = pct > 0.01 && pct < 0.98;
            return (
              <li
                key={book.id}
                className="bk-x"
                data-jump={jump || undefined}
                style={{
                  transform: `translateX(${at.x}px)`,
                  transitionDelay: jump ? "0ms" : `${Math.min(i, 40) * 8}ms`,
                }}
                aria-hidden={out || undefined}
              >
                <div
                  className="bk-y"
                  data-jump={jump || undefined}
                  style={{
                    transform: `translateY(${at.y}px)`,
                    transitionDelay: jump ? "0ms" : `${Math.min(i, 40) * 8}ms`,
                  }}
                >
                  <div
                    className="bk-in"
                    data-out={out || undefined}
                    data-fresh={fresh.has(book.id) || undefined}
                    style={{ ["--i" as string]: Math.min(i, 36) }}
                  >
                    <button
                      type="button"
                      className="bk"
                      data-book={book.id}
                      data-out={out || undefined}
                      data-open={openId === book.id || undefined}
                      tabIndex={out ? -1 : undefined}
                      aria-haspopup="dialog"
                      aria-label={`${book.title}${bylineOf(book) ? `, ${bylineOf(book)}` : ""}, ${fmtMinutes(minutesOf(book))}${reading ? `, ${Math.round(pct * 100)}% read` : ""}`}
                      title={book.title}
                      onClick={(e) =>
                        onOpen(book, e.currentTarget.querySelector(".spine") as HTMLElement, e.detail === 0)
                      }
                    >
                      <Spine book={book} look={look} reading={reading} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
});
