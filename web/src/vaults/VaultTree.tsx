/* The file list of a vault added from a folder, on the notes page: which vault (VaultSwitch, with a menu
 * to rename it, scan it again, open its graph, show the app's own notes again or remove it), a search of it ("#tag" for tags), its folders, notes and
 * attachments as a tree (each with a menu: a new note or folder inside, rename or move, delete to the
 * vault's .trash), and its tags. */

import {
  ChevronRight,
  Ellipsis,
  Eye,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  FolderInput,
  FolderPlus,
  Network,
  RefreshCw,
  SquarePen,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type VaultTree as Tree, type VaultFileKind, type VaultSummary, vaults } from "../api";
import { go } from "../app/navigation";
import { Spinner } from "../components/feedback";
import { announce, useArrowKeys } from "../lib/a11y";
import { useLoad } from "../lib/useLoad";
import type { Panel } from "../lib/usePanel";
import { graphRoute, noteRoute, searchRoute } from "./routes";
import { SyncNotice } from "./SyncNotice";
import { syncVault } from "./sync/engine";
import { dropLinked } from "./sync/store";
import { useVaultChanges } from "./useVaultChanges";
import { LAST_VAULT, OWN_VAULT, VaultSwitch } from "./VaultSwitch";

const ICON: Record<VaultFileKind, typeof File> = {
  note: FileText,
  image: FileImage,
  pdf: File,
  audio: FileAudio,
  video: FileVideo,
  file: File,
};

interface Folder {
  name: string;
  path: string;
  folders: Folder[];
  files: Tree["files"];
}

function buildTree(tree: Tree): Folder {
  const root: Folder = { name: "", path: "", folders: [], files: [] };
  const folderAt = (path: string): Folder => {
    let node = root;
    let acc = "";
    for (const part of path ? path.split("/") : []) {
      acc = acc ? `${acc}/${part}` : part;
      let next = node.folders.find((f) => f.name === part);
      if (!next) {
        next = { name: part, path: acc, folders: [], files: [] };
        node.folders.push(next);
      }
      node = next;
    }
    return node;
  };
  for (const f of tree.folders) folderAt(f);
  for (const f of tree.files) folderAt(f.path.split("/").slice(0, -1).join("/")).files.push(f);
  const sort = (f: Folder) => {
    f.folders.sort((a, b) => a.name.localeCompare(b.name));
    f.files.sort((a, b) => a.path.localeCompare(b.path));
    f.folders.forEach(sort);
  };
  sort(root);
  return root;
}

const dirOf = (path: string) => path.split("/").slice(0, -1).join("/");

/** Makes an untitled note (in `folder`, or where the vault's settings put new notes) and opens it. */
export async function newVaultNote(id: string, opts: { folder?: string; from?: string; title?: string } = {}) {
  const made = await vaults.create(id, opts);
  go(`${noteRoute(id, made.path)}?new=1`);
}

async function newFolder(id: string, start: string) {
  const name = prompt("New folder (use / for folders inside folders):", start);
  if (!name?.trim() || name.trim() === start) return;
  const made = await vaults.folder(id, name.trim().replace(/\/+$/, ""));
  announce(`Made the folder ${made.path}`);
}

/** Asks where to move a note, file or folder, and moves it (links to it follow). Returns its new path. */
export async function moveItem(id: string, path: string, isFolder = false) {
  const to = prompt(
    isFolder
      ? "Rename or move the folder (its path in the vault):"
      : "Rename or move (its path in the vault; links to it are updated):",
    path,
  );
  if (!to?.trim() || to.trim() === path) return null;
  const moved = await vaults.move(id, path, to.trim());
  announce(`Moved to ${moved.path}`);
  return moved.path;
}

export async function trashItem(id: string, path: string, isFolder = false) {
  const name = path.split("/").pop() || path;
  const what = isFolder ? `the folder “${name}” and everything in it` : `“${name}”`;
  if (!confirm(`Move ${what} to the vault's .trash folder?`)) return false;
  await vaults.trash(id, path);
  announce(`Moved ${name} to the trash`);
  return true;
}

