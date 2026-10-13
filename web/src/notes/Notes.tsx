/* Notes, like Obsidian: a file tree of the vault's notes/ folder, the note as Markdown (edit with a
 * live preview, or read), and beside it what links here, what it links to, where it's mentioned
 * without a link, and the connections the agent suggests (accept, reject, or remove later). */
import { ArrowUpRight, ChevronRight, FolderPlus, SquarePen, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { learn, type NoteDetail, type SuggestedLink } from "../api";
import { go, openLink } from "../app/navigation";
import { Spinner } from "../components/feedback";
import { Markdown } from "../components/Markdown";
import { useIndicator } from "../components/ui";
import { timeAgo } from "../lib/time";
import { useLoad } from "../lib/useLoad";
import { NoteEditor } from "./NoteEditor";

type Tree = Awaited<ReturnType<typeof learn.tree>>;

export function Notes({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const route = hash.split("?")[0];
  const id = route.startsWith("#/notes/") ? decodeURIComponent(route.slice("#/notes/".length)) || null : null;
  const { data: tree, reload } = useLoad(() => learn.tree());
  useEffect(() => {
    // remember the last note, and open it when coming back to Notes
    try {
      if (id) localStorage.setItem("classroom-last-note", id);
      else if (route === "#/notes" || route === "#/notes/") {
        const last = localStorage.getItem("classroom-last-note");
        if (last) go(`#/notes/${last}`);
      }
    } catch {}
  }, [id, route]);
  useVaultEvents(reload);
  return (
    <div className="notes-page">
      <FileTree tree={tree} current={id} reload={reload} />
      {id ? <NotePane key={id} id={id} theme={theme} onChanged={reload} /> : <EmptyNotes tree={tree} />}
    </div>
  );
}

/** Reloads when files in the vault change outside this page (an agent, Obsidian, another tab). */
export function useVaultEvents(onChange: (path: string) => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const source = new EventSource("/api/events");
    let timer = 0 as unknown as ReturnType<typeof setTimeout>;
    source.addEventListener("vault", (e) => {
      const { path } = JSON.parse((e as MessageEvent).data) as { path: string };
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(path), 250);
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, []);
}

function EmptyNotes({ tree }: { tree: Tree | null }) {
  return (
    <div className="note-pane empty-pane">
      <div className="empty rise">
        <h1 className="page-title">Notes</h1>
        <p className="lede small">
          Write what you think as you learn. Link ideas with <code>[[double brackets]]</code>, embed passages, figures
          and pictures with <code>![[…]]</code>. Every note is a Markdown file in your vault, named by its title, so
          Obsidian and AI agents can work with it too.
        </p>
        <button type="button" className="button primary" onClick={() => newNote("")}>
          <SquarePen aria-hidden="true" />
          New note
        </button>
        {tree && tree.notes.length > 0 && <p className="fine">Or pick one on the left.</p>}
      </div>
    </div>
  );
}

async function newNote(folder: string, title = "Untitled") {
  const note = await learn.createNote({ title, folder, body: "" });
  go(`#/notes/${note.id}?new=1`);
}

/* ---------------- the file tree ---------------- */

interface Folder {
  name: string;
  path: string;
  folders: Folder[];
  notes: Tree["notes"];
}

function buildTree(tree: Tree): Folder {
  const root: Folder = { name: "", path: "", folders: [], notes: [] };
  const folderAt = (path: string): Folder => {
    if (!path) return root;
    let node = root;
    let acc = "";
    for (const part of path.split("/")) {
      acc = acc ? `${acc}/${part}` : part;
      let next = node.folders.find((f) => f.name === part);
      if (!next) {
        next = { name: part, path: acc, folders: [], notes: [] };
        node.folders.push(next);
      }
      node = next;
    }
    return node;
  };
  for (const f of tree.folders) folderAt(f);
  for (const n of tree.notes) folderAt(n.path.split("/").slice(1, -1).join("/")).notes.push(n);
  const sort = (f: Folder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name));
    f.notes.sort((a, b) => a.title.localeCompare(b.title));
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

function FileTree({ tree, current, reload }: { tree: Tree | null; current: string | null; reload: () => void }) {
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("classroom-tree-closed") || "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const toggle = (path: string) =>
    setClosed((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      try {
        localStorage.setItem("classroom-tree-closed", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  const root = useMemo(() => (tree ? buildTree(tree) : null), [tree]);
  const currentFolder =
    tree?.notes
      .find((n) => n.id === current)
      ?.path.split("/")
      .slice(1, -1)
      .join("/") || "";
  const matches = filter.trim()
    ? (tree?.notes || []).filter((n) => n.path.toLowerCase().includes(filter.trim().toLowerCase()))
    : null;
  const renderFolder = (f: Folder, depth: number): React.ReactNode => (
    <>
      {f.folders.map((sub) => (
        <li key={`d:${sub.path}`}>
          <button
            type="button"
            className="tree-row folder"
            style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => toggle(sub.path)}
            aria-expanded={!closed.has(sub.path)}
          >
            <ChevronRight className="tree-caret" aria-hidden="true" />
            {sub.name}
          </button>
          {!closed.has(sub.path) && <ul className="tree">{renderFolder(sub, depth + 1)}</ul>}
        </li>
      ))}
      {f.notes.map((n) => (
        <li key={n.id}>
          <a
            className="tree-row"
            href={`#/notes/${n.id}`}
            aria-current={n.id === current ? "page" : undefined}
            style={{ paddingLeft: 26 + depth * 14 }}
            title={n.path}
          >
            {n.title}
          </a>
        </li>
      ))}
    </>
  );
  return (
    <aside className="file-tree" aria-label="Notes">
      <div className="tree-head">
        <input
          className="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a note…"
          aria-label="Find a note"
        />
        <button
          type="button"
          className="icon-button"
          title="New note"
          aria-label="New note"
          onClick={() => newNote(currentFolder)}
        >
          <SquarePen aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          title="New folder"
          aria-label="New folder"
          onClick={async () => {
            const name = prompt("New folder (inside notes/):", currentFolder ? `${currentFolder}/` : "");
            if (name?.trim()) {
              await newNote(name.trim().replace(/\/+$/, ""));
              reload();
            }
          }}
        >
          <FolderPlus aria-hidden="true" />
        </button>
      </div>
      {!root ? (
        <Spinner label="Loading" />
      ) : matches ? (
        <ul className="tree">
          {matches.map((n) => (
            <li key={n.id}>
              <a className="tree-row" href={`#/notes/${n.id}`} aria-current={n.id === current ? "page" : undefined}>
                <span className="tree-title">{n.title}</span>{" "}
                <span className="tree-folder">{n.path.split("/").slice(1, -1).join("/")}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="tree">{renderFolder(root, 0)}</ul>
      )}
      {tree && <p className="fine tree-foot">{tree.notes.length} notes · files in your vault’s notes/ folder</p>}
    </aside>
  );
}

/* ---------------- one note ---------------- */

function NotePane({ id, theme, onChanged }: { id: string; theme: "light" | "dark"; onChanged: () => void }) {
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

/* ---------------- links, mentions, connections ---------------- */

function NoteSidebar({ note, reload }: { note: NoteDetail; reload: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggested = note.connections.filter((c) => c.status === "suggested");
  const accepted = note.connections.filter((c) => c.status === "accepted");
  const decide = async (c: SuggestedLink, d: "accept" | "reject" | "remove") => {
    await learn.decideConnection(c.id, d);
    reload();
  };
  return (
    <aside className="note-side" aria-label="Links">
      <section>
        <h2 className="side-title">
          Linked here <span className="count">{note.backlinks.length}</span>
        </h2>
        {note.backlinks.length === 0 ? (
          <p className="fine">Nothing links to this note yet.</p>
        ) : (
          <ul className="link-list">
            {note.backlinks.map((b, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
              >
                <a
                  href={
                    b.from.startsWith("note:")
                      ? `#/notes/${b.from.slice(5)}`
                      : b.from.startsWith("concept:")
                        ? `#/brain/concept/${b.from.slice(8)}`
                        : `#/open?target=${encodeURIComponent(b.path.replace(/\.md$/, ""))}`
                  }
                >
                  {b.title}
                </a>
                {b.kind === "ai" && (
                  <span className="ai-badge" title="A connection you accepted">
                    AI
                  </span>
                )}
                {b.context && <div className="context">{b.context}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {note.mentions.length > 0 && (
        <section>
          <h2 className="side-title">
            Mentioned, not linked <span className="count">{note.mentions.length}</span>
          </h2>
          <ul className="link-list">
            {note.mentions.map((m, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
              >
                <span>{m.title}</span>{" "}
                <button
                  type="button"
                  className="link"
                  title={`Turn the mention into [[${note.title}]]`}
                  onClick={async () => {
                    await fetch(`/api/notes/${note.id}/link-mention`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ path: m.path }),
                    });
                    reload();
                  }}
                >
                  Link
                </button>
                <div className="context">{m.context}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="side-title">
          Links out <span className="count">{note.outgoing.length}</span>
        </h2>
        <ul className="link-list compact">
          {note.outgoing.map((o, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
              key={i}
              data-missing={!o.to || undefined}
            >
              <a
                href={`#/open?target=${encodeURIComponent(o.target)}`}
                onClick={(e) => {
                  e.preventDefault();
                  openLink(o.target);
                }}
              >
                {o.title}
              </a>
              {!o.to && <span className="fine"> (new)</span>}
              {o.kind === "ai" && <span className="ai-badge">AI</span>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="side-title">Connections</h2>
        <p className="fine">
          An agent reads your vault and suggests notes and concepts this one should link to. You decide.
        </p>
        {suggested.map((c) => (
          <div key={c.id} className="suggestion">
            <div>
              <b>[[{c.to}]]</b>
            </div>
            <div className="context">{c.why}</div>
            <div className="row gap">
              <button type="button" className="button" onClick={() => decide(c, "accept")}>
                Link it
              </button>
              <button type="button" className="link" onClick={() => decide(c, "reject")}>
                Not related
              </button>
            </div>
          </div>
        ))}
        {accepted.length > 0 && (
          <ul className="link-list compact">
            {accepted.map((c) => (
              <li key={c.id}>
                <a
                  href={`#/open?target=${encodeURIComponent(c.to)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    openLink(c.to);
                  }}
                >
                  {c.to}
                </a>
                <span className="ai-badge" title={c.why}>
                  AI
                </span>
                <button
                  type="button"
                  className="link danger"
                  title="Remove this link"
                  aria-label="Remove this link"
                  onClick={() => decide(c, "remove")}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="button"
          disabled={!!busy}
          onClick={async () => {
            setBusy(Date.now());
            setError(null);
            try {
              await learn.suggestConnections(note.path);
              reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy ? "Reading your vault…" : "Suggest connections"}
        </button>
        {busy && <Spinner label="The agent is reading your notes" since={busy} />}
        {error && <p className="form-error">{error}</p>}
      </section>
    </aside>
  );
}
