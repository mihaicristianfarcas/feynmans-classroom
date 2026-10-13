/* One note on the notes page: its title, properties and body (edit with a live preview, or read),
 * with what links to it in the sidebar. */
import { ArrowUpRight, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { learn, type NoteDetail } from "../api";
import { go } from "../app/navigation";
import { Markdown } from "../components/Markdown";
import { useIndicator } from "../components/ui";
import { timeAgo } from "../lib/time";
import { NoteEditor } from "./NoteEditor";
import { NoteSidebar } from "./NoteSidebar";
import { useVaultEvents } from "./useVaultEvents";

export function NotePane({ id, theme, onChanged }: { id: string; theme: "light" | "dark"; onChanged: () => void }) {
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"edit" | "read">(() => {
    try {
      return (localStorage.getItem("classroom-note-mode") as "edit" | "read") || "edit";
    } catch {
      return "edit";
    }
  });
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const modes = useIndicator<HTMLFieldSetElement>(mode);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      learn.note(id).then(
        (n) => {
          setNote(n);
          if (!dirty.current) setBody(n.body);
          setTitle((t) => (document.activeElement === titleRef.current ? t : n.title));
        },
        (e) => setError((e as Error).message),
      ),
    [id],
  );
  useEffect(() => {
    load().then(() => {
      if (location.hash.includes("new=1")) {
        titleRef.current?.focus();
        titleRef.current?.select();
        history.replaceState(null, "", `#/notes/${id}`);
      }
    });
  }, [load, id]);
  useVaultEvents((path) => {
    if (note && path === note.path && !dirty.current) load();
    else if (note) load();
  });

  const save = useCallback(
    async (patch: { body?: string; title?: string }) => {
      setSaving("saving");
      try {
        const updated = await learn.updateNote(id, patch);
        dirty.current = false;
        setSaving("saved");
        if (patch.title !== undefined) {
          setTitle(updated.title);
          onChanged();
        }
        load();
      } catch (e) {
        setError((e as Error).message);
        setSaving("idle");
      }
    },
    [id, load, onChanged],
  );
  const onBody = (text: string) => {
    setBody(text);
    dirty.current = true;
    setSaving("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ body: text }), 700);
  };
  // leaving the note with changes still waiting: save them now
  useEffect(
    () => () => {
      if (dirty.current) {
        clearTimeout(timer.current);
        void learn.updateNote(id, { body: bodyRef.current });
      }
    },
    [id],
  );
  const bodyRef = useRef(body);
  bodyRef.current = body;

  if (error) return <div className="note-pane center-note">{error}</div>;
  if (!note) return <div className="note-pane center-note">Opening…</div>;
  const folder = note.path.split("/").slice(1, -1);
  return (
    <div className="note-pane">
      <div className="note-main">
        <header className="note-head">
          {/* the title is an editable field below; the heading names the page for screen readers */}
          <h1 className="visually-hidden">{note.title}</h1>
          <div className="crumbs fine">
            notes{folder.map((f) => ` / ${f}`)}
            {note.type !== "note" && <span className="badge-type">{note.type}</span>}
          </div>
          <input
            ref={titleRef}
            className="note-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== note.title && save({ title })}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setTitle(note.title);
            }}
            aria-label="Title (renames the file and updates links to it)"
            title="The title is the file name: renaming updates every link to this note"
          />
          <div className="row gap note-tools">
            <fieldset className="segmented" ref={modes}>
              <legend className="visually-hidden">Mode</legend>
              {(["edit", "read"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    try {
                      localStorage.setItem("classroom-note-mode", m);
                    } catch {}
                  }}
                >
                  {m === "edit" ? "Edit" : "Read"}
                </button>
              ))}
            </fieldset>
            <span className="fine">
              {saving === "saving"
                ? "Saving…"
                : saving === "saved"
                  ? "Saved"
                  : dirty.current
                    ? "Unsaved"
                    : `Edited ${timeAgo(note.updated)}`}
            </span>
            <span className="spacer" />
            <code className="fine path" title="The file in your vault">
              {note.path}
            </code>
            <button
              type="button"
              className="icon-button danger"
              title="Move to the vault’s trash"
              aria-label="Delete note"
              onClick={async () => {
                if (!confirm(`Move “${note.title}” to the vault's trash?`)) return;
                await learn.deleteNote(note.id);
                onChanged();
                go("#/notes");
              }}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
          <Properties
            note={note}
            onSave={async (patch) => {
              await learn.updateNote(note.id, patch);
              load();
            }}
          />
        </header>
        <div className="note-body">
          {mode === "edit" ? (
            <NoteEditor
              value={body}
              onChange={onBody}
              placeholder="Write… [[ links a note, ![[ embeds one; paste a picture"
              autoFocus={!location.hash.includes("new=1") && !body}
            />
          ) : (
            <Markdown text={body} theme={theme} className="note-read" base={note.path} />
          )}
        </div>
      </div>
      <NoteSidebar note={note} reload={load} />
    </div>
  );
}

function Properties({
  note,
  onSave,
}: {
  note: NoteDetail;
  onSave: (patch: { tags?: string[]; aliases?: string[] }) => Promise<void>;
}) {
  const [tags, setTags] = useState(note.tags.join(", "));
  const [aliases, setAliases] = useState(note.aliases.join(", "));
  useEffect(() => {
    setTags(note.tags.join(", "));
    setAliases(note.aliases.join(", "));
  }, [note.tags, note.aliases]);
  const list = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim().replace(/^#/, ""))
      .filter(Boolean);
  return (
    <div className="properties">
      <label>
        <span>tags</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onBlur={() => tags !== note.tags.join(", ") && onSave({ tags: list(tags) })}
          placeholder="add tags"
        />
      </label>
      <label>
        <span>aliases</span>
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          onBlur={() => aliases !== note.aliases.join(", ") && onSave({ aliases: list(aliases) })}
          placeholder="other names links can use"
        />
      </label>
      {note.source?.bookId && (
        <a
          className="link"
          href={`#/book/${note.source.bookId}${note.source.page !== undefined ? `?at=${(note.source.page + (note.source.y ?? 0)).toFixed(3)}` : ""}`}
        >
          from a book
          <ArrowUpRight aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
