/* The margin: what was made from passages (explanations, definitions, answers, figures, resources,
 * comments), each as a card beside its passage, as in a well-annotated book. One card is open at a time
 * (the focused one: just made, clicked, or opened from its passage), shown whole and on a line of its
 * own; the others are closed to a line, and to just their first line where passages crowd together.
 * Cards whose passages overlap (or share a paragraph of a reflowable book) sit side by side in one row;
 * rows never overlap: the focused one (or, when none is, the one for the passage at the reading line)
 * sits exactly by its passage and the others make room above and below it (as comments do in a shared
 * document). Follow-up questions on a card read as a conversation, drawn like the tutor's.
 *
 * Positions follow the book's scroll without React re-rendering: the reader announces each scroll
 * frame on `bus`, and the margin moves its cards directly. Scrolling over the margin scrolls the book. */
import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Annotation, Book, Demo } from "../api";
import { AnnotationCard, DemoCard, type ToNote } from "./MarginCards";
import { LINE } from "./position";
import type { ReaderHandle } from "./readers";

export type MarginItem =
  | { id: string; annotation: Annotation; demo?: undefined }
  | { id: string; demo: Demo; annotation?: undefined };

/** Space between cards, and between a row's cards. */
const GAP = 10;
/** A card is never narrower than this; a row with more cards than fit wraps onto another line. */
const MIN_CARD = 230;
/** The height a card not yet drawn is taken to have. */
const GUESS = 180;
/** Passages that start closer than this make a crowded stretch: their closed cards show one line. */
const CROWD = 70;

interface Props {
  book: Book;
  items: MarginItem[];
  reader: RefObject<ReaderHandle | null>;
  bus: EventTarget;
  focused: string | null;
  setFocused: (id: string | null) => void;
  setHovered: (id: string | null) => void;
  theme: "light" | "dark";
  onToNote: ToNote;
  /** Opens a figure large (by its id: an annotation's or a chapter figure's). */
  onOpenFigure: (id: string) => void;
  /** Figure numbers by id ("Fig 3.2"). */
  figs: Map<string, string>;
  toast: (text: string) => void;
}

/** Where a passage is on screen: the top of its first line and the bottom of its last. */
interface Extent {
  top: number;
  bottom: number;
}

