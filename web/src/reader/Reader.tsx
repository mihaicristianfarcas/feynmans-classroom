/* The reader (#/book/<id>): the book on the right and, on the left, its panes (the margin, figures,
 * your note, the tutor, the study tools) in a panel you resize from its edge or hide from the top bar
 * (it opens again by itself when something lands in it). It keeps your place, follows the reading line,
 * and has keyboard shortcuts for everything (press ? to see them). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Anchor,
  type Annotation,
  api,
  type Block,
  type Book,
  docs,
  type FindHit,
  type Loc,
  learn,
  type Note,
  posOf,
  type SourceRef,
  type TutorSession,
  useBookLive,
  withFigs,
} from "../api";
import { SkipLink } from "../app/Shell";
import { PanelEdge } from "../components/Panel";
import { Toast, useToast } from "../components/Toast";
import { CardDrafter, Connector, ExplainBack } from "../components/tools";
import { useIndicator } from "../components/ui";
import { useArrowKeys } from "../lib/a11y";
import { usePanel } from "../lib/usePanel";
import { under, useVaultEvents } from "../lib/useVaultEvents";
import { CaptureLayer } from "./Capture";
import { FigureLightbox } from "./FigureLightbox";
import { FiguresIndex } from "./FiguresIndex";
import { FindBar } from "./FindBar";
import { type FigureEntry, figureEntries } from "./figures";
import { type DemoMarker, demoMarkers, Gutter, type NoteMarker, noteMarkers, sameMarkers } from "./Gutter";
import { Margin, type MarginItem } from "./Margin";
import { chapterAt, LINE, locOfAnchor, locOfPos, savedPos, sourceRef } from "./position";
import { ReaderHelp } from "./ReaderHelp";
import { ReaderNote } from "./ReaderNote";
import { ReaderTopbar } from "./ReaderTopbar";
import { HtmlReader, MarksContext, PdfReader, type ReaderHandle, type Zoom } from "./readers";
import { type SelectionAction, SelectionMenu } from "./SelectionMenu";
import { StudyTab } from "./StudyPanel";
import { readSelection, type Selection } from "./selection";
import { savedZoom, saveZoom, stepZoom, useReadingTime, useSavedPosition, useWorkingNote } from "./session";
import { NEW_CONVERSATION, pinnedOf, type TutorConversation, TutorTab } from "./Tutor";

type Tab = "margin" | "figures" | "note" | "tutor" | "study";
type Tool = "cards" | "explain" | "connect";

const TABS: { id: Tab; label: string }[] = [
  { id: "margin", label: "Margin" },
  { id: "figures", label: "Figures" },
  { id: "note", label: "Note" },
  { id: "tutor", label: "Tutor" },
  { id: "study", label: "Study" },
];

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
  const bus = useMemo(() => new EventTarget(), []);
  // start at the saved position, so the chapter is right before the PDF has even rendered
  const [pos, setPos] = useState(() => savedPos(bookId) ?? 0);
  const [markers, setMarkers] = useState<DemoMarker[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>(() => savedZoom(bookId));
  const [scale, setScale] = useState(1);
  const [finding, setFinding] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [found, setFound] = useState<{ anchor: Anchor; key: string } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  const [tab, setTab] = useState<Tab>(query.get("quiz") ? "study" : "margin");
  const study = usePanel("reader-panel", { initial: 560, min: 360, max: 960 });
  const { expand } = study;
  /** Shows a pane, opening the panel if it was hidden. */
  const show = useCallback(
    (t: Tab) => {
      setTab(t);
      expand();
    },
    [expand],
  );
  const [autoQuiz] = useState<"check" | null>(query.get("quiz") ? "check" : null);
  const [focused, setFocused] = useState<string | null>(query.get("focus"));
  const [hovered, setHovered] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteMarks, setNoteMarks] = useState<NoteMarker[]>([]);
  const [conversation, setConversation] = useState<TutorConversation>(NEW_CONVERSATION);
  const [pinned, setPinned] = useState<{ text: string; source: SourceRef } | null>(null);
  const [tool, setTool] = useState<{ kind: Tool; text: string; source: SourceRef } | null>(null);
  const lastScroll = useRef(Date.now());
  const { toast, say } = useToast();
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
  // the window's title names the book (as every other page names itself)
  useEffect(() => {
    if (book?.title) document.title = `${book.title} · Feynman’s Classroom`;
  }, [book?.title]);
  useEffect(() => {
    if (book && book.format !== "pdf") api.blocks(bookId).then(setBlocks, (e) => setFailed(e.message));
  }, [book, bookId]);
  const loadNotes = useCallback(() => docs.list("note", { book: bookId }).then(setNotes, () => {}), [bookId]);
  // notes about this book made elsewhere (the agent, another editor) show up as they land
  useVaultEvents(loadNotes, under("notes/"));
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);
  const { note: workingNote, choose: chooseNote, ensure: ensureNote } = useWorkingNote(bookId);
  // a link to a session with the tutor (from ⌘K, a note): the Tutor pane, with that conversation
  // biome-ignore lint/correctness/useExhaustiveDependencies: opens the session in the link once, when the reader opens
  useEffect(() => {
    const id = query.get("session");
    if (!id) return;
    docs.get<TutorSession>(id).then(
      (s) => {
        setConversation({ messages: s.messages, sessionId: s.id, mode: s.mode });
        setPinned(pinnedOf(s));
        show("tutor");
      },
      () => {},
    );
  }, [bookId]);

  const demos = useMemo(() => (book ? withFigs(book, rawDemos) : []), [book, rawDemos]);
  const chapterOf = useCallback((p: number) => (book ? chapterAt(book, p) : null), [book]);
  const chapter = chapterOf(pos);
  const chapterOfRef = useRef(chapterOf);
  chapterOfRef.current = chapterOf;
  const section = [...(chapter?.sections || [])].reverse().find((s) => posOf(s.start) <= pos + 1e-6) || null;
  const figures = useMemo(() => (book ? figureEntries(book, demos, annotations) : []), [book, demos, annotations]);
  const figs = useMemo(() => new Map(figures.map((f) => [f.id, f.fig])), [figures]);
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
    const p = r.positionAt(box.top + box.height * LINE);
    if (p !== null) setPos(p);
    const nextDemos = demoMarkers(r, box, demos);
    setMarkers((old) => sameMarkers(old, nextDemos));
    const nextNotes = noteMarkers(r, box, notes);
    setNoteMarks((old) => sameMarkers(old, nextNotes));
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

  useSavedPosition(book, pos, restored);
  useReadingTime(book, chapter, pos, lastScroll);

  const jumpTo = useCallback((loc: Loc, smooth = true) => {
    const box = pane.current?.getBoundingClientRect();
    if (!box) return;
    reader.current?.jumpTo(loc, box.top + box.height * LINE - 4, smooth);
  }, []);
  /** Draws the book bigger or smaller, keeping the reading line on the same words. */
  const zoomTo = useCallback(
    (next: Zoom) => {
      const box = pane.current?.getBoundingClientRect();
      const at = box ? reader.current?.positionAt(box.top + box.height * LINE) : null;
      setZoom(next);
      saveZoom(bookId, next);
      if (book && at !== null && at !== undefined) setTimeout(() => jumpTo(locOfPos(book, at), false), 180);
    },
    [book, bookId, jumpTo],
  );
  const shownScale = book?.format === "pdf" ? scale : zoom === "fit" ? 1 : zoom;
  /** The find bar goes to a place the phrase occurs, and marks it. */
  const goToFound = useCallback(
    (hit: FindHit | null, key: string) => {
      if (!hit) {
        setFound(null);
        return;
      }
      const anchor: Anchor =
        hit.page !== undefined
          ? { page: hit.page, y: hit.y, quote: hit.quote, prefix: hit.prefix, suffix: hit.suffix }
          : { block: hit.block, quote: hit.quote, prefix: hit.prefix, suffix: hit.suffix };
      setFound({ anchor, key });
      jumpTo(hit.page !== undefined ? { page: hit.page, y: hit.y ?? 0 } : { block: hit.block ?? 0 }, false);
    },
    [jumpTo],
  );

  /** Goes to a figure's passage and lines its card up beside it in the margin. */
  const goToFigure = useCallback(
    (entry: FigureEntry) => {
      show("margin");
      setFocused(entry.id);
      jumpTo(entry.loc);
    },
    [jumpTo, show],
  );

  // a link to an annotation (from a note, the palette): go to its passage and open its card
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-checked as the position changes, because `restored` is a ref set once the book is back where you left off
  useEffect(() => {
    if (focusJumped.current || !focused || !annotations.length || !restored.current) return;
    const a = annotations.find((x) => x.id === focused);
    if (!a) return;
    focusJumped.current = true;
    show("margin");
    setTimeout(() => jumpTo(locOfAnchor(a.source), false), 200);
  }, [annotations, focused, jumpTo, pos, show]);

  /** [ and ]: the figure before or after the reading line. */
  const step = useCallback(
    (direction: -1 | 1) => {
      const target =
        direction === 1
          ? figures.find((f) => f.at > pos + 0.02)
          : [...figures].reverse().find((f) => f.at < pos - 0.02);
      if (target) goToFigure(target);
    },
    [figures, goToFigure, pos],
  );

  // selecting a passage opens the menu; clicking a highlight opens its card
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  /** Opens the menu for what is selected in the book: true if it opened, false if nothing is selected, null if the selection can't be anchored. */
  const menuForSelection = useCallback(
    (byKeyboard: boolean): boolean | null => {
      if (!book || !pane.current) return false;
      const found = readSelection(book, pane.current, reader.current, (at) => chapterOfRef.current(at)?.id, byKeyboard);
      if (found === false) return false;
      setSelection(found);
      return found !== null;
    },
    [book],
  );
  /** S: selects the passage at the reading line and opens the menu, for annotating without a mouse. */
  const selectAtLine = useCallback(() => {
    const box = pane.current?.getBoundingClientRect();
    if (!box || !reader.current?.selectAt(box.top + box.height * LINE)) return;
    setTimeout(() => menuForSelection(true), 0);
  }, [menuForSelection]);

  // keyboard: ⌘F or / finds, [ and ] step through figures, + − 0 zoom, p shows the pages, s selects the
  // passage at the reading line, c captures, ? help, Esc closes
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
        // the browser's own find can't see the pages that aren't drawn yet
        event.preventDefault();
        setFinding(true);
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".find-bar input")?.select());
        return;
      }
      const target = event.target as HTMLElement;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (selection && "hevadn".includes(event.key.toLowerCase())) return; // the selection menu's keys
      if (event.key === "]") step(1);
      else if (event.key === "[") step(-1);
      else if (event.key === "?") setHelp((v) => !v);
      else if (event.key === "/") {
        event.preventDefault();
        setFinding(true);
      } else if ((event.key === "+" || event.key === "=") && !event.metaKey && !event.ctrlKey)
        zoomTo(stepZoom(shownScale, 1));
      else if (event.key === "-" && !event.metaKey && !event.ctrlKey) zoomTo(stepZoom(shownScale, -1));
      else if (event.key === "0" && !event.metaKey && !event.ctrlKey) zoomTo("fit");
      else if (event.key === "c" && book?.format === "pdf") setCapturing((v) => !v);
      else if (event.key === "p" && book?.format === "pdf") setPagesOpen((v) => !v);
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
  }, [step, selection, book, selectAtLine, zoomTo, shownScale]);
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
                .current!.boxesOf(a.source, a.id)
                ?.some(
                  (r) =>
                    event.clientX >= r.left - 2 &&
                    event.clientX <= r.right + 2 &&
                    event.clientY >= r.top - 2 &&
                    event.clientY <= r.bottom + 2,
                ),
            );
            if (hit) {
              show("margin");
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
  }, [menuForSelection, show]);

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
      const source = sourceRef(book, sel, pos, chapter?.id);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      // a menu used from the keyboard gives focus back to the book (a dialog the action opens returns it there too)
      if (sel.byKeyboard) document.getElementById("book-text")?.focus({ preventScroll: true });
      const annotate = async (input: Parameters<typeof learn.annotate>[1], focus = true) => {
        try {
          const a = await learn.annotate(book.id, input);
          if (focus) {
            show("margin");
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
          await annotate({ type: "highlight", anchor: sel.anchor, color: action.color }, false);
          break;
        case "explain":
        case "define":
        case "resources":
          await annotate({ type: action.kind, anchor: sel.anchor });
          break;
        case "ask":
          await annotate({ type: "ask", anchor: sel.anchor, request: action.question });
          break;
        case "visualize":
          await annotate({
            type: "visualize",
            anchor: sel.anchor,
            request: action.request || undefined,
            sceneKind: action.sceneKind,
            quality: action.quality,
          });
          say(
            action.sceneKind === "animation"
              ? "Writing the animation and checking it runs: about a minute."
              : action.quality === "careful"
                ? "Drawing carefully: about a minute."
                : "Drawing: about fifteen seconds.",
          );
          break;
        case "note":
          await toNote({ anchor: sel.anchor }, action.mode);
          break;
        case "cards":
          setTool({ kind: "cards", text: sel.text, source });
          break;
        case "teach":
          setTool({ kind: "explain", text: sel.text, source });
          break;
        case "connect":
          setTool({ kind: "connect", text: sel.text, source });
          break;
        case "tutor":
          setPinned({ text: sel.text, source });
          setConversation((c) => ({ ...NEW_CONVERSATION, mode: c.mode }));
          show("tutor");
          break;
        case "copy":
          void navigator.clipboard?.writeText(sel.text).then(() => say("Copied."));
          break;
      }
    },
    [selection, book, pos, chapter, toNote, say, show],
  );

  const marks = useMemo(() => ({ annotations, focused, hovered, found }), [annotations, focused, hovered, found]);
  const tabs = useIndicator<HTMLDivElement>(tab);
  useArrowKeys(tabs, { selector: '[role="tab"]', select: true });

  if (failed) return <div className="center-note">Could not open this book: {failed}</div>;
  if (!book) return <div className="center-note">Opening…</div>;

  const counted = annotations.filter((a) => a.type !== "highlight").length;
  const lightboxEntry = lightbox ? figures.find((f) => f.id === lightbox) : undefined;

  return (
    <div className="reader-app">
      <SkipLink target="book-text" label="Skip to the book" />
      <ReaderTopbar
        book={book}
        pos={pos}
        chapter={chapter}
        jobs={jobs}
        onJump={(loc) => jumpTo(loc, false)}
        capturing={capturing}
        onCapture={() => {
          setCapturing((v) => !v);
          setSelection(null);
        }}
        panel={study}
        zoom={{ scale: shownScale, fit: zoom === "fit", set: zoomTo }}
        onFind={() => setFinding(true)}
        pages={book.format === "pdf" ? { open: pagesOpen, toggle: () => setPagesOpen((v) => !v) } : null}
        help={help}
        onHelp={() => setHelp(!help)}
        theme={theme}
        setTheme={setTheme}
        say={say}
      />

      <main className="split" ref={split}>
        <section
          className="demo-pane"
          aria-label="Study panel"
          id={study.id}
          ref={study.ref}
          style={study.style}
          hidden={!study.open}
        >
          <div className="pane-head">
            <div className="pane-tabs segmented" role="tablist" aria-label="Study panel" ref={tabs}>
              {TABS.map(({ id: t, label }) => (
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
                  {label}
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
            {/* a hidden panel keeps its tabs but not its panes */}
            {!study.open ? null : tab === "margin" ? (
              <Margin
                book={book}
                items={marginItems}
                reader={reader}
                bus={bus}
                focused={focused}
                setFocused={setFocused}
                setHovered={setHovered}
                theme={theme}
                onToNote={(a: Annotation, mode) => toNote({ annotationId: a.id }, mode)}
                onOpenFigure={(id) => setLightbox(id)}
                figs={figs}
                toast={say}
              />
            ) : tab === "figures" ? (
              <FiguresIndex
                entries={figures}
                chapter={chapter}
                section={section}
                theme={theme}
                onGo={goToFigure}
                onOpen={(entry) => setLightbox(entry.id)}
              />
            ) : tab === "note" ? (
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
            ) : tab === "tutor" ? (
              <TutorTab
                book={book}
                chapter={chapter}
                pinned={pinned}
                setPinned={setPinned}
                theme={theme}
                conversation={conversation}
                setConversation={setConversation}
                say={say}
              />
            ) : (
              <StudyTab book={book} chapter={chapter} theme={theme} autoQuiz={autoQuiz} />
            )}
          </div>
        </section>
        <PanelEdge panel={study} side="left" label="study panel" />
        <section className="book-pane" ref={pane} aria-label="Book">
          <Gutter
            demos={markers}
            notes={noteMarks}
            activeId={focused || undefined}
            onNote={() => show("note")}
            onDemo={(id) => {
              const entry = figures.find((f) => f.id === id);
              if (entry) goToFigure(entry);
            }}
          />
          <div className="book-view">
            <MarksContext.Provider value={marks}>
              {book.format === "pdf" ? (
                <PdfReader
                  ref={reader}
                  url={api.fileUrl(book.id)}
                  dark={theme === "dark"}
                  pages={pagesOpen}
                  zoom={zoom}
                  onZoomed={setScale}
                  onScroll={measure}
                  onReady={onReady}
                />
              ) : blocks ? (
                <HtmlReader ref={reader} blocks={blocks} zoom={zoom} onScroll={measure} onReady={onReady} />
              ) : (
                <div className="reader-loading">Opening the book…</div>
              )}
            </MarksContext.Provider>
          </div>
          {finding && (
            <FindBar
              book={book}
              onGo={goToFound}
              onClose={() => {
                setFinding(false);
                setFound(null);
                document.getElementById("book-text")?.focus({ preventScroll: true });
              }}
            />
          )}
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
      </main>
      <Toast toast={toast} />
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
      {help && <ReaderHelp onClose={() => setHelp(false)} />}
      {lightboxEntry && (
        <FigureLightbox
          entry={lightboxEntry}
          book={book}
          theme={theme}
          onClose={() => setLightbox(null)}
          onGo={goToFigure}
          say={say}
        />
      )}
    </div>
  );
}
