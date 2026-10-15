/* The notes page for a vault added from a folder (#/vaults/<id>…: an Obsidian vault, or any folder of
 * Markdown; the app's own notes are notes/Notes.tsx). The vault's files on the left, the open note (or
 * file) beside them, its links on the right; or the vault's graph. It follows the files as they change.
 * Routes are in routes.ts. */
import { FolderOpen, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { type VaultTree as Tree, type VaultSummary, vaults } from "../api";
import { go } from "../app/navigation";
import { PanelEdge, PanelToggle } from "../components/Panel";
import { useLoad } from "../lib/useLoad";
import { type Panel, usePanel } from "../lib/usePanel";
import { noteRoute, openVaultLink, parseVaultRoute, vaultRoute } from "./routes";
import { SyncNotice } from "./SyncNotice";
import { useVaultChanges } from "./useVaultChanges";
import { VaultGraph } from "./VaultGraph";
import { VaultPane } from "./VaultPane";
import { LAST_VAULT } from "./VaultSwitch";
import { newVaultNote, VaultTree } from "./VaultTree";

export function Vaults({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const route = parseVaultRoute(hash);
  const [query, setQuery] = useState(route.q ?? "");
  useEffect(() => setQuery(route.q ?? ""), [route.q]);
  const fileList = usePanel("notes-list", { initial: 260, min: 180, max: 480 });
  const links = usePanel("notes-links", { initial: 300, min: 220, max: 520 });
  // a #tag clicked anywhere searches the vault: the list it shows in opens if it was closed
  const { expand } = fileList;
  useEffect(() => {
    if (route.q) expand();
  }, [route.q, expand]);
  const { data: list, error, reload: reloadList } = useLoad(() => vaults.list());
  const id = route.id;
  const vault = list?.find((v) => v.id === id);
  const { data: tree, reload: reloadTree } = useLoad<Tree | null>(
    () => (vault?.status === "ready" ? vaults.tree(vault.id) : Promise.resolve(null)),
    [vault?.id, vault?.status],
  );
  // files changed in a vault (here, in Obsidian, anywhere): its tree and counts follow
  useVaultChanges(null, (changes) => {
    reloadList();
    if (changes.some((c) => c.vault === id)) reloadTree();
  });

  useEffect(() => {
    if (!list) return;
    if (id && vault) {
      try {
        localStorage.setItem(LAST_VAULT, id);
      } catch {}
      return;
    }
    // #/vaults alone: the vault open last, or the first; a vault that's gone: the app's own notes
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_VAULT);
      if (id) localStorage.removeItem(LAST_VAULT);
    } catch {}
    const to = id ? undefined : (list.find((v) => v.id === last) ?? list[0]);
    history.replaceState(null, "", to ? vaultRoute(to.id) : "#/notes");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, [list, id, vault]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the route is parsed from the hash on each draw; the hash says when it changed
  useEffect(() => {
    if (route.view !== "open" || !id) return;
    const p = route.params;
    void openVaultLink(id, p.get("target") || "", {
      sub: p.get("sub") || undefined,
      from: p.get("from") || undefined,
      md: p.get("md") === "1",
      replace: true,
    });
  }, [hash]);

  if (error) return <div className="center-note">{error}</div>;
  if (!list || !vault) return <div className="center-note">Opening the vault…</div>;

  const path = route.view === "note" ? route.path : undefined;
  return (
    <div className="notes-page">
      {fileList.open && (
        <VaultTree
          key={vault.id}
          vault={vault}
          current={path ?? null}
          tree={tree}
          query={query}
          onQuery={setQuery}
          onChanged={reloadList}
          panel={fileList}
        />
      )}
      <PanelEdge panel={fileList} side="left" label="file list" />
      {vault.status === "missing" ? (
        <Missing vault={vault} list={fileList} onForget={reloadList} />
      ) : route.view === "graph" ? (
        <div className="note-pane">
          <VaultGraph id={vault.id} name={vault.name} />
        </div>
      ) : path ? (
        <VaultPane
          key={`${vault.id}:${path}`}
          id={vault.id}
          vaultName={vault.name}
          path={path}
          sub={route.sub}
          theme={theme}
          list={fileList}
          links={links}
        />
      ) : route.view === "open" ? (
        <div className="note-pane center-note">Opening…</div>
      ) : (
        <VaultHome vault={vault} tree={tree} list={fileList} />
      )}
    </div>
  );
}

/** A vault with nothing open: what's in it, and the notes edited last. */
function VaultHome({ vault, tree, list }: { vault: VaultSummary; tree: Tree | null; list: Panel }) {
  const recent = (tree?.files || [])
    .filter((f) => f.kind === "note")
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 8);
  return (
    <div className="note-pane empty-pane">
      <PanelToggle panel={list} side="left" label="file list" className="icon-button small pane-corner" />
      <div className="empty-state rise">
        <h1 className="empty-title">{vault.name}</h1>
        {vault.synced ? (
          <SyncNotice id={vault.id} name={vault.name} />
        ) : (
          <p className="fine vault-where" title={vault.path}>
            <FolderOpen aria-hidden="true" /> {vault.path}
          </p>
        )}
        <p className="fine">
          {vault.notes} note{vault.notes === 1 ? "" : "s"}
          {vault.files ? `, ${vault.files} attachment${vault.files === 1 ? "" : "s"}` : ""}
          {vault.obsidian ? " · an Obsidian vault" : ""}
        </p>
        <button type="button" className="button primary" onClick={() => newVaultNote(vault.id)}>
          <SquarePen aria-hidden="true" />
          New note
        </button>
        {recent.length > 0 && (
          <section className="vault-recent">
            <h2 className="side-title">Edited lately</h2>
            <ul className="link-list compact">
              {recent.map((f) => (
                <li key={f.path}>
                  <a href={noteRoute(vault.id, f.path)}>{f.name}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Missing({ vault, list, onForget }: { vault: VaultSummary; list: Panel; onForget: () => void }) {
  return (
    <div className="note-pane empty-pane">
      <PanelToggle panel={list} side="left" label="file list" className="icon-button small pane-corner" />
      <div className="empty-state rise">
        <h1 className="empty-title">{vault.name}</h1>
        <p className="fine">
          Its folder isn't at <code>{vault.path}</code> any more (moved, renamed, or on a drive that isn't connected).
          It opens again as soon as the folder is back.
        </p>
        <button
          type="button"
          className="button"
          onClick={async () => {
            if (!confirm(`Forget “${vault.name}”? Nothing on disk is touched.`)) return;
            await vaults.remove(vault.id);
            onForget();
            go("#/notes");
          }}
        >
          Forget this vault
        </button>
      </div>
    </div>
  );
}
