/* A vault note in the reader's Note tab: its text to write in (saved as you type, refusing to overwrite
 * a change made in Obsidian meanwhile) or to read, with the vault's links and embeds working. Passages
 * sent from the book land at its end and show up here as the file changes. */
import { useCallback, useEffect, useRef, useState } from "react";
import { VaultConflict, type VaultNote, vaults } from "../api";
import { Markdown, MarkdownWorldContext } from "../components/Markdown";
import { NoteEditor } from "../notes/NoteEditor";
import { useVaultChanges } from "../vaults/useVaultChanges";
import { useVaultWorld } from "../vaults/world";

export function ReaderVaultNote({
  vault,
  path,
  mode,
  theme,
  onState,
  onGone,
}: {
  vault: string;
  path: string;
  mode: "edit" | "read";
  theme: "light" | "dark";
  onState: (state: "idle" | "saving" | "saved") => void;
  onGone: () => void;
}) {
  const [note, setNote] = useState<VaultNote | null>(null);
  const [text, setText] = useState("");
  const [clash, setClash] = useState<string | null>(null);
  const base = useRef<string | undefined>(undefined);
  const dirty = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(
    () =>
      vaults.note(vault, path).then(
        (n) => {
          setNote(n);
          const disk = n.text ?? "";
          if (!dirty.current) {
            setText(disk);
            base.current = disk;
          } else if (disk !== base.current && disk !== textRef.current) setClash(disk);
        },
        () => onGone(),
      ),
    [vault, path, onGone],
  );
  useEffect(() => {
    dirty.current = false;
    base.current = undefined;
    setClash(null);
    void load();
  }, [load]);
  useVaultChanges(vault, (changes) => {
    if (changes.some((c) => c.path === path)) void load();
  });

  const save = useCallback(
    async (next: string, force = false) => {
      onState("saving");
      try {
        await vaults.save(vault, path, next, force ? undefined : base.current);
        base.current = next;
        if (textRef.current === next) dirty.current = false;
        setClash(null);
        onState("saved");
      } catch (e) {
        onState("idle");
        if (e instanceof VaultConflict) setClash(e.text);
      }
    },
    [vault, path, onState],
  );
  const onText = (next: string) => {
    setText(next);
    // the editor echoing text loaded from the file
    if (next === base.current && !dirty.current) return;
    dirty.current = true;
    onState("idle");
    clearTimeout(timer.current);
    if (!clash) timer.current = setTimeout(() => save(next), 700);
  };
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current) void vaults.save(vault, path, textRef.current, base.current).catch(() => {});
    },
    [vault, path],
  );

  const world = useVaultWorld(vault, path, note?.outgoing);
  const body = note?.bodyStart !== undefined ? text.slice(note.bodyStart) : text;
  return (
    <>
      {clash !== null && (
        <div className="notice note-clash" role="alert">
          <span>This note was changed outside the app (in Obsidian, say) while you were typing.</span>
          <button
            type="button"
            className="button small"
            onClick={() => {
              dirty.current = false;
              setText(clash);
              base.current = clash;
              setClash(null);
            }}
          >
            Show the new text
          </button>
          <button type="button" className="button small" onClick={() => save(textRef.current, true)}>
            Keep mine
          </button>
        </div>
      )}
      {mode === "edit" ? (
        <NoteEditor
          key={`${vault}:${path}`}
          value={text}
          onChange={onText}
          placeholder="Your thoughts as you read… Select a passage and press N to add it here."
        />
      ) : (
        <MarkdownWorldContext.Provider value={world}>
          <Markdown text={body} theme={theme} className="note-read" base={path} />
        </MarkdownWorldContext.Provider>
      )}
    </>
  );
}