export function Margin({
  book,
  items,
  reader,
  bus,
  focused,
  setFocused,
  setHovered,
  theme,
  onToNote,
  onOpenFigure,
  figs,
  toast,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const heights = useRef(new Map<string, number>());
  const [shown, setShown] = useState<string[]>([]);
  const shownRef = useRef<string[]>([]);
  const [crowded, setCrowded] = useState<Set<string>>(() => new Set());
  const crowdedRef = useRef("");
  const scrolling = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settling = useRef<ReturnType<typeof setTimeout>>(undefined);
  const leadRef = useRef<string | null>(null);

  /** Where an item's passage is on screen right now, or null when its page isn't rendered. */
  const extentOf = useCallback(
    (item: MarginItem): Extent | null => {
      const r = reader.current;
      if (!r) return null;
      if (item.annotation) {
        const a = item.annotation.source;
        const boxes = r.boxesOf(a, item.id);
        if (boxes?.length)
          return { top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)) };
        const y =
          a.page !== undefined ? r.clientYOf({ page: a.page, y: a.y ?? 0 }) : r.clientYOf({ block: a.block ?? 0 });
        return y === null ? null : { top: y, bottom: y + 16 };
      }
      const y = r.clientYOf(item.demo!.anchor);
      return y === null ? null : { top: y, bottom: y + 16 };
    },
    [reader],
  );

  const layout = useCallback(() => {
    const host = box.current;
    if (!host) return;
    const frame = host.getBoundingClientRect();
    const width = Math.max(MIN_CARD, host.clientWidth - 24);
    // on a narrow screen the margin sits under the book: it lists the cards for what's on screen, in order
    const pane = reader.current?.scroller()?.getBoundingClientRect();
    const stacked = !!pane && frame.top >= pane.bottom - 4;
    host.toggleAttribute("data-stacked", stacked);
    // the passages on screen (and around it), top to bottom; a plain highlight shows a card only when opened
    const placed = items
      .filter((item) => item.annotation?.type !== "highlight" || item.id === focused)
      .map((item) => ({ item, at: extentOf(item) }))
      .filter((p): p is { item: MarginItem; at: Extent } => p.at !== null)
      .filter((p) => !stacked || !pane || (p.at.bottom > pane.top && p.at.top < pane.bottom))
      .sort(
        (a, b) =>
          a.at.top - b.at.top ||
          (a.item.annotation?.created || a.item.demo?.createdAt || "").localeCompare(
            b.item.annotation?.created || b.item.demo?.createdAt || "",
          ),
      );
    // a crowded stretch (read from where the passages are, not from card sizes, so it never flickers):
    // closed cards there show just their first line
    const crowd = placed
      .filter(
        (p, i) =>
          (i > 0 && p.at.top - placed[i - 1].at.top < CROWD) ||
          (i < placed.length - 1 && placed[i + 1].at.top - p.at.top < CROWD),
      )
      .map((p) => p.item.id);
    if (crowd.join() !== crowdedRef.current) {
      crowdedRef.current = crowd.join();
      setCrowded(new Set(crowd));
    }
    // rows: passages that overlap on screen, or share a block of a reflowable book
    const rows: { ids: string[]; top: number; bottom: number; block?: number }[] = [];
    for (const p of placed) {
      const last = rows[rows.length - 1];
      const block = p.item.annotation?.source.block ?? p.item.demo?.anchor.block;
      const sameBlock = block !== undefined && last?.block === block;
      if (last && (p.at.top < last.bottom - 3 || sameBlock)) {
        last.ids.push(p.item.id);
        last.bottom = Math.max(last.bottom, p.at.bottom);
      } else rows.push({ ids: [p.item.id], top: p.at.top, bottom: p.at.bottom, block });
    }
    // each row's cards side by side, wrapping onto more lines when they don't fit
    const heightOf = (id: string) => {
      const el = cards.current.get(id);
      if (el) heights.current.set(id, el.offsetHeight);
      return heights.current.get(id) ?? GUESS;
    };
    const cells = new Map<string, { x: number; dy: number; w: number }>();
    const rowHeights = rows.map((row) => {
      const perLine = Math.max(1, Math.min(row.ids.length, Math.floor((width + GAP) / (MIN_CARD + GAP))));
      // the open card has a line of its own, the full width, and its row's closed cards follow it
      const open = focused && row.ids.includes(focused) ? [focused] : [];
      const rest = row.ids.filter((id) => id !== focused);
      const lines = open.length ? [open] : [];
      for (let start = 0; start < rest.length; start += perLine) lines.push(rest.slice(start, start + perLine));
      let dy = 0;
      for (const line of lines) {
        const w = (width - (line.length - 1) * GAP) / line.length;
        let tallest = 0;
        line.forEach((id, i) => {
          const el = cards.current.get(id);
          if (el && el.dataset.w !== String(Math.round(w))) {
            el.style.width = `${w}px`;
            el.dataset.w = String(Math.round(w));
          }
          cells.set(id, { x: i * (w + GAP), dy, w });
          tallest = Math.max(tallest, heightOf(id));
        });
        dy += tallest + GAP;
      }
      return dy - GAP;
    });
    // rows make room for each other; one stays by its passage: the focused one, else the one being read
    // (the last whose passage starts above the reading line), so the cards for what you're reading are
    // beside it however long the cards before them are
    const tops = rows.map((row) => (stacked ? 12 : row.top - frame.top));
    let f = focused ? rows.findIndex((row) => row.ids.includes(focused)) : -1;
    // the focused card leads while its passage is on screen; scrolled away from, the reading line leads again
    if (f >= 0 && pane && (rows[f].bottom < pane.top || rows[f].top > pane.bottom)) f = -1;
    if (stacked) f = rows.length ? 0 : -1;
    else if (f < 0 && rows.length) {
      const line = pane ? pane.top + pane.height * LINE : frame.top + frame.height * LINE;
      f = 0;
      for (let i = 0; i < rows.length; i++) if (rows[i].top <= line + 8) f = i;
    }
    if (f >= 0) {
      for (let i = f - 1; i >= 0; i--) tops[i] = Math.min(tops[i], tops[i + 1] - rowHeights[i] - GAP);
      for (let i = f + 1; i < rows.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + rowHeights[i - 1] + GAP);
    }
    // when another row takes the lead while scrolling, the cards slide to their new places
    const lead = f >= 0 ? rows[f].ids.join() : "";
    if (lead !== leadRef.current) {
      if (leadRef.current !== null && host.hasAttribute("data-scrolling")) {
        host.setAttribute("data-settling", "");
        clearTimeout(settling.current);
        settling.current = setTimeout(() => host.removeAttribute("data-settling"), 260);
      }
      leadRef.current = lead;
    }
    // only the cards on screen (and a screen around it) are drawn
    const near = rows.flatMap((row, i) =>
      stacked || (tops[i] + rowHeights[i] > -frame.height && tops[i] < frame.height * 2) ? row.ids : [],
    );
    if (near.join() !== shownRef.current.join()) {
      shownRef.current = near;
      setShown(near);
    }
    rows.forEach((row, i) => {
      for (const id of row.ids) {
        const el = cards.current.get(id);
        const cell = cells.get(id);
        if (!el || !cell) continue;
        el.style.transform = `translate(${Math.round(cell.x)}px, ${Math.round(tops[i] + cell.dy)}px)`;
        el.style.visibility = "visible";
      }
    });
  }, [items, extentOf, focused, reader]);

  useEffect(() => {
    const onScroll = () => {
      box.current?.setAttribute("data-scrolling", "");
      clearTimeout(scrolling.current);
      scrolling.current = setTimeout(() => box.current?.removeAttribute("data-scrolling"), 160);
      layout();
    };
    bus.addEventListener("scroll", onScroll);
    return () => bus.removeEventListener("scroll", onScroll);
  }, [bus, layout]);
  useLayoutEffect(() => {
    layout();
  });
  // cards change height as answers arrive, figures render and the panel is resized
  // biome-ignore lint/correctness/useExhaustiveDependencies: observes the cards again whenever the set of shown cards changes
  useEffect(() => {
    const ro = new ResizeObserver(() => layout());
    for (const el of cards.current.values()) ro.observe(el);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [shown, layout]);

  // the card opened from the book (a click on its passage, a link) takes focus when focus was in the margin
  const lastFocused = useRef(focused);
  useEffect(() => {
    const was = lastFocused.current;
    lastFocused.current = focused;
    if (!focused || focused === was) return;
    const active = document.activeElement;
    if (active && active !== document.body && !box.current?.contains(active)) return;
    requestAnimationFrame(() =>
      cards.current.get(focused)?.querySelector<HTMLElement>(".mcard")?.focus({ preventScroll: true }),
    );
  }, [focused]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const visible = shown.map((id) => byId.get(id)).filter((x): x is MarginItem => !!x);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the empty margin lets go of the focused card; Escape does the same
    // biome-ignore lint/a11y/noStaticElementInteractions: as above
    <div
      className="margin"
      ref={box}
      onClick={(e) => e.target === box.current && setFocused(null)}
      onWheel={(e) => {
        // the margin follows the book: scrolling over it scrolls the book (a pinch or a sideways swipe stays
        // here, and so does scrolling a margin listed under the book, on a narrow screen)
        if (
          e.ctrlKey ||
          e.metaKey ||
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ||
          box.current?.hasAttribute("data-stacked")
        )
          return;
        reader.current?.scroller()?.scrollBy({ top: e.deltaY * (e.deltaMode === 1 ? 18 : 1) });
      }}
    >
      {visible.map((item) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: hovering or focusing a card marks its passage in the book
        // biome-ignore lint/a11y/useKeyWithClickEvents: a click lines the card up with its passage; focusing it from the keyboard marks the passage too
        <div
          key={item.id}
          className="margin-slot"
          data-focused={item.id === focused || undefined}
          ref={(el) => {
            if (el) cards.current.set(item.id, el);
            else cards.current.delete(item.id);
          }}
          onMouseEnter={() => setHovered(item.id)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(item.id)}
          onBlur={() => setHovered(null)}
          onClick={() => item.id !== focused && setFocused(item.id)}
        >
          {item.annotation ? (
            <AnnotationCard
              a={item.annotation}
              book={book}
              fig={figs.get(item.id)}
              focused={item.id === focused}
              open={item.id === focused}
              mini={crowded.has(item.id)}
              onOpenCard={() => setFocused(item.id)}
              theme={theme}
              onToNote={onToNote}
              onOpen={() => onOpenFigure(item.id)}
              toast={toast}
            />
          ) : (
            <DemoCard
              demo={item.demo!}
              fig={figs.get(item.id) || item.demo!.fig}
              theme={theme}
              open={item.id === focused}
              mini={crowded.has(item.id)}
              onOpenCard={() => setFocused(item.id)}
              onOpen={() => onOpenFigure(item.id)}
            />
          )}
        </div>
      ))}
      {!items.some((i) => i.annotation && i.annotation.type !== "highlight") && !items.some((i) => i.demo) && (
        <div className="margin-empty rise">
          <p className="margin-empty-title">The margin</p>
          <p className="fine">
            Select a passage in the book and choose Explain, Visualize, Ask or Define. The answer appears here, beside
            the passage, and is saved with the book in your vault.
          </p>
        </div>
      )}
    </div>
  );
}
