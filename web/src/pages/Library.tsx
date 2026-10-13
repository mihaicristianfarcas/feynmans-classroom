import { Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Book, type Status } from "../api";
import { Spinner } from "../components/feedback";
import { toneOf } from "../components/ui";

export function Library() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => api.books().then(setBooks, (e) => setError(e.message));
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, when the page opens
  useEffect(() => {
    refresh();
    api.status().then(setStatus, () => setStatus(null));
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

  return (
    <div className="library rise">
      <header className="page-head">
        <h1 className="page-title">Library</h1>
        <p className="lede small">
          Bring in a hard book and read it with a margin that explains, draws and quizzes. Select any passage to ask
          about it.
        </p>
      </header>

      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files[0]);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      >
        <input
          ref={input}
          type="file"
          accept=".pdf,.epub,.md,.markdown,.txt"
          hidden
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <span className="well drop-icon" data-tone={drag ? "lavender" : undefined} aria-hidden="true">
          <Upload />
        </span>
        {uploading ? (
          <Spinner label={`Reading “${uploading}”`} />
        ) : (
          <span className="drop-text">
            <span className="drop-title">Drop a book here, or choose one</span>
            <span className="fine">PDF with selectable text, EPUB, Markdown or plain text</span>
          </span>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}

      <section className="shelf stagger">
        {books === null ? (
          <Spinner label="Loading your shelf" />
        ) : books.length === 0 ? (
          <p className="fine">Your shelf is empty.</p>
        ) : (
          books.map((book) => (
            <article key={book.id} className="book-card">
              <a href={`#/book/${book.id}`} className="book-link">
                <span className="book-cover" data-tone={toneOf(book.id)} aria-hidden="true">
                  <span className="book-cover-letter">{book.title.replace(/^(the|a|an)\s+/i, "")[0]}</span>
                  <span className="book-format">{book.format}</span>
                </span>
                <span className="book-title">{book.title}</span>
                {book.author && <span className="book-author">{book.author}</span>}
                <span className="book-meta">
                  {book.format === "pdf" ? `${book.pageCount} pages` : `${book.toc.length} chapters`} ·{" "}
                  {book.demoCount || 0} figure{book.demoCount === 1 ? "" : "s"}
                  {book.building ? ` · ${book.building} building` : ""}
                </span>
                {book.status === "error" && <span className="form-error">{book.error}</span>}
              </a>
              <button
                type="button"
                className="icon-button book-delete"
                aria-label={`Remove ${book.title}`}
                title="Remove from the library"
                onClick={async () => {
                  if (!confirm(`Remove "${book.title}" and its demos?`)) return;
                  await api.deleteBook(book.id);
                  refresh();
                }}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </article>
          ))
        )}
      </section>

      <footer className="status-line">
        {status ? (
          <>
            <span data-ok={status.codex.installed && status.codex.loggedIn}>
              Codex{" "}
              {status.codex.installed
                ? status.codex.loggedIn
                  ? `ready · ${status.codex.detail || "logged in"}`
                  : "installed but not logged in: run codex login"
                : "not installed"}{" "}
              · <a href="#/settings">settings</a>
            </span>
            <span data-ok={status.chrome}>
              Browser check {status.chrome ? "ready" : "unavailable (set CHROME_PATH)"}
            </span>
            <span>
              {status.queue.running} building · {status.queue.waiting} waiting
            </span>
          </>
        ) : (
          <span>API not reachable</span>
        )}
      </footer>
    </div>
  );
}
