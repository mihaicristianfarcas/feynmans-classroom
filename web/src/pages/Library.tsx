/* The library: your books as a shelf of covers (its title and author set on each), with how far through
 * each you are and what it holds under it; find one by its title or author, and order them by the last
 * one you touched, by title or by author. Add books with the button (several at once) or a whole folder,
 * or drop files or folders anywhere on the page: each stands on the shelf while it's read, and a book
 * added on its own then opens; with several, how far it has got and what wasn't added show under the
 * title. A book one of your other vaults has can be added from there as it is (kept once). Under
 * Figures (#/library/figures), the figures you drew. It mentions the model tool only when the one in
 * use isn't ready. */
import { FolderPlus, Plus, Search, Library as Shelves, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, type Book, learn } from "../api";
import { ahead } from "../app/pages";
import { providerProblem, providerReady } from "../app/provider";
import { AddingBooks } from "../components/AddingBooks";
import { BookCover, Meter, progressText } from "../components/BookCover";
import { Loading, Spinner } from "../components/feedback";
import { useIndicator } from "../components/ui";
import { BOOK_FORMATS, useBookUpload } from "../lib/useBookUpload";
import { useLoad } from "../lib/useLoad";
import { BooksElsewhere } from "../vaults/BooksElsewhere";
import { Figures } from "./Figures";

type Order = "recent" | "title" | "author";
const ORDERS: { id: Order; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "title", label: "Title" },
  { id: "author", label: "Author" },
];
const savedOrder = (): Order => {
  try {
    const o = localStorage.getItem("classroom-library-order");
    return o === "title" || o === "author" ? o : "recent";
  } catch {
    return "recent";
  }
};