export function VaultTree({
  vault,
  current,
  tree,
  query,
  onQuery,
  onChanged,
  panel,
}: {
  vault: VaultSummary;
  current: string | null;
  tree: Tree | null;
  query: string;
  onQuery: (q: string) => void;
  /** The list of vaults changed (renamed, forgotten). */
  onChanged: () => void;
  panel: Panel;
}) {
  const id = vault.id;
  const { data: own, reload: reloadOwn } = useLoad(() => vaults.own());
  useVaultChanges(null, (changes) => {
    if (changes.some((c) => !c.path)) reloadOwn();
  });
  const [closed, setClosed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(`classroom-vault-closed-${id}`) || "[]") as string[]);
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
        localStorage.setItem(`classroom-vault-closed-${id}`, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  const root = useMemo(() => (tree ? buildTree(tree) : null), [tree]);
  const here = current ? dirOf(current) : "";

  const renderFolder = (f: Folder, depth: number): ReactNode => (
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
            <RowMenu
              label={`Folder ${sub.name}`}
              items={[
                {
                  label: "New note here",
                  icon: SquarePen,
                  run: () => newVaultNote(id, { folder: sub.path }),
                },
                { label: "New folder inside", icon: FolderPlus, run: () => newFolder(id, `${sub.path}/`) },
                { label: "Rename or move…", icon: FolderInput, run: () => moveItem(id, sub.path, true) },
                {
                  label: "Delete folder…",
                  icon: Trash2,
                  danger: true,
                  run: async () => {
                    if ((await trashItem(id, sub.path, true)) && current?.startsWith(`${sub.path}/`))
                      go(`#/vaults/${id}`);
                  },
                },
              ]}
            />
          </div>
          {!closed.has(sub.path) && <ul className="tree">{renderFolder(sub, depth + 1)}</ul>}
        </li>
      ))}
      {f.files.map((file) => {
        const Icon = ICON[file.kind];
        return (
          <li key={file.path} className="tree-folder-row">
            <a
              className="tree-row vault-file"
              data-kind={file.kind}
              href={noteRoute(id, file.path)}
              aria-current={file.path === current ? "page" : undefined}
              style={{ paddingLeft: 26 + depth * 14 }}
              title={file.path}
            >
              {file.kind !== "note" && <Icon className="vault-file-icon" aria-hidden="true" />}
              <span className="tree-title">{file.name}</span>
              {file.kind !== "note" && <span className="vault-ext">{file.path.split(".").pop()?.toLowerCase()}</span>}
            </a>
            <RowMenu
              label={file.name}
              items={[
                {
                  label: "Rename or move…",
                  icon: FolderInput,
                  run: async () => {
                    const to = await moveItem(id, file.path);
                    if (to && file.path === current) go(noteRoute(id, to));
                  },
                },
                {
                  label: "Delete…",
                  icon: Trash2,
                  danger: true,
                  run: async () => {
                    if ((await trashItem(id, file.path)) && file.path === current) go(`#/vaults/${id}`);
                  },
                },
              ]}
            />
          </li>
        );
      })}
    </>
  );

  return (
    <aside className="file-tree vault-tree" aria-label="Vault" id={panel.id} ref={panel.ref} style={panel.style}>
      <VaultSwitch current={id}>
        <RowMenu
          label={`Vault ${vault.name}`}
          button="icon-button"
          className="vault-menu"
          items={[
            { label: "Graph of this vault", icon: Network, run: async () => go(graphRoute(id)) },
            {
              label: "Rename in the app…",
              icon: SquarePen,
              run: async () => {
                const name = prompt("Name for this vault (its folder keeps its name):", vault.name);
                if (!name?.trim() || name.trim() === vault.name) return;
                await vaults.rename(id, name.trim());
                onChanged();
              },
            },
            {
              label: "Scan for changes",
              icon: RefreshCw,
              run: async () => {
                if (vault.synced) await syncVault(id);
                const r = await vaults.rescan(id);
                announce(r.changes ? `${r.changes} change${r.changes === 1 ? "" : "s"} found` : "Up to date");
              },
            },
            ...(own?.hidden
              ? [
                  {
                    label: `Show ${OWN_VAULT} notes again`,
                    icon: Eye,
                    run: async () => {
                      await vaults.hideOwn(false);
                      announce(`${OWN_VAULT} is back on the Notes page`);
                    },
                  },
                ]
              : []),
            {
              label: "Remove from the app…",
              icon: X,
              danger: true,
              run: async () => {
                if (
                  !confirm(
                    `Remove “${vault.name}” from the app? Its folder and files on your computer are not touched.`,
                  )
                )
                  return;
                if (vault.synced) await dropLinked(id);
                await vaults.remove(id);
                try {
                  localStorage.removeItem(LAST_VAULT);
                } catch {}
                onChanged();
                go("#/notes");
              },
            },
          ]}
        />
      </VaultSwitch>
      {vault.synced && <SyncNotice id={id} name={vault.name} quiet />}
      <div className="tree-head">
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search, or #tag…"
          aria-label="Search this vault"
        />
        <button
          type="button"
          className="icon-button"
          title="New note"
          aria-label="New note"
          onClick={() => newVaultNote(id, { from: current || undefined })}
        >
          <SquarePen aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          title="New folder"
          aria-label="New folder"
          onClick={() => newFolder(id, here ? `${here}/` : "")}
        >
          <FolderPlus aria-hidden="true" />
        </button>
      </div>
      {query.trim() ? (
        <SearchResults id={id} query={query} current={current} />
      ) : !root ? (
        <Spinner label="Loading" />
      ) : (
        <ul className="tree">
          {renderFolder(root, 0)}
          <Tags id={id} tree={tree} onQuery={onQuery} />
        </ul>
      )}
      <p className="fine tree-foot">
        {vault.notes} note{vault.notes === 1 ? "" : "s"}
        {vault.files ? `, ${vault.files} attachment${vault.files === 1 ? "" : "s"}` : ""} ·{" "}
        <a className="link" href={graphRoute(id)}>
          Graph
        </a>
      </p>
    </aside>
  );
}

