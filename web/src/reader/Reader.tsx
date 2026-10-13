/* The reader (#/book/<id>): the book on the right and, on the left, its panes (the margin, figures,
 * your note, the tutor, the study tools). It keeps your place, follows the reading line, and has
 * keyboard shortcuts for everything (press ? to see them). */
import { ArrowLeft, CircleHelp, Crop, Layers, Pin, PinOff, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Anchor,
  type Annotation,
  api,
  type Block,
  type Book,
  type Demo,
  type Loc,
  learn,
  type Note,
  posOf,
  type SourceRef,
  useBookLive,
  withFigs,
} from "../api";
import { SkipLink, ThemeButton, useDueCount } from "../app/Shell";
import { CardDrafter, Connector, ExplainBack } from "../components/tools";
import { useIndicator } from "../components/ui";
import { useArrowKeys, useFocusTrap } from "../lib/a11y";
import { blockAnchor, pdfAnchor } from "./anchoring";
import { CaptureLayer } from "./Capture";
import { DemoPanel } from "./DemoPanel";
import { Margin, type MarginItem } from "./Margin";
import { ReaderNote } from "./ReaderNote";
import { HtmlReader, MarksContext, PdfReader, type ReaderHandle } from "./readers";
import { type SelectionAction, SelectionMenu } from "./SelectionMenu";
import { StudyTab, type TutorMessage, TutorTab } from "./StudyPanel";

type Tab = "margin" | "figures" | "note" | "tutor" | "study";
type Tool = "cards" | "explain" | "connect";

/** The reading line sits this far down the book pane; the demo whose anchor it last passed is active. */
const LINE = 0.36;

interface Marker {
  id: string;
  top: number;
  status: Demo["status"];
  fig: string;
  title: string;
}
interface NoteMarker {
  id: string;
  top: number;
  type: Note["type"];
  title: string;
}
interface Selection {
  text: string;
  /** Centre of the selection, and the menu's top, in the book pane. */
  x: number;
  y: number;
  side: "top" | "bottom";
  anchor: Anchor;
  chapterId?: string;
  /** Reading position where the selection starts (page + fraction, or block). */
  at?: number;
  /** Made from the keyboard: the menu takes focus. */
  byKeyboard?: boolean;
}

function savedPos(bookId: string): number | null {
  const fromHash = new URLSearchParams(location.hash.split("?")[1] || "").get("at");
  if (fromHash && Number.isFinite(Number(fromHash))) return Number(fromHash);
  try {
    const saved = localStorage.getItem(`classroom-pos-${bookId}`);
    return saved ? Number(saved) : null;
  } catch {
    return null;
  }
}
const locOfPos = (book: Book, pos: number): Loc =>
  book.format === "pdf"
    ? { page: Math.floor(pos), y: pos - Math.floor(pos) }
    : { block: Math.floor(pos), y: pos - Math.floor(pos) };
const locOfAnchor = (a: Anchor): Loc =>
  a.page !== undefined ? { page: a.page, y: a.y ?? 0 } : { block: a.block ?? 0 };

