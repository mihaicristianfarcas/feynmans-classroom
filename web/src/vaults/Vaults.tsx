/* The vaults page (#/vaults…): your Obsidian vaults, or any folders of Markdown, opened where they are on
 * disk, as many as you add. Like the notes page: the vault's files on the left, the open note (or file)
 * beside them, its links on the right; or the vault's graph. It follows the files as they change, in
 * Obsidian or anywhere else (the server watches each vault's folder). Routes are in routes.ts. */
import { FolderOpen, Plus, SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { type VaultTree as Tree, type VaultSummary, vaults } from "../api";
import { go } from "../app/navigation";
import { PanelEdge, PanelToggle } from "../components/Panel";
import { useLoad } from "../lib/useLoad";
import { type Panel, usePanel } from "../lib/usePanel";
import { AddVault } from "./AddVault";
import { noteRoute, openVaultLink, parseVaultRoute, vaultRoute } from "./routes";
import { useVaultChanges } from "./useVaultChanges";
import { VaultGraph } from "./VaultGraph";
import { VaultPane } from "./VaultPane";
import { newVaultNote, VaultTree } from "./VaultTree";

const LAST = "classroom-last-vault";

export function Vaults({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const route = parseVaultRoute(hash);
  const [adding, setAdding] = useState(false);
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
    // #/vaults alone: the vault you were in last, or the first one
    if (!id && list.length) {
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST);
      } catch {}
      const to = list.find((v) => v.id === last) ?? list[0];
      history.replaceState(null, "", vaultRoute(to.id));
      setHash(location.hash);
    } else if (id && vault) {
      try {
        localStorage.setItem(LAST, id);
      } catch {}
    }
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

  const add = adding && (
    <AddVault
      onClose={() => setAdding(false)}
      onAdded={(v) => {
        setAdding(false);
        reloadList();
        go(vaultRoute(v.id));
      }}
    />
  );
  if (error) return <div className="center-note">{error}</div>;
  if (!list) return <div className="center-note">Opening your vaults…</div>;
  if (!list.length || !vault)
    return (
      <div className="notes-page">
        <div className="note-pane empty-pane">
          <div className="empty-state rise">
            <h1 className="empty-title">{list.length ? "No such vault" : "Vaults"}</h1>
            <p className="fine">
              {list.length
                ? "It may have been forgotten. Pick another, or add it again."
                : "Open your Obsidian vault here, or any folder of Markdown notes, and add as many as you like. Links, embeds, attachments, tags and the graph work as they do in Obsidian; edits are saved to the files, and changes you make in Obsidian show up here as you make them."}
            </p>
            <button type="button" className="button primary" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              Add a vault
            </button>
            {list.length > 0 && (
              <ul className="link-list">
                {list.map((v) => (
                  <li key={v.id}>
                    <a href={vaultRoute(v.id)}>{v.name}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {add}
      </div>
    );

  const path = route.view === "note" ? route.path : undefined;
  return (
    <div className="notes-page">
      {fileList.open && (
        <VaultTree
          key={vault.id}
          vault={vault}
          list={list}
          current={path ?? null}
          tree={tree}
          query={query}
          onQuery={setQuery}
          onAdd={() => setAdding(true)}
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
      {add}
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
        <p className="fine vault-where" title={vault.path}>
          <FolderOpen aria-hidden="true" /> {vault.path}
        </p>
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
            go("#/vaults");
          }}
        >
          Forget this vault
        </button>
      </div>
    </div>
  );
}