function SearchResults({ id, query, current }: { id: string; query: string; current: string | null }) {
  const [q, setQ] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setQ(query), 150);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error } = useLoad(() => vaults.search(id, q), [id, q]);
  useEffect(() => {
    if (data) announce(`${data.length} found`);
  }, [data]);
  if (error) return <p className="form-error tree-note">{error}</p>;
  if (!data) return <Spinner label="Searching" />;
  if (!data.length) return <p className="fine tree-note">Nothing matches.</p>;
  return (
    <ul className="tree vault-hits">
      {data.map((h) => (
        <li key={h.path}>
          <a
            className="tree-row vault-hit"
            href={noteRoute(id, h.path)}
            aria-current={h.path === current ? "page" : undefined}
          >
            <span className="tree-title">{h.title}</span>
            <span className="tree-folder">{dirOf(h.path)}</span>
            {h.snippet && <span className="vault-snippet">{h.snippet}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The vault's tags, folded under one heading (nested tags show their parents' counts too). */
function Tags({ id, tree, onQuery }: { id: string; tree: Tree | null; onQuery: (q: string) => void }) {
  // reloads when the tree does: a change anywhere may add or drop a tag
  const { data } = useLoad(() => vaults.tags(id), [id, tree]);
  if (!data?.length) return null;
  return (
    <li className="vault-tags">
      <details>
        <summary className="tree-row folder">
          <Tag className="vault-file-icon" aria-hidden="true" />
          Tags <span className="count">{data.length}</span>
        </summary>
        <ul className="tree">
          {data.map((t) => (
            <li key={t.tag}>
              <a
                className="tree-row"
                href={searchRoute(id, `#${t.tag}`)}
                style={{ paddingLeft: 26 + (t.tag.split("/").length - 1) * 14 }}
                onClick={(e) => {
                  e.preventDefault();
                  onQuery(`#${t.tag}`);
                }}
              >
                <span className="tree-title">#{t.tag.split("/").pop()}</span>
                <span className="tree-folder">{t.count}</span>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

interface MenuItem {
  label: string;
  icon: typeof File;
  danger?: boolean;
  run: () => Promise<unknown>;
}

/** A row's "more" menu (a vault, a folder, a file). */
export function RowMenu({
  label,
  items,
  button = "icon-button small",
  className = "tree-folder-menu",
}: {
  label: string;
  items: MenuItem[];
  button?: string;
  /** The menu's place: a row's (shown on hover) by default. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useArrowKeys(box, { selector: "[role=menuitem]", orientation: "vertical" });
  useEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open]);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only closes the menu when focus leaves it; the buttons inside are the controls
    <div
      className={`menu-host ${className}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={button}
        ref={opener}
        aria-label={`${label}: more`}
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
          aria-label={label}
          ref={box}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            setOpen(false);
            opener.current?.focus();
          }}
        >
          {items.map((item, i) => (
            <Fragment key={item.label}>
              {item.danger && i > 0 && <div className="menu-sep" />}
              <button
                type="button"
                role="menuitem"
                className={item.danger ? "danger" : undefined}
                onClick={async () => {
                  setOpen(false);
                  try {
                    await item.run();
                  } catch (e) {
                    alert((e as Error).message);
                  }
                }}
              >
                <item.icon aria-hidden="true" />
                {item.label}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
