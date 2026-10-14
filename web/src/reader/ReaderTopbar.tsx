/* The reader's top bar: back to the library, the button that hides and shows the study panel, the
 * book's title, chapter and section pickers, "Find chapters" for a PDF without bookmarks, Find, the
 * zoom, Capture, the pages (a strip of thumbnails), the page (type a number to go there), Review, the
 * agent, the theme and Help. */
import { ArrowLeft, CircleHelp, Crop, GalleryVertical, Layers, Minus, Plus, Search } from "lucide-react";
import { useState } from "react";
import { AgentButton } from "../agent/AgentButton";
import { api, type Book, type Job, type Loc, posOf, type TocEntry } from "../api";
import { ThemeButton, useDueCount } from "../app/Shell";
import { PanelToggle } from "../components/Panel";
import type { Panel } from "../lib/usePanel";
import type { Zoom } from "./readers";
import { stepZoom } from "./session";

export function ReaderTopbar({
  book,
  pos,
  chapter,
  jobs,
  onJump,
  capturing,
  onCapture,
  panel,
  zoom,
  onFind,
  pages,
  help,
  onHelp,
  theme,
  setTheme,
  say,
}: {
  book: Book;
  pos: number;
  chapter: TocEntry | null;
  jobs: Job[];
  onJump: (loc: Loc) => void;
  capturing: boolean;
  onCapture: () => void;
  /** The study panel beside the book. */
  panel: Panel;
  /** The scale the book is drawn at, whether it fits the pane, and a way to change it. */
  zoom: { scale: number; fit: boolean; set: (z: Zoom) => void };
  onFind: () => void;
  /** The strip of page thumbnails (a PDF's). */
  pages: { open: boolean; toggle: () => void } | null;
  help: boolean;
  onHelp: () => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  say: (text: string) => void;
}) {
  const due = useDueCount();
  const page = Math.max(1, Math.floor(pos));
  const [draft, setDraft] = useState<string | null>(null);
  const sections = chapter?.sections || [];
  const section = [...sections].reverse().find((s) => posOf(s.start) <= pos + 1e-6);
  const findingChapters = jobs.some((j) => j.kind === "plan" && j.status === "running" && !j.chapterId);
  return (
    <header className="topbar">
      <a className="icon-button" href="#/library" title="Library" aria-label="Back to the library">
        <ArrowLeft aria-hidden="true" />
      </a>
      <PanelToggle panel={panel} side="left" label="study panel" />
      <h1 className="book-name" title={book.title}>
        {book.title}
      </h1>
      <select
        className="toc-select"
        value={chapter?.id || ""}
        onChange={(e) => {
          const entry = book.toc.find((t) => t.id === e.target.value);
          if (entry) onJump(entry.start);
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
            if (s) onJump(s.start);
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
          disabled={findingChapters}
          title="This PDF has no bookmarks: let the model read the headings and build the chapter list"
          onClick={() => api.detectChapters(book.id).catch((e) => say((e as Error).message))}
        >
          {findingChapters ? "Finding chapters…" : "Find chapters"}
        </button>
      )}
      <span className="spacer" />
      <button
        type="button"
        className="icon-button"
        onClick={onFind}
        aria-label="Find in the book"
        title="Find (⌘F or /)"
      >
        <Search aria-hidden="true" />
      </button>
      <fieldset className="zoom-group">
        <legend className="visually-hidden">Zoom</legend>
        <button
          type="button"
          className="icon-button small"
          aria-label="Smaller"
          title="Smaller (−)"
          onClick={() => zoom.set(stepZoom(zoom.scale, -1))}
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="zoom-value"
          aria-pressed={zoom.fit}
          title={zoom.fit ? "Fitted to the pane" : "Fit to the pane (0)"}
          onClick={() => zoom.set("fit")}
        >
          {Math.round(zoom.scale * 100)}%<span className="visually-hidden">: fit to the pane</span>
        </button>
        <button
          type="button"
          className="icon-button small"
          aria-label="Bigger"
          title="Bigger (+)"
          onClick={() => zoom.set(stepZoom(zoom.scale, 1))}
        >
          <Plus aria-hidden="true" />
        </button>
      </fieldset>
      {book.format === "pdf" && (
        <button
          type="button"
          className={`button subtle ${capturing ? "on" : ""}`}
          onClick={onCapture}
          aria-pressed={capturing}
          title="Capture a figure, formula or table from the page into your note (C)"
        >
          <Crop aria-hidden="true" />
          Capture
        </button>
      )}
      {pages && (
        <button
          type="button"
          className={`icon-button ${pages.open ? "on" : ""}`}
          aria-pressed={pages.open}
          aria-label="Pages"
          title="Pages (P)"
          onClick={pages.toggle}
        >
          <GalleryVertical aria-hidden="true" />
        </button>
      )}
      {book.format === "pdf" ? (
        <label className="page-label page-jump">
          <span aria-hidden="true">p.</span>
          <input
            type="text"
            inputMode="numeric"
            aria-label={`Page (of ${book.pageCount}): type a number to go there`}
            value={draft ?? String(page)}
            size={Math.max(2, String(book.pageCount).length)}
            onFocus={(e) => {
              setDraft(String(page));
              e.target.select();
            }}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = Number(draft);
                if (n >= 1 && n <= (book.pageCount || n)) onJump({ page: n, y: 0 });
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
          />
          <span aria-hidden="true">/ {book.pageCount}</span>
        </label>
      ) : (
        <span className="page-label" title="How far through the book you are">
          {Math.round((Math.floor(pos) / Math.max(1, book.blockCount || 1)) * 100)}% through
        </span>
      )}
      <a className="button subtle" href="#/review" title="Review your cards">
        <Layers aria-hidden="true" />
        Review{due ? <span className="badge">{due}</span> : null}
      </a>
      <span className="topbar-sep" />
      <AgentButton />
      <ThemeButton theme={theme} setTheme={setTheme} />
      <button
        type="button"
        className="icon-button"
        onClick={onHelp}
        aria-label="Help"
        aria-expanded={help}
        title="Help (?)"
      >
        <CircleHelp aria-hidden="true" />
      </button>
    </header>
  );
}
