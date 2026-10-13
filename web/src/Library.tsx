import { useEffect, useRef, useState } from "react";
import { api, type Book, type Status } from "./api";

export function Library({ theme, setTheme }: { theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => api.books().then(setBooks, (e) => setError(e.message));
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
    <div className="library">
      <header className="library-head">
        <div className="brand big">
          <span className="brand-mark" aria-hidden="true" />
          <span>Feynman’s Classroom</span>
        </div>
        <span className="spacer" />
        <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Switch theme">
          {theme === "light" ? "◐" : "◑"}
        </button>
      </header>
      <p className="lede">Read a book beside small, animated demos of its ideas. Upload a book; Codex reads each chapter and builds an interactive figure for every idea worth seeing move, anchored to the passage it explains.</p>

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
        <input ref={input} type="file" accept=".pdf,.epub,.md,.markdown,.txt" hidden onChange={(e) => upload(e.target.files?.[0])} />
        {uploading ? (
          <span>Reading “{uploading}”…</span>
        ) : (
          <>
            <span className="drop-title">Drop a book here, or click to choose one</span>
            <span className="fine">PDF (with selectable text), EPUB, Markdown or plain text</span>
          </>
        )}
      </div>
      {error && <p className="form-error">{error}</p>}

      <section className="shelf">
        {books === null ? (
          <p className="fine">Loading…</p>
        ) : books.length === 0 ? (
          <p className="fine">Your shelf is empty.</p>
        ) : (
          books.map((book) => (
            <article key={book.id} className="book-card">
              <a href={`#/book/${book.id}`} className="book-link">
                <span className="book-format">{book.format}</span>
                <span className="book-title">{book.title}</span>
                {book.author && <span className="book-author">{book.author}</span>}
                <span className="book-meta">
                  {book.format === "pdf" ? `${book.pageCount} pages` : `${book.toc.length} chapters`} · {book.demoCount || 0} demo{book.demoCount === 1 ? "" : "s"}
                  {book.building ? ` · ${book.building} building` : ""}
                </span>
                {book.status === "error" && <span className="form-error">{book.error}</span>}
              </a>
              <button
                className="book-delete"
                aria-label={`Remove ${book.title}`}
                onClick={async () => {
                  if (!confirm(`Remove "${book.title}" and its demos?`)) return;
                  await api.deleteBook(book.id);
                  refresh();
                }}
              >
                ×
              </button>
            </article>
          ))
        )}
      </section>

      <footer className="status-line">
        {status ? (
          <>
            <span data-ok={status.codex.installed && status.codex.loggedIn}>
              Codex {status.codex.installed ? (status.codex.loggedIn ? `ready · ${status.codex.detail || "logged in"}` : "installed but not logged in: run codex login") : "not installed"}
            </span>
            <span data-ok={status.chrome}>Browser check {status.chrome ? "ready" : "unavailable (set CHROME_PATH)"}</span>
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
