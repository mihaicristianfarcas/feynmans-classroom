/* Changing a book's details: its title and author, and, folded away, its chapters' names (and a
 * chapter's subtitle where it has one). Only what changed is sent. A book kept once for several vaults
 * changes in all of them, and the dialog says so. */
import { type FormEvent, useState } from "react";
import { api, type Book } from "../api";
import { announce } from "../lib/a11y";
import { Spinner } from "./feedback";
import { Modal } from "./tools";

export function BookDetails({
  book,
  onSaved,
  onClose,
}: {
  book: Book;
  onSaved: (book: Book) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author || "");
  const [chapters, setChapters] = useState(() =>
    book.toc.map((t) => ({ id: t.id, title: t.title, subtitle: t.subtitle ?? null })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rename = (i: number, change: { title?: string; subtitle?: string }) =>
    setChapters((was) => was.map((c, j) => (j === i ? { ...c, ...change } : c)));
  const complete = !!title.trim() && chapters.every((c) => c.title.trim());
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const details: Parameters<typeof api.editBook>[1] = {};
    if (title.trim() !== book.title) details.title = title;
    if (author.trim() !== (book.author || "")) details.author = author;
    // only the chapters renamed here, so nothing else about the others is written over
    const renamed = chapters.filter(
      (c, i) => c.title.trim() !== book.toc[i].title || (c.subtitle ?? "").trim() !== (book.toc[i].subtitle ?? ""),
    );
    if (renamed.length)
      details.chapters = renamed.map((c) => ({ id: c.id, title: c.title, subtitle: c.subtitle ?? undefined }));
    if (!Object.keys(details).length) return onClose();
    setBusy(true);
    setError(null);
    try {
      const saved = await api.editBook(book.id, details);
      announce(`Saved the details of ${saved.title}`);
      onSaved(saved);
    } catch (err) {
      setBusy(false);
      setError((err as Error).message);
    }
  };
  return (
    <Modal title="Edit details" onClose={onClose}>
      <form className="book-details" onSubmit={save}>
        <label className="field">
          <span>Title</span>
          <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="field">
          <span>Author</span>
          <input value={author} maxLength={200} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        {chapters.length > 0 && (
          <details className="disclosure book-chapters">
            <summary>{chapters.length === 1 ? "The chapter’s name" : `Chapter names (${chapters.length})`}</summary>
            <ol>
              {chapters.map((c, i) => (
                <li key={c.id}>
                  <span className="book-chapter-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <input
                    value={c.title}
                    maxLength={200}
                    onChange={(e) => rename(i, { title: e.target.value })}
                    aria-label={`Chapter ${i + 1}`}
                    required
                  />
                  {c.subtitle !== null && (
                    <input
                      value={c.subtitle}
                      maxLength={200}
                      onChange={(e) => rename(i, { subtitle: e.target.value })}
                      aria-label={`Chapter ${i + 1}’s subtitle`}
                      placeholder="Subtitle"
                    />
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
        {book.alsoIn?.length ? (
          <p className="fine">The book is kept once, so it changes in {book.alsoIn.join(", ")} too.</p>
        ) : null}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={busy || !complete}>
            {busy ? <Spinner label="Saving" /> : "Save"}
          </button>
          <button type="button" className="button subtle" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
