/* The reader's Note tab: the note you write in while reading (the book's own note unless you pick
 * another). Passages and answers you send from the book land at its end; you write around them. */
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Book, type Loc, learn, type Note } from "../api";
import { Markdown } from "../components/Markdown";
import { useIndicator } from "../components/ui";
import { timeAgo } from "../lib/time";
import { useVaultEvents } from "../lib/useVaultEvents";
import { NoteEditor } from "../notes/NoteEditor";

export function ReaderNote({
  book,
  note,
  onChoose,
  ensureNote,
  bookNotes,
  theme,
  onJump,
  reload,
}: {
  book: Book;
  note: Note | null;
  onChoose: (n: Note | null) => void;
  ensureNote: () => Promise<Note>;
  bookNotes: Note[];
  theme: "light" | "dark";
  onJump: (loc: Loc) => void;
  reload: () => void;
}) {
  const [recent, setRecent] = useState<Note[]>([]);
  const [body, setBody] = useState(note?.body ?? "");
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const modes = useIndicator<HTMLFieldSetElement>(`${mode}-${note?.id}`);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef(note);
  current.current = note;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloads the recent notes when another note is chosen
  useEffect(() => {
    learn.notes().then(
      (list) => setRecent(list.slice(0, 20)),
      () => {},
    );
  }, [note?.id]);
  const refresh = useCallback(async () => {
    const n = current.current;
    if (!n) return;
    try {
      const fresh = await learn.note(n.id);
      if (!dirty.current) setBody(fresh.body);
      if (fresh.updated !== n.updated || fresh.title !== n.title) onChoose(fresh);
    } catch {
      onChoose(null);
    }
  }, [onChoose]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets the editor only when a different note opens
  useEffect(() => {
    dirty.current = false;
    setBody(note?.body ?? "");
    // the copy we were handed may be older than the file (a passage added while this tab was closed)
    refresh();
  }, [note?.id]);
  // a passage sent from the book (or an agent's edit) changes the file: show it
  // biome-ignore lint/correctness/useExhaustiveDependencies: a newer version of the same note replaces the text, unless you are typing
  useEffect(() => {
    if (note && !dirty.current && note.body !== body) setBody(note.body);
  }, [note?.updated]);
  useVaultEvents((path) => {
    if (current.current && path === current.current.path) refresh();
  });

  const onBody = (text: string) => {
    setBody(text);
    dirty.current = true;
    setState("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const n = current.current;
      if (!n) return;
      setState("saving");
      const saved = await learn.updateNote(n.id, { body: text });
      dirty.current = false;
      setState("saved");
      onChoose(saved);
    }, 700);
  };
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const choices = [...new Map([...bookNotes, ...recent].map((n) => [n.id, n])).values()];
  return (
    <div className="reader-note">
      <div className="reader-note-head">
        <select
          value={note?.id || ""}
          onChange={async (e) => {
            const v = e.target.value;
            if (v === "__new") {
              const title = prompt("Title of the new note:", `${book.title} — `);
              if (!title?.trim()) return;
              const created = await learn.createNote({ title: title.trim(), body: "", source: { bookId: book.id } });
              onChoose(created);
              reload();
            } else if (v) onChoose(await learn.note(v));
          }}
          aria-label="Which note to write in"
        >
          {!note && <option value="">Choose a note…</option>}
          {choices.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title}
            </option>
          ))}
          <option value="__new">New note…</option>
        </select>
        {note && (
          <>
            <fieldset className="segmented" ref={modes}>
              <legend className="visually-hidden">Mode</legend>
              <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
                Edit
              </button>
              <button type="button" aria-pressed={mode === "read"} onClick={() => setMode("read")}>
                Read
              </button>
            </fieldset>
            <span className="fine">
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : `Edited ${timeAgo(note.updated)}`}
            </span>
            <span className="spacer" />
            <a className="link" href={`#/notes/${note.id}`} title={note.path}>
              Open
              <ArrowUpRight aria-hidden="true" />
            </a>
          </>
        )}
      </div>
      {note ? (
        <div className="reader-note-body">
          {mode === "edit" ? (
            <NoteEditor
              key={note.id}
              value={body}
              onChange={onBody}
              placeholder="Your thoughts as you read… Select a passage and press N to add it here."
            />
          ) : (
            <Markdown text={body} theme={theme} className="note-read" base={note.path} />
          )}
        </div>
      ) : (
        <div className="margin-empty rise">
          <p className="margin-empty-title">Your note for this book</p>
          <p className="fine">
            Write while you read. Passages, explanations and figures you add from the book land here, linked back to
            where they came from. It’s a Markdown file in your vault’s notes/ folder.
          </p>
          <button type="button" className="button primary" onClick={() => ensureNote()}>
            Start “{book.title} — notes”
          </button>
        </div>
      )}
      {bookNotes.some((n) => n.source && n.id !== note?.id) && (
        <details className="reader-note-others">
          <summary className="fine">Other notes from this book</summary>
          <ul className="link-list compact">
            {bookNotes
              .filter((n) => n.id !== note?.id)
              .map((n) => (
                <li key={n.id}>
                  <button type="button" className="link" onClick={() => onChoose(n)}>
                    {n.title}
                  </button>
                  {n.source?.page !== undefined && (
                    <button
                      type="button"
                      className="link fine"
                      onClick={() => onJump({ page: n.source!.page, y: n.source!.y })}
                    >
                      p. {n.source.page}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
