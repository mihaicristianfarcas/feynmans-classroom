/* The books the learner's other vaults have and this one doesn't, to add from the library: each with
 * the vaults that have it, added at once (it is the same book, kept once, so nothing is read again). */
import { Plus } from "lucide-react";
import { useState } from "react";
import { api, type BookElsewhere } from "../api";
import { BookCover } from "../components/BookCover";
import { Spinner } from "../components/feedback";
import { Modal } from "../components/tools";
import { announce } from "../lib/a11y";

export function BooksElsewhere({
  books,
  onAdded,
  onClose,
}: {
  books: BookElsewhere[];
  onAdded: () => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const add = async (book: BookElsewhere) => {
    setAdding(book.id);
    setError(null);
    try {
      await api.bringIn(book.id);
      setAdded((was) => new Set(was).add(book.id));
      announce(`Added ${book.title}`);
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(null);
    }
  };
  return (
    <Modal title="From your other vaults" onClose={onClose}>
      <p className="fine">
        The same book, not a copy: its file is kept once, and the margin you make here is this vault’s.
      </p>
      <ul className="elsewhere-list">
        {books.map((book) => (
          <li key={book.id}>
            <BookCover id={book.id} title={book.title} size="tiny" hidden />
            <span className="elsewhere-text">
              <span className="elsewhere-title">{book.title}</span>
              <span className="fine">{[book.author, `in ${book.vaults.join(", ")}`].filter(Boolean).join(" · ")}</span>
            </span>
            {added.has(book.id) ? (
              <span className="saved">Added</span>
            ) : adding === book.id ? (
              <Spinner label="Adding" />
            ) : (
              <button
                type="button"
                className="button small"
                onClick={() => add(book)}
                disabled={!!adding}
                aria-label={`Add ${book.title}`}
              >
                <Plus aria-hidden="true" />
                Add
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
