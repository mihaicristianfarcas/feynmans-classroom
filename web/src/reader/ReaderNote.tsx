/* The reader's Note tab: the vault note you write in while reading (the book's own note in the active
 * vault unless you pick another, of any vault). Passages and answers you send from the book land at its
 * end; you write around them. */
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { type Book, type VaultSummary, vaults } from "../api";
import { useIndicator } from "../components/ui";
import { useActiveVault } from "../vaults/active";
import { noteRoute } from "../vaults/routes";
import { ReaderVaultNote } from "./ReaderVaultNote";
import type { VaultTarget } from "./session";

export function ReaderNote({
  book,
  vaultNote,
  onChooseVault,
  ensureNote,
  theme,
}: {
  book: Book;
  vaultNote: VaultTarget | null;
  onChooseVault: (v: { vault: string; path: string } | null) => void;
  ensureNote: () => Promise<unknown>;
  theme: "light" | "dark";
}) {
  const { active } = useActiveVault();
  const [vaultList, setVaultList] = useState<VaultSummary[]>([]);
  const [vaultNotes, setVaultNotes] = useState<Awaited<ReturnType<typeof vaults.bookNotes>>>([]);
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const modes = useIndicator<HTMLFieldSetElement>(`${mode}-${vaultNote?.path}`);

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
    const made = await vaults.create(id, { title: title.trim().replace(/[\\/:]/g, "-"), body: "", bookId: book.id });
    onChooseVault({ vault: id, path: made.path });
  };
  // the active vault first
  const ordered = [...vaultList].sort((a, b) => Number(b.id === active) - Number(a.id === active));
  return (
    <div className="reader-note">
      <div className="reader-note-head">
        <select
          value={vaultNote ? vaultKey(vaultNote) : ""}
          onChange={async (e) => {
            const v = e.target.value;
            const vaultNew = v.match(/^__new:(.+)$/);
            const vaultPick = v.match(/^vault:([^:]+):(.+)$/);
            if (vaultNew) await newVaultNote(vaultNew[1]);
            else if (vaultPick) onChooseVault({ vault: vaultPick[1], path: vaultPick[2] });
          }}
          aria-label="Which note to write in"
        >
          {!vaultNote && <option value="">Choose a note…</option>}
          {ordered.map((v) => (
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
        {vaultNote && (
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
                  : (vaultList.find((v) => v.id === vaultNote.vault)?.name ?? "")}
            </span>
            <span className="spacer" />
            <a className="link" href={noteRoute(vaultNote.vault, vaultNote.path)} title={vaultNote.path}>
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
      ) : (
        <div className="margin-empty rise">
          <p className="margin-empty-title">Your note for this book</p>
          <p className="fine">
            Write while you read. Passages, explanations and figures you add from the book land here, linked back to
            where they came from. It’s a Markdown file in the {vaultList.find((v) => v.id === active)?.name ?? "active"}{" "}
            vault.
          </p>
          <button type="button" className="button primary" onClick={() => ensureNote()}>
            Start “{book.title} — notes”
          </button>
        </div>
      )}
      {vaultNotes.some((n) => n.vault !== vaultNote?.vault || n.path !== vaultNote?.path) && (
        <details className="reader-note-others">
          <summary className="fine">Other notes from this book</summary>
          <ul className="link-list compact">
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
