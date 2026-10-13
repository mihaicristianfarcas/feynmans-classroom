/* One note on the notes page: its title, properties (tags, aliases, what it's about) and body (edit
 * with a live preview, or read: quizzes play there), its saved versions, and what links to it in the
 * sidebar (resized from its edge; the buttons above the note hide and show it and the note list). It
 * follows changes made elsewhere (the agent, another editor) as they land, and if they land while you're
 * typing in it, asks which text to keep. */
import { ArrowUpRight, History, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { learn, type NoteDetail } from "../api";
import { go } from "../app/navigation";
import { Markdown } from "../components/Markdown";
import { PanelEdge, PanelToggle } from "../components/Panel";
import { NoteContext } from "../components/QuizBlock";
import { useIndicator } from "../components/ui";
import { timeAgo } from "../lib/time";
import type { Panel } from "../lib/usePanel";
import { useVaultEvents } from "../lib/useVaultEvents";
import { NoteEditor } from "./NoteEditor";
import { NoteSidebar } from "./NoteSidebar";
import { Versions } from "./Versions";

export function NotePane({
  id,
  theme,
  onChanged,
  list,
  links,
}: {
  id: string;
  theme: "light" | "dark";
  onChanged: () => void;
  /** The note list on the left and the links on the right: their buttons sit above the note. */
  list: Panel;
  links: Panel;
}) {
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
  const [versions, setVersions] = useState(false);
  /** The note changed on disk while there were unsaved edits here. */
  const [clash, setClash] = useState(false);
  /** Whether the mode was picked for this note yet (a note with a quiz opens to be read: that's where it plays). */
  const modeSet = useRef(false);
  const modes = useIndicator<HTMLFieldSetElement>(mode);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      learn.note(id).then(
        (n) => {
          setNote(n);
          if (!modeSet.current) {
            modeSet.current = true;
            if (/^(`{3,}|~{3,})quiz\b/m.test(n.body)) setMode("read");
          }
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
    if (!note) return;
    // changed elsewhere while you were typing here: don't overwrite either text without asking
    if (path === note.path && dirty.current) setClash(true);
    load();
  });

  const save = useCallback(
    async (patch: { body?: string; title?: string }) => {
      if (clashRef.current && patch.body !== undefined) return;
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
  const clashRef = useRef(clash);
  clashRef.current = clash;
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
          <div className="note-bar">
            <PanelToggle panel={list} side="left" label="note list" className="icon-button small" />
            <div className="crumbs fine">
              notes{folder.map((f) => ` / ${f}`)}
              {note.type !== "note" && <span className="badge-type">{note.type}</span>}
            </div>
            <span className="spacer" />
            <PanelToggle panel={links} side="right" label="links" className="icon-button small" />
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
          {clash && (
            <div className="notice note-clash" role="alert">
              <span>This note was changed elsewhere (by the agent, or in another editor) while you were typing.</span>
              <button
                type="button"
                className="button small"
                onClick={() => {
                  dirty.current = false;
                  setClash(false);
                  load();
                }}
              >
                Show the new text
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => {
                  setClash(false);
                  clashRef.current = false;
                  save({ body: bodyRef.current });
                }}
              >
                Keep mine
              </button>
            </div>
          )}
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
            <button
              type="button"
              className="icon-button"
              title="Versions: read or bring back an earlier one"
              aria-label="Versions"
              aria-haspopup="dialog"
              onClick={() => setVersions(true)}
            >
              <History aria-hidden="true" />
            </button>
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
            <NoteContext.Provider value={{ id: note.id }}>
              <Markdown text={body} theme={theme} className="note-read" base={note.path} />
            </NoteContext.Provider>
          )}
        </div>
      </div>
      <PanelEdge panel={links} side="right" label="links" />
      {links.open && <NoteSidebar note={note} reload={load} panel={links} />}
      {versions && (
        <Versions
          note={note}
          theme={theme}
          onClose={() => setVersions(false)}
          onRestored={() => {
            dirty.current = false;
            load();
          }}
        />
      )}
    </div>
  );
}

/** A note's `about` links as the field shows them: names, separated by commas. */
const aboutText = (list: string[]) => list.map((a) => a.replace(/^\[\[|\]\]$/g, "")).join(", ");

function Properties({
  note,
  onSave,
}: {
  note: NoteDetail;
  onSave: (patch: { tags?: string[]; aliases?: string[]; about?: string[] }) => Promise<void>;
}) {
  const [tags, setTags] = useState(note.tags.join(", "));
  const [aliases, setAliases] = useState(note.aliases.join(", "));
  const [about, setAbout] = useState(aboutText(note.about || []));
  useEffect(() => {
    setTags(note.tags.join(", "));
    setAliases(note.aliases.join(", "));
    setAbout(aboutText(note.about || []));
  }, [note.tags, note.aliases, note.about]);
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
      <label className="wide">
        <span>about</span>
        <input
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          onBlur={() =>
            about !== aboutText(note.about || []) &&
            onSave({
              about: about
                .split(",")
                .map((x) => x.trim().replace(/^\[\[|\]\]$/g, ""))
                .filter(Boolean)
                .map((x) => `[[${x}]]`),
            })
          }
          placeholder="books, concepts or notes it's about"
          aria-describedby="about-hint"
        />
        <span id="about-hint" className="visually-hidden">
          Names separated by commas; their pages list this note
        </span>
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
