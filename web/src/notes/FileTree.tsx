/* The notes page's file tree for the app's own vault: the vault switcher, then its notes/ folder as folders you open and close and the notes
 * in them, with buttons for a new note or a new folder; each folder has a menu to add a note or a
 * folder inside it, rename or move it, or delete it. */
import { ChevronRight, Ellipsis, FolderInput, FolderPlus, SquarePen, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { docs, learn } from "../api";
import { go } from "../app/navigation";
import { Spinner } from "../components/feedback";
import { announce, useArrowKeys } from "../lib/a11y";
import type { Panel } from "../lib/usePanel";
import { VaultSwitch } from "../vaults/VaultSwitch";

export type Tree = Awaited<ReturnType<typeof learn.tree>>;

/** Makes an untitled note in a folder and opens it. */
export async function newNote(folder: string, title = "Untitled") {
  const note = await docs.create({ title, folder, body: "" });
  go(`#/notes/${note.id}?new=1`);
}
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

export function FileTree({
  tree,
  current,
  reload,
  panel,
}: {
  tree: Tree | null;
  current: string | null;
  reload: () => void;
  /** Its width (the page resizes and closes it). */
  panel: Panel;
}) {
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
          <div className="tree-folder-row">
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
            <FolderMenu folder={sub.path} reload={reload} />
          </div>
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
    <aside className="file-tree" aria-label="Notes" id={panel.id} ref={panel.ref} style={panel.style}>
      <VaultSwitch current={null} />
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
          onClick={() => newFolder(currentFolder ? `${currentFolder}/` : "", reload)}
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
      {tree && (
        <p className="fine tree-foot">
          {tree.notes.length} note{tree.notes.length === 1 ? "" : "s"}
        </p>
      )}
    </aside>
  );
}

/** Asks for a folder's name (a path under notes/ makes the folders in between too) and makes it. */
async function newFolder(start: string, reload: () => void) {
  const name = prompt("New folder (inside notes/; use / for folders inside folders):", start);
  if (!name?.trim() || name.trim() === start) return;
  const { folder } = await learn.createFolder(name.trim().replace(/\/+$/, ""));
  announce(`Made the folder ${folder}`);
  reload();
}

/** A folder's menu: a note or a folder inside it, rename or move it, delete it. */
function FolderMenu({ folder, reload }: { folder: string; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useArrowKeys(box, { selector: "[role=menuitem]", orientation: "vertical" });
  useEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open]);
  const name = folder.split("/").pop() || folder;
  const act = (fn: () => Promise<void>) => async () => {
    setOpen(false);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only closes the menu when focus leaves it; the buttons inside are the controls
    <div
      className="menu-host tree-folder-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="icon-button small"
        ref={button}
        aria-label={`Folder ${name}: more`}
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Ellipsis aria-hidden="true" />
      </button>
      {open && (
        <div
          className="menu"
          role="menu"
          aria-label={`Folder ${name}`}
          ref={box}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            setOpen(false);
            button.current?.focus();
          }}
        >
          <button type="button" role="menuitem" onClick={act(() => newNote(folder))}>
            <SquarePen aria-hidden="true" />
            New note here
          </button>
          <button type="button" role="menuitem" onClick={act(() => newFolder(`${folder}/`, reload))}>
            <FolderPlus aria-hidden="true" />
            New folder inside
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={act(async () => {
              const to = prompt("Rename or move the folder (its path inside notes/):", folder);
              if (!to?.trim() || to.trim() === folder) return;
              const moved = await learn.moveFolder(folder, to.trim());
              announce(`Moved to ${moved.folder}`);
              reload();
            })}
          >
            <FolderInput aria-hidden="true" />
            Rename or move…
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={act(async () => {
              if (!confirm(`Move the folder “${name}” and every note in it to the vault's trash?`)) return;
              const r = await learn.deleteFolder(folder);
              announce(`Deleted the folder and ${r.notes} note${r.notes === 1 ? "" : "s"}`);
              reload();
            })}
          >
            <Trash2 aria-hidden="true" />
            Delete folder…
          </button>
        </div>
      )}
    </div>
  );
}
