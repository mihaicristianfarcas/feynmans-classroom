/* The notes page's file tree: the vault's notes/ folder as folders you open and close and the notes
 * in them, with buttons for a new note or a new folder. */
import { ChevronRight, FolderPlus, SquarePen } from "lucide-react";
import { useMemo, useState } from "react";
import { learn } from "../api";
import { go } from "../app/navigation";
import { Spinner } from "../components/feedback";

export type Tree = Awaited<ReturnType<typeof learn.tree>>;

/** Makes an untitled note in a folder and opens it. */
export async function newNote(folder: string, title = "Untitled") {
  const note = await learn.createNote({ title, folder, body: "" });
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

export function FileTree({ tree, current, reload }: { tree: Tree | null; current: string | null; reload: () => void }) {
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
