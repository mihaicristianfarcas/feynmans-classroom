import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, learn, posOf, useBookLive, withFigs, type Block, type Book, type Demo, type Loc, type Note, type SourceRef } from "./api";
import { DemoPanel } from "./DemoPanel";
import { HtmlReader, PdfReader, type ReaderHandle } from "./readers";
import { useDueCount } from "./Shell";
import { NotesTab, StudyTab, TutorTab, type TutorMessage } from "./StudyPanel";
import { CardDrafter, Connector, ExplainBack, FigureRequest } from "./tools";

type Tab = "figures" | "tutor" | "notes" | "study";
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
  x: number;
  y: number;
  chapterId?: string;
  /** Reading position where the selection starts (page + fraction, or block). */
  at?: number;
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
const locOfPos = (book: Book, pos: number): Loc => (book.format === "pdf" ? { page: Math.floor(pos), y: pos - Math.floor(pos) } : { block: Math.floor(pos), y: pos - Math.floor(pos) });

export function Reader({ bookId, theme, setTheme }: { bookId: string; theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void }) {
  const [book, setBook] = useState<Book | null>(null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { demos: rawDemos, jobs, book: liveBook } = useBookLive(bookId);
  const reader = useRef<ReaderHandle>(null);
  const pane = useRef<HTMLDivElement>(null);
  // start at the saved position, so the chapter is right before the PDF has even rendered
  const [pos, setPos] = useState(() => savedPos(bookId) ?? 0);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [composing, setComposing] = useState(false);
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  const [tab, setTab] = useState<Tab>(query.get("quiz") ? "study" : "figures");
  const [autoQuiz] = useState<"check" | null>(query.get("quiz") ? "check" : null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteMarkers, setNoteMarkers] = useState<NoteMarker[]>([]);
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([]);
  const [pinned, setPinned] = useState<{ text: string; source: SourceRef } | null>(null);
  const [tool, setTool] = useState<{ kind: Tool; text: string; source: SourceRef } | null>(null);
  const lastScroll = useRef(Date.now());
  const due = useDueCount();
  const [toast, setToast] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const restored = useRef(false);

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

  const demos = useMemo(() => (book ? withFigs(book, rawDemos) : []), [book, rawDemos]);
  const chapterOf = useCallback((p: number) => (book ? [...book.toc].reverse().find((entry) => posOf(entry.start) <= p + 1e-6) || book.toc[0] || null : null), [book]);
  const chapter = chapterOf(pos);
  const chapterOfRef = useRef(chapterOf);
  chapterOfRef.current = chapterOf;
  const chapterDemos = useMemo(() => demos.filter((d) => d.chapterId === chapter?.id), [demos, chapter]);

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
      next.push({ id: demo.id, top: y - box.top, status: demo.status, fig: demo.fig, title: demo.brief.eyebrow || demo.brief.title });
    }
    setMarkers((old) => (old.length === next.length && old.every((m, i) => m.id === next[i].id && Math.abs(m.top - next[i].top) < 0.5 && m.status === next[i].status) ? old : next));
    const nextNotes: NoteMarker[] = [];
    for (const note of notes) {
      const src = note.source;
      if (!src) continue;
      const loc: Loc | null = src.page !== undefined ? { page: src.page, y: src.y } : src.block !== undefined ? { block: src.block } : null;
      if (!loc) continue;
      const y = r.clientYOf(loc);
      if (y === null || y < box.top + 6 || y > box.bottom - 6) continue;
      nextNotes.push({ id: note.id, top: y - box.top, type: note.type, title: note.title });
    }
    setNoteMarkers((old) => (old.length === nextNotes.length && old.every((m, i) => m.id === nextNotes[i].id && Math.abs(m.top - nextNotes[i].top) < 0.5) ? old : nextNotes));
    lastScroll.current = Date.now();
  }, [demos, notes]);

  useEffect(() => {
    measure();
  }, [measure]);
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __classroom: unknown }).__classroom = { reader: reader.current, demos, pos, pane: pane.current };
  });

  // the active demo: the last anchor the reading line has passed, within the current chapter
  const autoActive = useMemo(() => {
    let found: Demo | null = null;
    for (const demo of demos) {
      if (posOf(demo.anchor) <= pos + 0.02) found = demo;
    }
    if (found && chapter && found.chapterId !== chapter.id) {
      // the line has left that demo's chapter: show the next chapter's first demo once it is near
      const first = chapterDemos[0];
      return first && posOf(first.anchor) - pos < 0.35 ? first : null;
    }
    if (!found && chapterDemos[0] && posOf(chapterDemos[0].anchor) - pos < 0.35) return chapterDemos[0];
    return found;
  }, [demos, pos, chapter, chapterDemos]);
  const active = (heldId && demos.find((d) => d.id === heldId)) || (pickedId && demos.find((d) => d.id === pickedId)) || autoActive;
  useEffect(() => {
    setPickedId(null);
  }, [autoActive?.id]);

  const onReady = useCallback(() => {
    if (restored.current || !book) return;
    restored.current = true;
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
      learn.readPing({ bookId: book.id, chapter: ch?.title, chapterId: ch?.id, position: p, page: book.format === "pdf" ? Math.floor(p) : undefined }).catch(() => {});
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
      const base = { bookId, chapterId: sel.chapterId || chapter?.id, quote: sel.text.split(/\s+/).slice(0, 24).join(" ") };
      return book?.format === "pdf" ? { ...base, page: Math.floor(at), y: Math.round((at - Math.floor(at)) * 1000) / 1000 } : { ...base, block: Math.floor(at) };
    },
    [book, bookId, chapter, pos],
  );

  const jumpTo = useCallback(
    (loc: Loc, smooth = true) => {
      const box = pane.current?.getBoundingClientRect();
      if (!box) return;
      reader.current?.jumpTo(loc, box.top + box.height * LINE - 4, smooth);
    },
    [],
  );
  const jumpToDemo = useCallback(
    (demo: Demo) => {
      setPickedId(demo.id);
      if (heldId) setHeldId(demo.id);
      jumpTo(demo.anchor);
    },
    [heldId, jumpTo],
  );
  const index = active ? demos.findIndex((d) => d.id === active.id) : -1;
  const nextAfterPos = demos.find((d) => posOf(d.anchor) > pos + 0.02);
  const step = useCallback(
    (direction: -1 | 1) => {
      const target = index >= 0 ? demos[index + direction] : direction === 1 ? nextAfterPos : [...demos].reverse().find((d) => posOf(d.anchor) < pos);
      if (target) jumpToDemo(target);
    },
    [demos, index, jumpToDemo, nextAfterPos, pos],
  );

  // keyboard: [ and ] step through demos, h holds, ? help
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "]") step(1);
      else if (event.key === "[") step(-1);
      else if (event.key === "h" && active) setHeldId((id) => (id ? null : active.id));
      else if (event.key === "?") setHelp((v) => !v);
      else if (event.key === "Escape") {
        setHelp(false);
        setSelection(null);
        setComposing(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, active]);

  // "Visualize this": offer it when the reader selects a passage in the book
  useEffect(() => {
    const onUp = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.(".select-pop, .modal-back")) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
        if (!sel || sel.rangeCount === 0 || text.length < 40 || !pane.current?.contains(sel.anchorNode)) {
          setSelection(null);
          setComposing(false);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        const box = pane.current.getBoundingClientRect();
        // under the selection, but always inside the pane (a long selection can run off-screen)
        const y = Math.min(box.height - 48, Math.max(12, rect.bottom - box.top + 8));
        // the chapter is where the selection starts, not where the reading line happens to be
        const at = reader.current?.positionAt(Math.max(box.top + 1, rect.top + 2));
        setComposing(false);
        setSelection({ text, x: Math.min(box.width - 330, Math.max(44, rect.left - box.left + rect.width / 2 - 160)), y: Math.min(y, box.height - 64), chapterId: at != null ? chapterOfRef.current(at)?.id : undefined, at: at ?? undefined });
      }, 10);
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);

  if (failed) return <div className="center-note">Could not open this book: {failed}</div>;
  if (!book) return <div className="center-note">Opening…</div>;

  const pageLabel = book.format === "pdf" ? `p. ${Math.max(1, Math.floor(pos))} / ${book.pageCount}` : `${Math.round((Math.floor(pos) / Math.max(1, book.blockCount || 1)) * 100)}%`;
  const sections = chapter?.sections || [];
  const section = [...sections].reverse().find((s) => posOf(s.start) <= pos + 1e-6);

  return (
    <div className="reader-app">
      <header className="topbar">
        <a className="brand" href="#/" title="Library">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-book">{book.title}</span>
        </a>
        <select className="toc-select" value={chapter?.id || ""} onChange={(e) => {
          const entry = book.toc.find((t) => t.id === e.target.value);
          if (entry) jumpTo(entry.start, false);
        }} aria-label="Chapter">
          {book.toc.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
              {entry.subtitle ? ` — ${entry.subtitle}` : ""}
            </option>
          ))}
        </select>
        {sections.length > 0 && (
          <select className="toc-select narrow" value={section?.id || ""} onChange={(e) => {
            const s = sections.find((x) => x.id === e.target.value);
            if (s) jumpTo(s.start, false);
          }} aria-label="Section">
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
            className="button"
            disabled={jobs.some((j) => j.kind === "plan" && j.status === "running" && !j.chapterId)}
            title="This PDF has no bookmarks: let Codex read the headings and build the chapter list"
            onClick={() => api.detectChapters(book.id).catch((e) => setToast((e as Error).message))}
          >
            {jobs.some((j) => j.kind === "plan" && j.status === "running" && !j.chapterId) ? "Finding chapters…" : "Find chapters with Codex"}
          </button>
        )}
        <span className="spacer" />
        <span className="page-label">{pageLabel}</span>
        <a className="button" href="#/review" title="Review your cards">
          Review{due ? <span className="badge">{due}</span> : null}
        </a>
        <button className={`button ${heldId ? "on" : ""}`} onClick={() => setHeldId(heldId ? null : active?.id || null)} disabled={!active && !heldId} aria-pressed={!!heldId} title="Keep this figure while you scroll (h)">
          {heldId ? "Release" : "Hold"}
        </button>
        <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Switch theme" title="Switch theme">
          {theme === "light" ? "◐" : "◑"}
        </button>
        <button className="icon-button" onClick={() => setHelp(!help)} aria-label="Help" title="Help (?)">
          ?
        </button>
      </header>

      <main className="split">
        <section className="demo-pane" aria-label="Study panel">
          <nav className="pane-tabs" aria-label="Study panel">
            {(["figures", "tutor", "notes", "study"] as Tab[]).map((t) => (
              <button key={t} className="pane-tab" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === "figures" ? "Figures" : t === "tutor" ? "Tutor" : t === "notes" ? `Notes${notes.length ? ` ${notes.length}` : ""}` : "Study"}
              </button>
            ))}
          </nav>
          <div className="pane-body">
            {tab === "figures" && <DemoPanel book={book} demo={active || null} chapter={chapter} chapterDemos={chapterDemos} allDemos={demos} jobs={jobs} theme={theme} held={!!heldId} onJump={jumpToDemo} onStep={step} canStep={{ prev: index > 0 || (index < 0 && demos.some((d) => posOf(d.anchor) < pos)), next: index >= 0 ? index < demos.length - 1 : !!nextAfterPos }} />}
            {tab === "tutor" && <TutorTab book={book} chapter={chapter} pinned={pinned} onUnpin={() => setPinned(null)} theme={theme} messages={tutorMessages} setMessages={setTutorMessages} />}
            {tab === "notes" && (
              <NotesTab
                book={book}
                notes={notes}
                theme={theme}
                reload={loadNotes}
                onJump={(loc) => jumpTo(loc)}
                onAdd={async (body) => {
                  const loc = locOfPos(book, pos);
                  await learn.createNote({ type: "note", title: body.split("\n")[0].slice(0, 80), body, source: { bookId: book.id, chapterId: chapter?.id, ...(book.format === "pdf" ? { page: loc.page, y: loc.y } : { block: loc.block }) } });
                  loadNotes();
                }}
              />
            )}
            {tab === "study" && <StudyTab book={book} chapter={chapter} theme={theme} autoQuiz={autoQuiz} />}
          </div>
        </section>
        <section className="book-pane" ref={pane} aria-label="Book">
          <div className="gutter" aria-hidden="false">
            <span className="reading-line" style={{ top: `${LINE * 100}%` }} title="Reading line" />
            {noteMarkers.map((m) => (
              <button key={m.id} className="note-mark" data-type={m.type} style={{ top: m.top }} title={`${m.type}: ${m.title}`} aria-label={`${m.type}: ${m.title}`} onClick={() => setTab("notes")} />
            ))}
            {markers.map((m) => (
              <button
                key={m.id}
                className="anchor"
                data-active={active?.id === m.id || undefined}
                data-status={m.status}
                style={{ top: m.top }}
                title={`${m.fig} · ${m.title}`}
                aria-label={`${m.fig}: ${m.title}`}
                onClick={() => {
                  const demo = demos.find((d) => d.id === m.id);
                  if (demo) jumpToDemo(demo);
                }}
              />
            ))}
          </div>
          <div className="book-view">
            {book.format === "pdf" ? (
              <PdfReader ref={reader} url={api.fileUrl(book.id)} dark={theme === "dark"} onScroll={measure} onReady={onReady} />
            ) : blocks ? (
              <HtmlReader ref={reader} blocks={blocks} onScroll={measure} onReady={onReady} />
            ) : (
              <div className="reader-loading">Opening the book…</div>
            )}
          </div>
          {selection && chapter && (
            <div className="select-pop" style={{ left: selection.x, top: selection.y }} onMouseDown={(e) => !(e.target as HTMLElement).closest("input, textarea") && e.preventDefault()}>
              {!composing ? (
                <div className="select-actions" role="toolbar" aria-label="Do something with this passage">
                  <button className="select-action primary" onClick={() => setComposing(true)} title="Draw an interactive figure of this passage">
                    ◆ Visualize
                  </button>
                  <button
                    className="select-action"
                    title="Save it to your notes"
                    onClick={async () => {
                      const sel = selection;
                      setSelection(null);
                      window.getSelection()?.removeAllRanges();
                      await learn.createNote({ type: "highlight", title: sel.text.split(/\s+/).slice(0, 10).join(" ") + "…", body: `> ${sel.text}`, source: sourceOf(sel) });
                      loadNotes();
                      setToast("Highlighted. It's in your notes and your vault.");
                      setTimeout(() => setToast(null), 3000);
                    }}
                  >
                    Highlight
                  </button>
                  <button className="select-action" title="Make flashcards from it" onClick={() => (setTool({ kind: "cards", text: selection.text, source: sourceOf(selection) }), setSelection(null))}>
                    Cards
                  </button>
                  <button
                    className="select-action"
                    title="Ask the tutor about it"
                    onClick={() => {
                      setPinned({ text: selection.text, source: sourceOf(selection) });
                      setTutorMessages([]);
                      setTab("tutor");
                      setSelection(null);
                    }}
                  >
                    Ask
                  </button>
                  <button className="select-action" title="Explain it in your own words (Feynman technique)" onClick={() => (setTool({ kind: "explain", text: selection.text, source: sourceOf(selection) }), setSelection(null))}>
                    Explain
                  </button>
                  <button className="select-action" title="Connect it to today and to your goals" onClick={() => (setTool({ kind: "connect", text: selection.text, source: sourceOf(selection) }), setSelection(null))}>
                    Connect
                  </button>
                </div>
              ) : (
                <FigureRequest
                  compact
                  onSubmit={async ({ request, kind, quality }) => {
                    const sel = selection;
                    setSelection(null);
                    setComposing(false);
                    window.getSelection()?.removeAllRanges();
                    const src = sourceOf(sel);
                    try {
                      const demo = await api.visualize(book.id, { chapterId: sel.chapterId || chapter.id, text: sel.text, request: request || undefined, kind, quality, page: src.page, block: src.block });
                      setTab("figures");
                      setPickedId(demo.id);
                      setToast(quality === "careful" ? "Drawing carefully: about a minute." : "Drawing: about fifteen seconds.");
                    } catch (error) {
                      setToast((error as Error).message);
                    }
                    setTimeout(() => setToast(null), 5000);
                  }}
                />
              )}
            </div>
          )}
        </section>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
      {tool?.kind === "cards" && <CardDrafter passage={tool.text} source={tool.source} deck={book.title} onClose={() => setTool(null)} />}
      {tool?.kind === "explain" && <ExplainBack passage={tool.text} source={tool.source} theme={theme} onClose={() => setTool(null)} />}
      {tool?.kind === "connect" && <Connector passage={tool.text} source={tool.source} theme={theme} onClose={() => (setTool(null), loadNotes())} />}
      {help && (
        <div className="help-pop" role="dialog" aria-label="Help">
          <h3>How this works</h3>
          <p>Read on the right. Each ◆ in the margin is a figure anchored to the passage it explains; when the reading line ▸ passes it, the figure appears on the left. Short marks are your notes.</p>
          <ul>
            <li><kbd>[</kbd> <kbd>]</kbd> previous / next figure · <kbd>h</kbd> hold it while you scroll</li>
            <li>Select a passage: <em>Visualize</em> (say what to show), <em>Highlight</em>, make <em>Cards</em>, <em>Ask</em> the tutor, <em>Explain</em> it back, <em>Connect</em> it to today</li>
            <li><em>Study</em>: pretest before a chapter, quiz after, map its concepts into your graph</li>
            <li><kbd>⌘K</kbd> searches everything you've read and written</li>
          </ul>
          <button className="button" onClick={() => setHelp(false)}>Close</button>
        </div>
      )}
    </div>
  );
}
