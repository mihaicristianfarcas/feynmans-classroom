/* Making a vault: its name, and the books to bring along from this vault or the others (kept once, not
 * copied). It starts with the learner's profile and nothing else, and opens once it's made. */
import { type FormEvent, useState } from "react";
import { api, vaults } from "../api";
import { Spinner } from "../components/feedback";
import { Modal } from "../components/tools";
import { useLoad } from "../lib/useLoad";
import { openVault } from "./open";

interface Pick {
  id: string;
  title: string;
  author?: string;
  /** The other vaults that have it (none: this one does). */
  vaults: string[];
}

export function NewVault({ onClose }: { onClose: () => void }) {
  const { data: here } = useLoad(() => api.books(), [], "books");
  const { data: elsewhere } = useLoad(() => api.elsewhere(), []);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const books: Pick[] = [
    ...(here || [])
      .filter((b) => b.status === "ready")
      .map((b) => ({ id: b.id, title: b.title, author: b.author, vaults: [] })),
    ...(elsewhere || []),
  ];
  const toggle = (id: string) =>
    setPicked((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const make = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const vault = await vaults.create(name, [...picked]);
      await openVault(vault.id);
    } catch (err) {
      setBusy(false);
      setError((err as Error).message);
    }
  };
  return (
    <Modal title="New vault" onClose={onClose}>
      <form className="new-vault" onSubmit={make}>
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Physics, work, a language…"
            aria-describedby="new-vault-about"
          />
        </label>
        <p className="fine" id="new-vault-about">
          A folder of its own for notes, cards and concepts, with your profile. Books you bring stay one copy on disk,
          however many vaults have them.
        </p>
        {books.length > 0 && (
          <fieldset className="new-vault-books">
            <legend>Books to bring along</legend>
            <ul>
              {books.map((book) => (
                <li key={book.id}>
                  <label className="check">
                    <input type="checkbox" checked={picked.has(book.id)} onChange={() => toggle(book.id)} />
                    <span className="new-vault-book">
                      <span className="new-vault-title">{book.title}</span>
                      <span className="fine">
                        {[book.author, book.vaults.length ? `in ${book.vaults.join(", ")}` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button primary" disabled={busy || !name.trim()}>
            {busy ? <Spinner label="Making the vault" /> : "Make and open"}
          </button>
          <button type="button" className="button subtle" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