export function Library({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const view = hash.split("?")[0].startsWith("#/library/figures") ? "figures" : "books";
  const views = useIndicator<HTMLElement>(view);
  const { data: books, error: loadError, reload: reloadBooks } = useLoad(() => api.books(), [], "books");
  const { data: elsewhere, reload: reloadElsewhere } = useLoad(() => api.elsewhere(), [], "books-elsewhere");
  const [bringing, setBringing] = useState(false);
  const reload = () => {
    reloadBooks();
    reloadElsewhere();
  };
  const { data: info } = useLoad(() => learn.settings(), [], "settings");
  const add = useBookUpload(reload);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order>(savedOrder);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (books ?? []).filter((b) => !q || `${b.title} ${b.author || ""}`.toLowerCase().includes(q));
    const when = (b: Book) => b.lastOpened ?? new Date(b.createdAt).getTime();
    return list.sort((a, b) =>
      order === "title"
        ? a.title.localeCompare(b.title)
        : order === "author"
          ? (a.author || "~").localeCompare(b.author || "~") || a.title.localeCompare(b.title)
          : when(b) - when(a),
    );
  }, [books, query, order]);
  const ready = !info || providerReady(info);

  return (
    <div className="library rise" {...(view === "books" ? add.dropTarget : {})}>
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
        {view === "books" && books?.length && elsewhere?.length ? (
          <button type="button" className="button subtle" onClick={() => setBringing(true)} aria-haspopup="dialog">
            <Shelves aria-hidden="true" />
            From other vaults
          </button>
        ) : null}
        {view === "books" && books?.length ? (
          <>
            <button type="button" className="button subtle" onClick={add.chooseFolder}>
              <FolderPlus aria-hidden="true" />
              Add a folder
            </button>
            <AddBooks onClick={add.choose} />
          </>
        ) : null}
      </header>
      <input {...add.field} />
      <input {...add.folderField} />
      {view === "books" && <AddingBooks add={add} />}
      {loadError && (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      )}
      {!ready && info && (
        <p className="fine notice">
          {providerProblem(info)}, so nothing can be explained or drawn yet. <a href="#/settings">Settings</a>
        </p>
      )}

      {view === "figures" ? (
        <Figures theme={theme} />
      ) : books === null ? (
        <Loading label="Opening your shelf" />
      ) : books.length === 0 && add.current === null ? (
        <div className="empty-drop">
          <h2 className="empty-title">Bring in a hard book</h2>
          <p className="fine">Read it beside a margin that explains, draws and quizzes. {BOOK_FORMATS}.</p>
          <AddBooks onClick={add.choose} />
          <p className="fine">
            Choose several at once, or drop files anywhere on this page.{" "}
            <button type="button" className="link" onClick={add.chooseFolder}>
              Add a whole folder
            </button>
          </p>
          {elsewhere?.length ? (
            <button type="button" className="link" onClick={() => setBringing(true)} aria-haspopup="dialog">
              Add one from your other vaults ({elsewhere.length})
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {books.length > 1 && (
            <div className="shelf-tools">
              <label className="search-field">
                <Search aria-hidden="true" />
                <span className="visually-hidden">Find a book</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find by title or author"
                />
              </label>
              <label className="shelf-order">
                <span>Order</span>
                <select
                  className="quiet-select"
                  value={order}
                  onChange={(e) => {
                    const o = e.target.value as Order;
                    setOrder(o);
                    try {
                      localStorage.setItem("classroom-library-order", o);
                    } catch {}
                  }}
                >
                  {ORDERS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="fine shelf-count" aria-live="polite">
                {query.trim()
                  ? `${shown.length} of ${books.length} books`
                  : `${books.length} book${books.length === 1 ? "" : "s"}`}
              </span>
            </div>
          )}
          {shown.length === 0 && add.current === null ? (
            <p className="fine shelf-none">No book’s title or author has “{query.trim()}” in it.</p>
          ) : (
            <ul className="shelf stagger" aria-label="Your books">
              {add.current !== null && (
                <li className="book-card" aria-busy="true">
                  <span className="book-link">
                    <span className="book-cover cover-live">
                      <span className="book-cover-title">{titleOf(add.current)}</span>
                    </span>
                    <Spinner label="Reading the book" />
                  </span>
                </li>
              )}
              {shown.map((book) => (
                <li key={book.id} className="book-card">
                  <a href={`#/book/${book.id}`} className="book-link" {...ahead("#/book")}>
                    <BookCover id={book.id} title={book.title} author={book.author} />
                    <span className="book-progress">
                      <Meter value={book.progress?.fraction ?? 0} />
                      <span>{progressText(book.progress)}</span>
                    </span>
                    <span className="book-facts">{facts(book)}</span>
                    {book.building ? <Spinner label={`Drawing ${book.building} figures`} /> : null}
                    {book.status === "error" && <span className="form-error">{book.error}</span>}
                  </a>
                  <button
                    type="button"
                    className="icon-button book-delete"
                    aria-label={`Remove ${book.title}`}
                    title="Remove from the library"
                    onClick={async () => {
                      const also = book.alsoIn?.length
                        ? ` It stays in ${book.alsoIn.join(", ")}; the margin and figures made here go.`
                        : "";
                      if (
                        !confirm(
                          also
                            ? `Remove "${book.title}" from this vault?${also}`
                            : `Remove "${book.title}" and its figures?`,
                        )
                      )
                        return;
                      await api.deleteBook(book.id);
                      reload();
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {bringing && elsewhere && (
        <BooksElsewhere
          books={elsewhere}
          onAdded={reloadBooks}
          onClose={() => {
            setBringing(false);
            reloadElsewhere();
          }}
        />
      )}
      {add.dragging && view === "books" && (
        <div className="drop-overlay" aria-hidden="true">
          <span>Drop to add them to your library</span>
        </div>
      )}
    </div>
  );
}

/** The title a file being read stands under until the book gives its own: its name, without the ending. */
const titleOf = (path: string) =>
  path
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "");

/** What a book holds: its length, and its figures once there are some. */
function facts(book: Book): string {
  const length =
    book.format === "pdf" && book.pageCount
      ? `${book.pageCount} pages`
      : `${book.toc.length} chapter${book.toc.length === 1 ? "" : "s"}`;
  return book.demoCount ? `${length}, ${book.demoCount} figure${book.demoCount === 1 ? "" : "s"}` : length;
}

/** Opens the file field: one book, or several at once. */
function AddBooks({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="button primary" onClick={onClick} title={BOOK_FORMATS}>
      <Plus aria-hidden="true" />
      Add books
    </button>
  );
}
