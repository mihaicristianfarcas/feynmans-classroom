/* The library: your books as a shelf of covers (add one with the button, or drop a file anywhere on the
 * page) and, under Figures (#/library/figures), the figures you drew. It mentions the model tool only
 * when the one in use isn't ready. */
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Book, learn, type SettingsInfo } from "../api";
import { Spinner } from "../components/feedback";
import { toneOf, useIndicator } from "../components/ui";
import { Figures } from "./Figures";

const FORMATS = "PDF with selectable text, EPUB, Markdown or plain text";

export function Library({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const view = hash.split("?")[0].startsWith("#/library/figures") ? "figures" : "books";
  const views = useIndicator<HTMLElement>(view);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // a file dragged over the page: counted, so moving across children doesn't flicker the overlay
  const [drag, setDrag] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => api.books().then(setBooks, (e) => setError(e.message));
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, when the page opens
  useEffect(() => {
    refresh();
    learn.settings().then(setInfo, () => setInfo(null));
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(file.name);
    try {
      const book = await api.upload(file);
      location.hash = `#/book/${book.id}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
      refresh();
    }
  };
  const files = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const ready =
    !info || (info.active === "codex" ? info.codex.installed && info.codex.loggedIn : info.claude.installed);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping a file is a shortcut; "Add a book" does the same
    <div
      className="library rise"
      onDragEnter={(e) => files(e) && setDrag((n) => n + 1)}
      onDragLeave={(e) => files(e) && setDrag((n) => Math.max(0, n - 1))}
      onDragOver={(e) => files(e) && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(0);
        if (view === "books") upload(e.dataTransfer.files[0]);
      }}
    >
      <header className="page-head row">
        <h1 className="page-title">Library</h1>
        <nav className="segmented" aria-label="Library" ref={views}>
          <a href="#/library" aria-current={view === "books" ? "page" : undefined}>
            Books
          </a>
          <a href="#/library/figures" aria-current={view === "figures" ? "page" : undefined}>
            Figures
          </a>
        </nav>
        <span className="spacer" />
        {view === "books" && books?.length ? (
          <AddBook uploading={uploading} onClick={() => input.current?.click()} />
        ) : null}
      </header>
      <input
        ref={input}
        type="file"
        accept=".pdf,.epub,.md,.markdown,.txt"
        hidden
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!ready && info && (
        <p className="fine notice">
          {info.active === "codex"
            ? info.codex.installed
              ? "Codex isn’t logged in (run codex login), so nothing can be explained or drawn yet."
              : "Codex isn’t installed (npm i -g @openai/codex), so nothing can be explained or drawn yet."
            : "Claude Code isn’t installed (npm i -g @anthropic-ai/claude-code), so nothing can be explained or drawn yet."}{" "}
          <a href="#/settings">Settings</a>
        </p>
      )}

      {view === "figures" ? (
        <Figures theme={theme} />
      ) : books === null ? (
        <Spinner label="Loading your shelf" />
      ) : books.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">Bring in a hard book</h2>
          <p className="fine">
            Read it beside a margin that explains, draws and quizzes. {FORMATS}; or drop a file on this page.
          </p>
          <AddBook uploading={uploading} onClick={() => input.current?.click()} primary />
        </div>
      ) : (
        <ul className="shelf stagger" aria-label="Your books">
          {books.map((book) => (
            <li key={book.id} className="book-card">
              <a href={`#/book/${book.id}`} className="book-link">
                <span className="book-cover" data-tone={toneOf(book.id)} aria-hidden="true">
                  <span className="book-cover-letter">{book.title.replace(/^(the|a|an)\s+/i, "")[0]}</span>
                </span>
                <span className="book-title">{book.title}</span>
                <span className="book-author">
                  {book.author ||
                    (book.format === "pdf"
                      ? `${book.pageCount} pages`
                      : `${book.toc.length} chapter${book.toc.length === 1 ? "" : "s"}`)}
                </span>
                {book.building ? <span className="fine">Drawing {book.building} figures…</span> : null}
                {book.status === "error" && <span className="form-error">{book.error}</span>}
              </a>
              <button
                type="button"
                className="icon-button book-delete"
                aria-label={`Remove ${book.title}`}
                title="Remove from the library"
                onClick={async () => {
                  if (!confirm(`Remove "${book.title}" and its figures?`)) return;
                  await api.deleteBook(book.id);
                  refresh();
                }}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {drag > 0 && view === "books" && (
        <div className="drop-overlay" aria-hidden="true">
          <span>Drop to add it to your library</span>
        </div>
      )}
    </div>
  );
}

function AddBook({
  uploading,
  onClick,
  primary,
}: {
  uploading: string | null;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button ${primary ? "primary" : ""}`}
      onClick={onClick}
      disabled={!!uploading}
      title={FORMATS}
    >
      {uploading ? (
        <Spinner label={`Reading “${uploading}”`} />
      ) : (
        <>
          <Plus aria-hidden="true" />
          Add a book
        </>
      )}
    </button>
  );
}
