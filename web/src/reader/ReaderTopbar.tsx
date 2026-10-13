/* The reader's top bar: back to the library, the book's title, chapter and section pickers, "Find
 * chapters" for a PDF without bookmarks, Capture, the page, Review, Hold (on the Figures pane), the
 * theme and Help. */
import { ArrowLeft, CircleHelp, Crop, Layers, Pin, PinOff } from "lucide-react";
import { api, type Book, type Job, type Loc, posOf, type TocEntry } from "../api";
import { ThemeButton, useDueCount } from "../app/Shell";

export function ReaderTopbar({
  book,
  pos,
  chapter,
  jobs,
  onJump,
  capturing,
  onCapture,
  hold,
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
  /** Shown on the Figures pane: keeps the figure while you scroll. */
  hold: { held: boolean; disabled: boolean; toggle: () => void } | null;
  help: boolean;
  onHelp: () => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  say: (text: string) => void;
}) {
  const due = useDueCount();
  const pageLabel =
    book.format === "pdf"
      ? `p. ${Math.max(1, Math.floor(pos))} / ${book.pageCount}`
      : `${Math.round((Math.floor(pos) / Math.max(1, book.blockCount || 1)) * 100)}%`;
  const sections = chapter?.sections || [];
  const section = [...sections].reverse().find((s) => posOf(s.start) <= pos + 1e-6);
  const findingChapters = jobs.some((j) => j.kind === "plan" && j.status === "running" && !j.chapterId);
  return (
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
      <span className="page-label">{pageLabel}</span>
      <a className="button subtle" href="#/review" title="Review your cards">
        <Layers aria-hidden="true" />
        Review{due ? <span className="badge">{due}</span> : null}
      </a>
      {hold && (
        <button
          type="button"
          className={`button subtle ${hold.held ? "on" : ""}`}
          onClick={hold.toggle}
          disabled={hold.disabled}
          aria-pressed={hold.held}
          title="Keep this figure while you scroll (h)"
        >
          {hold.held ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
          {hold.held ? "Release" : "Hold"}
        </button>
      )}
      <span className="topbar-sep" />
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
