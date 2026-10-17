/* A note of a vault, opened on the notes page: its title (renaming the file, links to it
 * follow), the whole file to edit (properties included, as Obsidian's source mode shows it) or to read
 * (properties as a table, links and embeds working, task boxes ticking), and its links in the sidebar.
 * Edits are written to the file itself; changes made to it elsewhere (in Obsidian, say) show at once,
 * and if they land while you're typing, it asks which text to keep. Any other file (a picture, a PDF,
 * a recording) is shown, with what links to it. A note's versions come from the vault's history. */
import { History, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VaultConflict, type VaultNote, vaultFileUrl, vaults } from "../api";
import { go } from "../app/navigation";
import { Markdown, MarkdownWorldContext } from "../components/Markdown";
import { PanelEdge, PanelToggle } from "../components/Panel";
import { NoteContext } from "../components/QuizBlock";
import { useIndicator } from "../components/ui";
import { announce } from "../lib/a11y";
import { timeAgo } from "../lib/time";
import type { Panel } from "../lib/usePanel";
import { type LinkSource, NoteEditor } from "../notes/NoteEditor";
import { Versions } from "../notes/Versions";
import { noteRoute, openVaultLink } from "./routes";
import { bodyOf, toggleTaskAt } from "./text";
import { useVaultChanges } from "./useVaultChanges";
import { VaultSidebar } from "./VaultSidebar";
import { trashItem } from "./VaultTree";
import { useVaultWorld, VaultEmbed } from "./world";

