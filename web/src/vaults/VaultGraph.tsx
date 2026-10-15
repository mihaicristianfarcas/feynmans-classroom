/* The graph of an outside vault, as Obsidian's graph view: every note, joined where one links to
 * another (pictures and other files too, if you choose), sized by how many links it has; find one by
 * name, double-click (or Enter) to open it. It redraws as the vault changes. */
import { useMemo, useState } from "react";
import { type GraphData, vaults } from "../api";
import { go } from "../app/navigation";
import { GraphView } from "../components/GraphView";
import { useLoad } from "../lib/useLoad";
import { noteRoute } from "./routes";
import { useVaultChanges } from "./useVaultChanges";

export function VaultGraph({ id, name }: { id: string; name: string }) {
  const [files, setFiles] = useState(false);
  const [find, setFind] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, reload } = useLoad(() => vaults.graph(id, files), [id, files]);
  useVaultChanges(id, reload);
  const graph = useMemo<GraphData | null>(
    () =>
      data && {
        nodes: data.nodes.map((n) => ({
          id: n.id,
          kind: "note" as const,
          label: n.label,
          mastery: null,
          size: n.links,
          path: n.id,
          detail: n.kind === "note" ? n.id : `${n.kind}: ${n.id}`,
          created: n.mtime,
        })),
        edges: data.edges.map((e) => ({ ...e, kind: "link" })),
      },
    [data],
  );
  if (error) return <div className="brain center-note">{error}</div>;
  if (!graph) return <div className="brain center-note">Drawing the graph…</div>;
  return (
    <div className="brain vault-graph">
      <h1 className="visually-hidden">Graph of {name}</h1>
      <div className="brain-stage">
        <form className="graph-find" onSubmit={(e) => e.preventDefault()}>
          <div className="graph-find-field">
            <input
              type="search"
              className="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder={`Find in ${name}…`}
              aria-label="Find in the graph"
            />
          </div>
          <button
            type="button"
            className="button small vault-graph-files"
            aria-pressed={files}
            title="Show pictures, PDFs and other files linked from notes"
            onClick={() => setFiles((v) => !v)}
          >
            Attachments
          </button>
        </form>
        {graph.nodes.length === 0 ? (
          <div className="center-note">No notes in this vault yet.</div>
        ) : (
          <GraphView
            data={graph}
            highlight={find}
            selected={selected}
            onSelect={(n, keyboard) => (n && keyboard ? go(noteRoute(id, n.id)) : setSelected(n?.id ?? null))}
            onOpen={(n) => go(noteRoute(id, n.id))}
          />
        )}
      </div>
    </div>
  );
}
