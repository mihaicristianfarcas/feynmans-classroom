/* The reader's Note tab: the note you write in while reading (the book's own note unless you pick
 * another, of the app's or of an added vault). Passages and answers you send from the book land at its
 * end; you write around them. */
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Book, docs, type Loc, type Note, type VaultSummary, vaults } from "../api";
import { Markdown } from "../components/Markdown";
import { useIndicator } from "../components/ui";
import { timeAgo } from "../lib/time";
import { useVaultEvents } from "../lib/useVaultEvents";
import { NoteEditor } from "../notes/NoteEditor";
import { noteRoute } from "../vaults/routes";
import { ReaderVaultNote } from "./ReaderVaultNote";
import type { VaultTarget } from "./session";

export function ReaderNote({
  book,
  note,
  vaultNote,
  onChoose,
  onChooseVault,
  ensureNote,
  bookNotes,
  theme,
  onJump,
  reload,
}: {
  book: Book;
  note: Note | null;
  vaultNote: VaultTarget | null;
  onChoose: (n: Note | null) => void;
  onChooseVault: (v: { vault: string; path: string } | null) => void;
  ensureNote: () => Promise<unknown>;
  bookNotes: Note[];
  theme: "light" | "dark";
  onJump: (loc: Loc) => void;
  reload: () => void;
}) {
  const [recent, setRecent] = useState<Note[]>([]);
  const [vaultList, setVaultList] = useState<VaultSummary[]>([]);
  const [vaultNotes, setVaultNotes] = useState<Awaited<ReturnType<typeof vaults.bookNotes>>>([]);
  const [body, setBody] = useState(note?.body ?? "");
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const modes = useIndicator<HTMLFieldSetElement>(`${mode}-${note?.id ?? vaultNote?.path}`);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const current = useRef(note);
  current.current = note;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloads the recent notes when another note is chosen
  useEffect(() => {
    docs.list("note").then(
      (list) => setRecent(list.slice(0, 20)),
      () => {},
    );
  }, [note?.id]);
  const loadVaultNotes = useCallback(() => {
    vaults.list().then(
      (list) => setVaultList(list.filter((v) => v.status === "ready")),
      () => {},
    );
    vaults.bookNotes(book.id).then(setVaultNotes, () => {});
  }, [book.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a newly chosen vault note may now link to the book
  useEffect(() => {
    loadVaultNotes();
  }, [loadVaultNotes, vaultNote?.path]);
  const forgetVaultNote = useCallback(() => onChooseVault(null), [onChooseVault]);
  const refresh = useCallback(async () => {
    const n = current.current;
    if (!n) return;
    try {
      const fresh = await docs.get<Note>(n.id);
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
      const saved = await docs.update<Note>(n.id, { body: text });
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
  const vaultKey = (v: { vault: string; path: string }) => `vault:${v.vault}:${v.path}`;
  const inVault = (id: string) => {
    const list = vaultNotes.filter((n) => n.vault === id);
    if (vaultNote?.vault === id && !list.some((n) => n.path === vaultNote.path))
      list.unshift({ ...vaultNote, vaultName: "" });
    return list;
  };
  /** A new note in vault `id`, its `source` property linking it to the book. */
  const newVaultNote = async (id: string) => {
    const title = prompt("Title of the new note:", `${book.title} — notes`);
    if (!title?.trim()) return;
    const made = await vaults.create(id, { title: title.trim().replace(/[\\/:]/g, "-") });
    const link = book.title.replace(/[[\]|#^]/g, "");
    await vaults.save(id, made.path, `---\nsource: "[[${link}]]"\n---\n\n`);
    onChooseVault({ vault: id, path: made.path });
  };
  const selected = vaultNote ? vaultKey(vaultNote) : note?.id || "";
  const chosen = vaultNote || note;
  return (
    <div className="reader-note">
      <div className="reader-note-head">
        <select
          value={selected}
          onChange={async (e) => {
            const v = e.target.value;
            const vaultNew = v.match(/^__new:(.+)$/);
            const vaultPick = v.match(/^vault:([^:]+):(.+)$/);
            if (vaultNew) await newVaultNote(vaultNew[1]);
            else if (vaultPick) onChooseVault({ vault: vaultPick[1], path: vaultPick[2] });
            else if (v === "__new") {
              const title = prompt("Title of the new note:", `${book.title} — `);
              if (!title?.trim()) return;
              const created = await docs.create({ title: title.trim(), body: "", source: { bookId: book.id } });
              onChoose(created);
              reload();
            } else if (v) onChoose(await docs.get<Note>(v));
          }}
          aria-label="Which note to write in"
        >
          {!chosen && <option value="">Choose a note…</option>}
          <optgroup label="Classroom">
            {choices.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
            <option value="__new">New note…</option>
          </optgroup>
          {vaultList.map((v) => (
            <optgroup key={v.id} label={v.name}>
              {inVault(v.id).map((n) => (
                <option key={n.path} value={vaultKey(n)}>
                  {n.title}
                </option>
              ))}
              <option value={`__new:${v.id}`}>New note in {v.name}…</option>
            </optgroup>
          ))}
        </select>
        {chosen && (
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
              {state === "saving"
                ? "Saving…"
                : state === "saved"
                  ? "Saved"
                  : note
                    ? `Edited ${timeAgo(note.updated)}`
                    : (vaultList.find((v) => v.id === vaultNote?.vault)?.name ?? "")}
            </span>
            <span className="spacer" />
            <a
              className="link"
              href={vaultNote ? noteRoute(vaultNote.vault, vaultNote.path) : `#/notes/${note?.id}`}
              title={chosen.path}
            >
              Open
              <ArrowUpRight aria-hidden="true" />
            </a>
          </>
        )}
      </div>
      {vaultNote ? (
        <div className="reader-note-body">
          <ReaderVaultNote
            vault={vaultNote.vault}
            path={vaultNote.path}
            mode={mode}
            theme={theme}
            onState={setState}
            onGone={forgetVaultNote}
          />
        </div>
      ) : note ? (
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
      {(bookNotes.some((n) => n.source && n.id !== note?.id) ||
        vaultNotes.some((n) => n.vault !== vaultNote?.vault || n.path !== vaultNote?.path)) && (
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
            {vaultNotes
              .filter((n) => n.vault !== vaultNote?.vault || n.path !== vaultNote?.path)
              .map((n) => (
                <li key={vaultKey(n)}>
                  <button type="button" className="link" onClick={() => onChooseVault(n)}>
                    {n.title}
                  </button>{" "}
                  <span className="fine">in {n.vaultName}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