/** Brings the heading or "^block" a link names into view (in the editor or the text read). */
function scrollToSub(root: HTMLElement | null, sub: string) {
  if (!root) return;
  const fold = (s: string) =>
    s
      .toLowerCase()
      .replace(/^#+\s*/, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const block = sub.startsWith("^") ? sub.toLowerCase() : null;
  const want = fold(sub.split("#").pop() || "");
  // a heading read (h1–h6), or the editor's line for it (its # marks may be hidden)
  const found = [...root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, li, .cm-line")].find((el) =>
    block
      ? el.textContent?.toLowerCase().includes(block)
      : (/^H\d$/.test(el.tagName) || el.classList.contains("cm-line")) && fold(el.textContent || "") === want,
  );
  found?.scrollIntoView({ block: "start" });
}

export function VaultPane({
  id,
  vaultName,
  path,
  sub,
  theme,
  list,
  links,
}: {
  id: string;
  vaultName: string;
  path: string;
  sub?: string;
  theme: "light" | "dark";
  list: Panel;
  links: Panel;
}) {
  const [note, setNote] = useState<VaultNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"edit" | "read">(() => {
    try {
      return (localStorage.getItem("notes-mode") as "edit" | "read") || "read";
    } catch {
      return "read";
    }
  });
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [versions, setVersions] = useState(false);
  /** The text on disk when it changed there while there were unsaved edits here. */
  const [clash, setClash] = useState<string | null>(null);
  const modes = useIndicator<HTMLFieldSetElement>(mode);
  /** The file's text as last read or written: saves are refused if the file no longer has it. */
  const base = useRef<string | undefined>(undefined);
  const dirty = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      vaults.note(id, path).then(
        (n) => {
          setGone(false);
          setNote(n);
          setTitle((t) => (document.activeElement === titleRef.current ? t : n.name));
          if (n.kind !== "note") return;
          const disk = n.text ?? "";
          if (!dirty.current) {
            setText(disk);
            base.current = disk;
          } else if (disk !== base.current && disk !== textRef.current) setClash(disk);
        },
        (e) => {
          if (/no such note/i.test((e as Error).message) && base.current !== undefined) setGone(true);
          else setError((e as Error).message);
        },
      ),
    [id, path],
  );
  useEffect(() => {
    load().then(() => {
      if (!location.hash.includes("new=1")) return;
      titleRef.current?.focus();
      titleRef.current?.select();
      history.replaceState(null, "", noteRoute(id, path));
    });
  }, [load, id, path]);
  // anything in the vault changing may change this note's links (or the note itself, in Obsidian)
  useVaultChanges(id, () => void load());

  const save = useCallback(
    async (next: string, force = false) => {
      clearTimeout(timer.current);
      setSaving("saving");
      try {
        await vaults.save(id, path, next, force ? undefined : base.current);
        base.current = next;
        if (textRef.current === next) dirty.current = false;
        setSaving("saved");
      } catch (e) {
        setSaving("idle");
        if (e instanceof VaultConflict) setClash(e.text);
        else setError((e as Error).message);
      }
    },
    [id, path],
  );
  const clashRef = useRef(clash);
  clashRef.current = clash;
  const onText = (next: string) => {
    setText(next);
    dirty.current = true;
    setSaving("idle");
    clearTimeout(timer.current);
    if (!clashRef.current) timer.current = setTimeout(() => save(next), 700);
  };
  // leaving the note with changes still waiting: save them now (unless the file changed meanwhile)
  useEffect(
    () => () => {
      if (!dirty.current || clashRef.current) return;
      clearTimeout(timer.current);
      void vaults.save(id, path, textRef.current, base.current).catch(() => {});
    },
    [id, path],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: switching between editing and reading draws the text anew, so it scrolls again
  useEffect(() => {
    if (sub && note) requestAnimationFrame(() => scrollToSub(bodyRef.current, sub));
  }, [sub, note, mode]);

  const toggleTask = useCallback(
    (line: number) => {
      const next = toggleTaskAt(textRef.current, line);
      if (next === null) return;
      setText(next);
      dirty.current = true;
      void save(next);
    },
    [save],
  );
  const world = useVaultWorld(id, path, note?.outgoing, toggleTask);
  // a quiz in the note adds its attempts at the note's end
  const quizNote = useMemo(() => ({ append: (md: string) => vaults.append(id, path, md) }), [id, path]);
  const source = useMemo<LinkSource>(
    () => ({
      targets: () => vaults.targets(id),
      follow: (target, s) => void openVaultLink(id, target, { sub: s, from: path }),
      attach: async (file, data) => {
        const named = file.name && !/^image\.\w+$/.test(file.name) ? file.name : undefined;
        const saved = await vaults.attach(id, data, named, path);
        announce(`Saved ${saved.path}`);
        return saved.embed;
      },
    }),
    [id, path],
  );

  const rename = async () => {
    const name = title.trim();
    if (!name || !note || name === note.name) return;
    const dir = path.split("/").slice(0, -1).join("/");
    const ext = note.kind === "note" ? ".md" : `.${path.split(".").pop()}`;
    try {
      if (dirty.current) await save(textRef.current);
      const moved = await vaults.move(id, path, `${dir ? `${dir}/` : ""}${name}${ext}`);
      announce(`Renamed to ${name}`);
      history.replaceState(null, "", noteRoute(id, moved.path));
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch (e) {
      alert((e as Error).message);
      setTitle(note.name);
    }
  };

  if (error) return <div className="note-pane center-note">{error}</div>;
  if (!note) return <div className="note-pane center-note">Opening…</div>;
  const folder = path.split("/").slice(0, -1);
  const body = bodyOf(text);
  const properties = Object.entries(note.properties || {});

  return (
    <div className="note-pane">
      <div className="note-main">
        <header className="note-head">
          <h1 className="visually-hidden">{note.name}</h1>
          <div className="note-bar">
            <PanelToggle panel={list} side="left" label="file list" className="icon-button small" />
            <div className="crumbs fine">
              {vaultName}
              {folder.map((f) => ` / ${f}`)}
              {note.kind !== "note" && <span className="badge-type">{note.kind}</span>}
            </div>
            <span className="spacer" />
            <PanelToggle panel={links} side="right" label="links" className="icon-button small" />
          </div>
          <input
            ref={titleRef}
            className="note-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setTitle(note.name);
            }}
            aria-label="Name (renames the file and updates links to it)"
            title="The name is the file's name: renaming updates every link to it"
          />
          {gone && (
            <div className="notice note-clash" role="alert">
              <span>This file was moved or deleted outside the app.</span>
              {note.kind === "note" && (
                <button type="button" className="button small" onClick={() => save(textRef.current, true)}>
                  Save my text again
                </button>
              )}
            </div>
          )}
          {clash !== null && (
            <div className="notice note-clash" role="alert">
              <span>This note was changed outside the app (in Obsidian, say) while you were typing.</span>
              <button
                type="button"
                className="button small"
                onClick={() => {
                  dirty.current = false;
                  base.current = clash;
                  setText(clash);
                  setClash(null);
                }}
              >
                Show the new text
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => {
                  setClash(null);
                  void save(textRef.current, true);
                }}
              >
                Keep mine
              </button>
            </div>
          )}
          <div className="row gap note-tools">
            {note.kind === "note" && (
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
                        localStorage.setItem("notes-mode", m);
                      } catch {}
                    }}
                  >
                    {m === "edit" ? "Edit" : "Read"}
                  </button>
                ))}
              </fieldset>
            )}
            <span className="fine" aria-live="polite">
              {saving === "saving"
                ? "Saving…"
                : saving === "saved"
                  ? "Saved to the file"
                  : dirty.current
                    ? "Unsaved"
                    : note.mtime
                      ? `Edited ${timeAgo(note.mtime)}`
                      : ""}
            </span>
            <span className="spacer" />
            {note.kind === "note" && (
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
            )}
            <button
              type="button"
              className="icon-button danger"
              title="Move to the vault’s .trash folder"
              aria-label="Delete"
              onClick={async () => {
                if (await trashItem(id, path)) go(`#/vaults/${id}`);
              }}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
          {note.kind === "note" && mode === "read" && properties.length > 0 && (
            <dl className="vault-properties" aria-label="Properties">
              {properties.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    <MarkdownWorldContext.Provider value={world}>
                      <Markdown
                        text={/^tags?$/.test(key) ? tagsText(value) : propertyText(value)}
                        theme={theme}
                        className="vault-property"
                      />
                    </MarkdownWorldContext.Provider>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </header>
        <div className="note-body" ref={bodyRef}>
          {note.kind !== "note" ? (
            <div className="note-read vault-file-view">
              <VaultEmbed vault={id} from={path} target={path} depth={0} theme={theme} />
              <p>
                <a className="link" href={vaultFileUrl(id, path)} download={path.split("/").pop()}>
                  Download
                </a>
              </p>
            </div>
          ) : mode === "edit" ? (
            <NoteEditor
              value={text}
              onChange={onText}
              links={source}
              placeholder="Write… [[ links a note, ![[ embeds one; paste or drop a picture, PDF, sound or video"
              autoFocus={!location.hash.includes("new=1") && !text}
            />
          ) : (
            <MarkdownWorldContext.Provider value={world}>
              <NoteContext.Provider value={quizNote}>
                <Markdown text={body} theme={theme} className="note-read" base={path} />
              </NoteContext.Provider>
            </MarkdownWorldContext.Provider>
          )}
        </div>
      </div>
      <PanelEdge panel={links} side="right" label="links" />
      {links.open && <VaultSidebar id={id} note={note} panel={links} reload={load} />}
      {versions && (
        <Versions
          title={note.name}
          base={path}
          history={{
            list: () => vaults.versions(id, path),
            open: (v) => vaults.version(id, path, v.commit),
            restore: (v) => vaults.restore(id, path, v.commit),
          }}
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

/** A property's value as a line of Markdown: lists joined with commas, links and tags kept as written. */
function propertyText(value: unknown): string {
  if (Array.isArray(value)) return value.map(propertyText).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const tagsText = (value: unknown) =>
  (Array.isArray(value) ? value : String(value ?? "").split(/[,\s]+/))
    .map((t) => String(t).trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(" ");