export function Reader({
  bookId,
  theme,
  setTheme,
}: {
  bookId: string;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}) {
  const [book, setBook] = useState<Book | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { demos: rawDemos, annotations, jobs, book: liveBook } = useBookLive(bookId);
  const reader = useRef<ReaderHandle>(null);
  const pane = useRef<HTMLDivElement>(null);
  const split = useRef<HTMLElement>(null);
  const leader = useRef<SVGPathElement>(null);
  const bus = useMemo(() => new EventTarget(), []);
  // start at the saved position, so the chapter is right before the PDF has even rendered
  const [pos, setPos] = useState(() => savedPos(bookId) ?? 0);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  const [tab, setTab] = useState<Tab>(query.get("quiz") ? "study" : "margin");
  const [autoQuiz] = useState<"check" | null>(query.get("quiz") ? "check" : null);
  const [focused, setFocused] = useState<string | null>(query.get("focus"));
  const [hovered, setHovered] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteMarkers, setNoteMarkers] = useState<NoteMarker[]>([]);
  const [workingNote, setWorkingNote] = useState<Note | null>(null);
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [pinned, setPinned] = useState<{ text: string; source: SourceRef } | null>(null);
  const [tool, setTool] = useState<{ kind: Tool; text: string; source: SourceRef } | null>(null);
  const lastScroll = useRef(Date.now());
  const due = useDueCount();
  const [toast, setToastText] = useState<{ text: string; action?: { label: string; href: string } } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = useCallback((text: string, action?: { label: string; href: string }, ms = 3500) => {
    clearTimeout(toastTimer.current);
    setToastText({ text, action });
    toastTimer.current = setTimeout(() => setToastText(null), ms);
  }, []);
  const [help, setHelp] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const restored = useRef(false);
  const focusJumped = useRef(false);

  useEffect(() => {
    api.book(bookId).then(setBook, (e) => setFailed(e.message));
  }, [bookId]);
  useEffect(() => {
    if (liveBook) setBook(liveBook);
  }, [liveBook]);
  useEffect(() => {
    if (book && book.format !== "pdf") api.blocks(bookId).then(setBlocks, (e) => setFailed(e.message));
  }, [book, bookId]);
  const loadNotes = useCallback(() => learn.notes({ book: bookId }).then(setNotes, () => {}), [bookId]);
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);
  // the note this reading session writes into: remembered per book, else the book's own note (made on first use)
  useEffect(() => {
    try {
      const id = localStorage.getItem(`classroom-note-${bookId}`);
      if (id)
        learn.note(id).then(
          (n) => setWorkingNote(n),
          () => {},
        );
    } catch {}
  }, [bookId]);
  const chooseNote = useCallback(
    (n: Note | null) => {
      setWorkingNote(n);
      try {
        if (n) localStorage.setItem(`classroom-note-${bookId}`, n.id);
        else localStorage.removeItem(`classroom-note-${bookId}`);
      } catch {}
    },
    [bookId],
  );

  const demos = useMemo(() => (book ? withFigs(book, rawDemos) : []), [book, rawDemos]);
  const chapterOf = useCallback(
    (p: number) =>
      book ? [...book.toc].reverse().find((entry) => posOf(entry.start) <= p + 1e-6) || book.toc[0] || null : null,
    [book],
  );
  const chapter = chapterOf(pos);
  const chapterOfRef = useRef(chapterOf);
  chapterOfRef.current = chapterOf;
  const chapterDemos = useMemo(() => demos.filter((d) => d.chapterId === chapter?.id), [demos, chapter]);
  const marginItems = useMemo<MarginItem[]>(
    () => [
      ...annotations.map((a) => ({ id: a.id, annotation: a })),
      ...demos.filter((d) => d.anchor.matched !== false).map((d) => ({ id: d.id, demo: d })),
    ],
    [annotations, demos],
  );

  /** Recompute reading position and gutter markers from what is on screen. */
  const measure = useCallback(() => {
    const r = reader.current;
    const box = pane.current?.getBoundingClientRect();
    if (!r || !box) return;
    const lineY = box.top + box.height * LINE;
    const p = r.positionAt(lineY);
    if (p !== null) setPos(p);
    const next: Marker[] = [];
    for (const demo of demos) {
      const y = r.clientYOf(demo.anchor);
      if (y === null || y < box.top + 6 || y > box.bottom - 6) continue;
      next.push({
        id: demo.id,
        top: y - box.top,
        status: demo.status,
        fig: demo.fig,
        title: demo.brief.eyebrow || demo.brief.title,
      });
    }
    setMarkers((old) =>
      old.length === next.length &&
      old.every((m, i) => m.id === next[i].id && Math.abs(m.top - next[i].top) < 0.5 && m.status === next[i].status)
        ? old
        : next,
    );
    const nextNotes: NoteMarker[] = [];
    for (const note of notes) {
      const src = note.source;
      if (!src) continue;
      const loc: Loc | null =
        src.page !== undefined ? { page: src.page, y: src.y } : src.block !== undefined ? { block: src.block } : null;
      if (!loc) continue;
      const y = r.clientYOf(loc);
      if (y === null || y < box.top + 6 || y > box.bottom - 6) continue;
      nextNotes.push({ id: note.id, top: y - box.top, type: note.type, title: note.title });
    }
    setNoteMarkers((old) =>
      old.length === nextNotes.length &&
      old.every((m, i) => m.id === nextNotes[i].id && Math.abs(m.top - nextNotes[i].top) < 0.5)
        ? old
        : nextNotes,
    );
    lastScroll.current = Date.now();
    bus.dispatchEvent(new Event("scroll"));
  }, [demos, notes, bus]);

  useEffect(() => {
    measure();
  }, [measure]);
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as unknown as { __classroom: unknown }).__classroom = {
        reader: reader.current,
        demos,
        annotations,
        pos,
        pane: pane.current,
      };
  });

  // the active demo: the last anchor the reading line has passed, within the current chapter
  const autoActive = useMemo(() => {
    let found: Demo | null = null;
    for (const demo of demos) {
      if (posOf(demo.anchor) <= pos + 0.02) found = demo;
    }
    if (found && chapter && found.chapterId !== chapter.id) {
      const first = chapterDemos[0];
      return first && posOf(first.anchor) - pos < 0.35 ? first : null;
    }
    if (!found && chapterDemos[0] && posOf(chapterDemos[0].anchor) - pos < 0.35) return chapterDemos[0];
    return found;
  }, [demos, pos, chapter, chapterDemos]);
  const active =
    (heldId && demos.find((d) => d.id === heldId)) || (pickedId && demos.find((d) => d.id === pickedId)) || autoActive;
  // biome-ignore lint/correctness/useExhaustiveDependencies: when the reading line reaches another figure, the one picked by hand gives way
  useEffect(() => {
    setPickedId(null);
  }, [autoActive?.id]);

  const onReady = useCallback(() => {
    if (restored.current || !book) return;
    restored.current = true;
    // the book's scrolling text is a Tab stop (the arrow keys scroll it) and the skip link's target
    const scroller = reader.current?.scroller();
    if (scroller) {
      scroller.id = "book-text";
      scroller.tabIndex = 0;
      scroller.setAttribute("role", "region");
      scroller.setAttribute("aria-label", `${book.title}: the book`);
    }
    const saved = savedPos(book.id);
    const box = pane.current?.getBoundingClientRect();
    if (saved && box) setTimeout(() => reader.current?.jumpTo(locOfPos(book, saved), box.top + box.height * LINE), 120);
    setTimeout(measure, 300);
  }, [book, measure]);

  // remember where the reader is
  useEffect(() => {
    if (!book || !restored.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`classroom-pos-${book.id}`, pos.toFixed(3));
      } catch {}
      history.replaceState(null, "", `#/book/${book.id}?at=${pos.toFixed(3)}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [book, pos]);

  // reading time: a ping a minute while the reader is actually reading (visible, scrolled lately)
  const readState = useRef({ chapter, pos });
  readState.current = { chapter, pos };
  useEffect(() => {
    if (!book) return;
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastScroll.current > 3 * 60000) return;
      const { chapter: ch, pos: p } = readState.current;
      learn
        .readPing({
          bookId: book.id,
          chapter: ch?.title,
          chapterId: ch?.id,
          position: p,
          page: book.format === "pdf" ? Math.floor(p) : undefined,
        })
        .catch(() => {});
    };
    const first = setTimeout(ping, 15000);
    const timer = setInterval(ping, 60000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [book]);

  /** The book location of a selection, as a vault source reference. */
  const sourceOf = useCallback(
    (sel: Selection): SourceRef => {
      const at = sel.at ?? pos;
      const base = {
        bookId,
        chapterId: sel.chapterId || chapter?.id,
        quote: sel.text.split(/\s+/).slice(0, 24).join(" "),
      };
      return book?.format === "pdf"
        ? {
            ...base,
            page: sel.anchor.page ?? Math.floor(at),
            y: Math.round((sel.anchor.y ?? at - Math.floor(at)) * 1000) / 1000,
          }
        : { ...base, block: sel.anchor.block ?? Math.floor(at) };
    },
    [book, bookId, chapter, pos],
  );

  const jumpTo = useCallback((loc: Loc, smooth = true) => {
    const box = pane.current?.getBoundingClientRect();
    if (!box) return;
    reader.current?.jumpTo(loc, box.top + box.height * LINE - 4, smooth);
  }, []);
  const jumpToDemo = useCallback(
    (demo: Demo) => {
      setPickedId(demo.id);
      if (heldId) setHeldId(demo.id);
      jumpTo(demo.anchor);
    },
    [heldId, jumpTo],
  );

  // a link to an annotation (from a note, the palette): go to its passage and open its card
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-checked as the position changes, because `restored` is a ref set once the book is back where you left off
  useEffect(() => {
    if (focusJumped.current || !focused || !annotations.length || !restored.current) return;
    const a = annotations.find((x) => x.id === focused);
    if (!a) return;
    focusJumped.current = true;
    setTab("margin");
    setTimeout(() => jumpTo(locOfAnchor(a.anchor), false), 200);
  }, [annotations, focused, jumpTo, pos]);

  const index = active ? demos.findIndex((d) => d.id === active.id) : -1;
  const nextAfterPos = demos.find((d) => posOf(d.anchor) > pos + 0.02);
  const step = useCallback(
    (direction: -1 | 1) => {
      const target =
        index >= 0
          ? demos[index + direction]
          : direction === 1
            ? nextAfterPos
            : [...demos].reverse().find((d) => posOf(d.anchor) < pos);
      if (target) jumpToDemo(target);
    },
    [demos, index, jumpToDemo, nextAfterPos, pos],
  );

  // selecting a passage opens the menu; clicking a highlight opens its card
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  /** Opens the menu for what is selected in the book: true if it opened, false if nothing is selected, null if the selection can't be anchored. */
  const menuForSelection = useCallback(
    (byKeyboard: boolean): boolean | null => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
      const root = pane.current;
      if (!sel || sel.rangeCount === 0 || text.length < 2 || !root?.contains(sel.anchorNode)) return false;
      const anchor = book?.format === "pdf" ? pdfAnchor(sel, root) : blockAnchor(sel);
      if (!anchor) {
        setSelection(null);
        return null;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const box = root.getBoundingClientRect();
      // above the selection when there's room (as in most readers), else below; always inside the pane
      const above = rect.top - box.top > 70;
      const y = above ? rect.top - box.top - 48 : Math.min(box.height - 60, rect.bottom - box.top + 10);
      const at = reader.current?.positionAt(Math.max(box.top + 1, rect.top + 2));
      setSelection({
        text,
        anchor,
        x: rect.left - box.left + rect.width / 2,
        y: Math.max(8, y),
        side: above ? "top" : "bottom",
        chapterId: at != null ? chapterOfRef.current(at)?.id : undefined,
        at: at ?? undefined,
        byKeyboard,
      });
      return true;
    },
    [book],
  );
  /** S: selects the passage at the reading line and opens the menu, for annotating without a mouse. */
  const selectAtLine = useCallback(() => {
    const box = pane.current?.getBoundingClientRect();
    if (!box || !reader.current?.selectAt(box.top + box.height * LINE)) return;
    setTimeout(() => menuForSelection(true), 0);
  }, [menuForSelection]);

  // keyboard: [ and ] step through figures, h holds, s selects the passage at the reading line, c captures, ? help, Esc closes
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (selection && "hevadn".includes(event.key.toLowerCase())) return; // the selection menu's keys
      if (event.key === "]") step(1);
      else if (event.key === "[") step(-1);
      else if (event.key === "h" && active) setHeldId((id) => (id ? null : active.id));
      else if (event.key === "?") setHelp((v) => !v);
      else if (event.key === "c" && book?.format === "pdf") setCapturing((v) => !v);
      else if (event.key === "s") {
        event.preventDefault();
        selectAtLine();
      } else if (event.key === "Escape") {
        setHelp(false);
        setSelection(null);
        setFocused(null);
        setCapturing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, active, selection, book, selectAtLine]);
  useEffect(() => {
    // a selection made with the keyboard (Shift and the arrows, with caret browsing on) opens the menu when Shift is let go
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift" && pane.current?.contains(document.activeElement)) menuForSelection(false);
    };
    const onUp = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.(".sel-menu, .modal-back, .margin, .pane-tabs")) return;
      setTimeout(() => {
        const root = pane.current;
        const opened = menuForSelection(false);
        if (opened === false) {
          setSelection(null);
          // a click (no selection) on a marked passage: open its card
          if (root?.contains(event.target as Node) && reader.current) {
            const hit = annotationsRef.current.find((a) =>
              reader
                .current!.boxesOf(a.anchor, a.id)
                ?.some(
                  (r) =>
                    event.clientX >= r.left - 2 &&
                    event.clientX <= r.right + 2 &&
                    event.clientY >= r.top - 2 &&
                    event.clientY <= r.bottom + 2,
                ),
            );
            if (hit) {
              setTab("margin");
              setFocused(hit.id);
            }
          }
        }
      }, 10);
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keyup", onKeyUp);
    };
  }, [menuForSelection]);

  const ensureNote = useCallback(async () => {
    if (workingNote) return workingNote;
    const n = await learn.bookNote(bookId);
    chooseNote(n);
    return n;
  }, [workingNote, bookId, chooseNote]);

  const toNote = useCallback(
    async (input: { annotationId?: string; anchor?: Anchor }, mode: "embed" | "passage" | "reference") => {
      try {
        const note = await ensureNote();
        const out = await learn.toNote(bookId, { ...input, noteId: note.id, mode });
        chooseNote(out.note);
        say(`Added to “${out.note.title}”.`, { label: "Open", href: `#/notes/${out.note.id}` });
      } catch (error) {
        say((error as Error).message);
      }
    },
    [bookId, ensureNote, chooseNote, say],
  );

  const onAction = useCallback(
    async (action: SelectionAction) => {
      const sel = selection;
      if (!sel || !book) return;
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      // a menu used from the keyboard gives focus back to the book (a dialog the action opens returns it there too)
      if (sel.byKeyboard) document.getElementById("book-text")?.focus({ preventScroll: true });
      const annotate = async (input: Parameters<typeof learn.annotate>[1], focus = true) => {
        try {
          const a = await learn.annotate(book.id, input);
          if (focus) {
            setTab("margin");
            setFocused(a.id);
          }
          return a;
        } catch (error) {
          say((error as Error).message);
          return null;
        }
      };
      switch (action.kind) {
        case "highlight":
          await annotate({ kind: "highlight", anchor: sel.anchor, color: action.color }, false);
          break;
        case "explain":
        case "define":
        case "resources":
          await annotate({ kind: action.kind, anchor: sel.anchor });
          break;
        case "ask":
          await annotate({ kind: "ask", anchor: sel.anchor, request: action.question });
          break;
        case "visualize":
          await annotate({
            kind: "visualize",
            anchor: sel.anchor,
            request: action.request || undefined,
            sceneKind: action.sceneKind,
            quality: action.quality,
          });
          say(action.quality === "careful" ? "Drawing carefully: about a minute." : "Drawing: about fifteen seconds.");
          break;
        case "note":
          await toNote({ anchor: sel.anchor }, action.mode);
          break;
        case "cards":
          setTool({ kind: "cards", text: sel.text, source: sourceOf(sel) });
          break;
        case "teach":
          setTool({ kind: "explain", text: sel.text, source: sourceOf(sel) });
          break;
        case "connect":
          setTool({ kind: "connect", text: sel.text, source: sourceOf(sel) });
          break;
        case "tutor":
          setPinned({ text: sel.text, source: sourceOf(sel) });
          setTutorMessages([]);
          setTab("tutor");
          break;
        case "copy":
          void navigator.clipboard?.writeText(sel.text).then(() => say("Copied."));
          break;
      }
    },
    [selection, book, toNote, sourceOf, say],
  );

  const marks = useMemo(() => ({ annotations, focused, hovered }), [annotations, focused, hovered]);
  const tabs = useIndicator<HTMLDivElement>(tab);
  useArrowKeys(tabs, { selector: '[role="tab"]', select: true });
  const helpBox = useRef<HTMLDivElement>(null);
  useFocusTrap(helpBox, help, { onEscape: () => setHelp(false) });

  if (failed) return <div className="center-note">Could not open this book: {failed}</div>;
  if (!book) return <div className="center-note">Opening…</div>;

  const pageLabel =
    book.format === "pdf"
      ? `p. ${Math.max(1, Math.floor(pos))} / ${book.pageCount}`
      : `${Math.round((Math.floor(pos) / Math.max(1, book.blockCount || 1)) * 100)}%`;
  const sections = chapter?.sections || [];
  const section = [...sections].reverse().find((s) => posOf(s.start) <= pos + 1e-6);
  const counted = annotations.filter((a) => a.kind !== "highlight").length;

  return (
    <div className="reader-app">
      <SkipLink target="book-text" label="Skip to the book" />
      <header className="topbar">
        <a className="icon-button" href="#/library" title="Library" aria-label="Back to the library">
          <ArrowLeft aria-hidden="true" />
        </a>
        <h1 className="book-name" title={book.title}>
          {book.title}
        </h1>
        <select
          className="toc-select"
          value={chapter?.id || ""}
          onChange={(e) => {
            const entry = book.toc.find((t) => t.id === e.target.value);
            if (entry) jumpTo(entry.start, false);
          }}
          aria-label="Chapter"
        >
          {book.toc.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
              {entry.subtitle ? ` — ${entry.subtitle}` : ""}
            </option>
          ))}
        </select>
        {sections.length > 0 && (
          <select
            className="toc-select narrow"
            value={section?.id || ""}
            onChange={(e) => {
              const s = sections.find((x) => x.id === e.target.value);
              if (s) jumpTo(s.start, false);
            }}
            aria-label="Section"
          >
            <option value="" disabled>
              Section
            </option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
        {(book.tocSource === "chunks" || book.tocSource === "headings") && book.format === "pdf" && (
          <button
            type="button"
            className="button"
            disabled={jobs.some((j) => j.kind === "plan" && j.status === "running" && !j.chapterId)}
            title="This PDF has no bookmarks: let the model read the headings and build the chapter list"
            onClick={() => api.detectChapters(book.id).catch((e) => say((e as Error).message))}
          >
            {jobs.some((j) => j.kind === "plan" && j.status === "running" && !j.chapterId)
              ? "Finding chapters…"
              : "Find chapters"}
          </button>
        )}
        <span className="spacer" />
        {book.format === "pdf" && (
          <button
            type="button"
            className={`button subtle ${capturing ? "on" : ""}`}
            onClick={() => {
              setCapturing((v) => !v);
              setSelection(null);
            }}
            aria-pressed={capturing}
            title="Capture a figure, formula or table from the page into your note (C)"
          >
            <Crop aria-hidden="true" />
            Capture
          </button>
        )}
        <span className="page-label">{pageLabel}</span>
        <a className="button subtle" href="#/review" title="Review your cards">
          <Layers aria-hidden="true" />
          Review{due ? <span className="badge">{due}</span> : null}
        </a>
        {tab === "figures" && (
          <button
            type="button"
            className={`button subtle ${heldId ? "on" : ""}`}
            onClick={() => setHeldId(heldId ? null : active?.id || null)}
            disabled={!active && !heldId}
            aria-pressed={!!heldId}
            title="Keep this figure while you scroll (h)"
          >
            {heldId ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
            {heldId ? "Release" : "Hold"}
          </button>
        )}
        <span className="topbar-sep" />
        <ThemeButton theme={theme} setTheme={setTheme} />
        <button
          type="button"
          className="icon-button"
          onClick={() => setHelp(!help)}
          aria-label="Help"
          aria-expanded={help}
          title="Help (?)"
        >
          <CircleHelp aria-hidden="true" />
        </button>
      </header>

      <main className="split" ref={split}>
        <section className="demo-pane" aria-label="Study panel">
          <div className="pane-head">
            <div className="pane-tabs segmented" role="tablist" aria-label="Study panel" ref={tabs}>
              {(["margin", "figures", "note", "tutor", "study"] as Tab[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  id={`pane-tab-${t}`}
                  className="pane-tab"
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls="pane-panel"
                  onClick={() => setTab(t)}
                >
                  {t === "margin"
                    ? "Margin"
                    : t === "figures"
                      ? "Figures"
                      : t === "note"
                        ? "Note"
                        : t === "tutor"
                          ? "Tutor"
                          : "Study"}
                  {t === "margin" && counted > 0 && (
                    <span className="tab-count">
                      {counted}
                      <span className="visually-hidden"> annotations</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="pane-body" role="tabpanel" id="pane-panel" aria-labelledby={`pane-tab-${tab}`}>
            {tab === "margin" && (
              <Margin
                book={book}
                items={marginItems}
                reader={reader}
                bus={bus}
                focused={focused}
                setFocused={setFocused}
                hovered={hovered}
                setHovered={setHovered}
                leader={leader}
                theme={theme}
                onToNote={(a: Annotation, mode) => toNote({ annotationId: a.id }, mode)}
                onOpenDemo={(d) => {
                  setTab("figures");
                  jumpToDemo(d);
                }}
                toast={say}
              />
            )}
            {tab === "figures" && (
              <DemoPanel
                book={book}
                demo={active || null}
                chapter={chapter}
                chapterDemos={chapterDemos}
                allDemos={demos}
                jobs={jobs}
                theme={theme}
                held={!!heldId}
                onJump={jumpToDemo}
                onStep={step}
                canStep={{
                  prev: index > 0 || (index < 0 && demos.some((d) => posOf(d.anchor) < pos)),
                  next: index >= 0 ? index < demos.length - 1 : !!nextAfterPos,
                }}
              />
            )}
            {tab === "note" && (
              <ReaderNote
                book={book}
                note={workingNote}
                onChoose={chooseNote}
                ensureNote={ensureNote}
                bookNotes={notes}
                theme={theme}
                onJump={(loc) => jumpTo(loc)}
                reload={loadNotes}
              />
            )}
            {tab === "tutor" && (
              <TutorTab
                book={book}
                chapter={chapter}
                pinned={pinned}
                onUnpin={() => setPinned(null)}
                theme={theme}
                messages={tutorMessages}
                setMessages={setTutorMessages}
              />
            )}
            {tab === "study" && <StudyTab book={book} chapter={chapter} theme={theme} autoQuiz={autoQuiz} />}
          </div>
        </section>
        <section className="book-pane" ref={pane} aria-label="Book">
          <div className="gutter">
            <span className="reading-line" style={{ top: `${LINE * 100}%` }} title="Reading line" />
            {noteMarkers.map((m) => (
              <button
                type="button"
                key={m.id}
                className="note-mark"
                data-type={m.type}
                style={{ top: m.top }}
                title={`${m.type}: ${m.title}`}
                aria-label={`${m.type}: ${m.title}`}
                onClick={() => setTab("note")}
              />
            ))}
            {markers.map((m) => (
              <button
                type="button"
                key={m.id}
                className="anchor"
                data-active={active?.id === m.id || undefined}
                data-status={m.status}
                style={{ top: m.top }}
                title={`${m.fig} · ${m.title}`}
                aria-label={`${m.fig}: ${m.title}`}
                onClick={() => {
                  const demo = demos.find((d) => d.id === m.id);
                  if (demo) {
                    setFocused(demo.id);
                    jumpToDemo(demo);
                  }
                }}
              />
            ))}
          </div>
          <div className="book-view">
            <MarksContext.Provider value={marks}>
              {book.format === "pdf" ? (
                <PdfReader
                  ref={reader}
                  url={api.fileUrl(book.id)}
                  dark={theme === "dark"}
                  onScroll={measure}
                  onReady={onReady}
                />
              ) : blocks ? (
                <HtmlReader ref={reader} blocks={blocks} onScroll={measure} onReady={onReady} />
              ) : (
                <div className="reader-loading">Opening the book…</div>
              )}
            </MarksContext.Provider>
          </div>
          {selection && !capturing && (
            <SelectionMenu
              x={selection.x}
              y={selection.y}
              side={selection.side}
              onAction={onAction}
              noteTitle={workingNote?.title}
              takeFocus={selection.byKeyboard}
              onClose={() => {
                setSelection(null);
                document.getElementById("book-text")?.focus({ preventScroll: true });
              }}
            />
          )}
          {capturing && (
            <CaptureLayer
              book={book}
              root={pane.current}
              theme={theme}
              note={workingNote}
              ensureNote={ensureNote}
              onNote={chooseNote}
              onDone={() => setCapturing(false)}
              say={say}
            />
          )}
        </section>
        <svg className="leader" aria-hidden="true">
          <path ref={leader} />
        </svg>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast.text}
          {toast.action && (
            <a className="toast-action" href={toast.action.href}>
              {toast.action.label}
            </a>
          )}
        </div>
      )}
      {tool?.kind === "cards" && (
        <CardDrafter passage={tool.text} source={tool.source} deck={book.title} onClose={() => setTool(null)} />
      )}
      {tool?.kind === "explain" && (
        <ExplainBack passage={tool.text} source={tool.source} theme={theme} onClose={() => setTool(null)} />
      )}
      {tool?.kind === "connect" && (
        <Connector
          passage={tool.text}
          source={tool.source}
          theme={theme}
          onClose={() => {
            setTool(null);
            loadNotes();
          }}
        />
      )}
      {help && (
        <div className="help-pop" role="dialog" aria-label="Help" ref={helpBox}>
          <button
            type="button"
            className="icon-button help-close"
            onClick={() => setHelp(false)}
            aria-label="Close help"
          >
            <X aria-hidden="true" />
          </button>
          <h3>How this works</h3>
          <p>
            Read on the right. Select any passage for the menu: an explanation, a definition, an answer or a figure
            appears in the margin on the left, beside the passage, and is saved with the book in your vault.
          </p>
          <ul>
            <li>
              Select, then <kbd>H</kbd> highlight · <kbd>E</kbd> explain · <kbd>V</kbd> visualize · <kbd>A</kbd> ask ·{" "}
              <kbd>D</kbd> define · <kbd>N</kbd> add the passage to your note
            </li>
            <li>
              Without a mouse: <kbd>Tab</kbd> to the book (or use “Skip to the book”), scroll with the arrow keys, and
              press <kbd>S</kbd> to select the passage at the reading line; the menu opens with focus in it
            </li>
            <li>Click a marked passage to open its card; ask follow-ups in the card</li>
            <li>
              <kbd>C</kbd> capture a figure, formula or table from the page into your note (with a transcription if you
              like)
            </li>
            <li>
              <em>Note</em>: your notes while reading (passages land there). <em>Figures</em>: the chapter’s figures,
              large. <em>Study</em>: pretest, quiz, concepts
            </li>
            <li>
              <kbd>[</kbd> <kbd>]</kbd> previous / next figure · <kbd>⌘K</kbd> searches everything you’ve read and
              written
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
