/* The knowledge graph: concepts, notes, books and figures as nodes, with the links between them
 * (the learner's own, accepted and suggested connections) and each concept's mastery as a ring. */
import { listBooks } from "../books/store.ts";
import { listConnections } from "../vault/connections.ts";
import { annotations, cards, concepts, notes } from "../vault/index.ts";
import { allEdges, type Edge, resolveLink } from "../vault/links.ts";
import { conceptMastery } from "./context.ts";

export interface GraphNode {
  id: string;
  kind: "book" | "concept" | "note" | "annotation";
  label: string;
  /** 0–1, or null when unknown. */
  mastery: number | null;
  size: number;
  detail?: string;
  bookId?: string;
  path?: string;
  /** When it entered the brain (ms), for replaying the graph's growth. */
  created: number;
}
export interface GraphEdge {
  from: string;
  to: string;
  /** link/embed: written in a note; related: a property link; ai: a connection the learner accepted;
   * suggested: one waiting for a decision; concept: concept to concept; mentions: note to concept; source: to its book. */
  kind: "source" | "related" | "mentions" | "link" | "embed" | "ai" | "suggested" | "concept";
  /** For suggestions: the connection's id and why it was suggested. */
  id?: string;
  why?: string;
}

/** The knowledge graph, from the vault's links (see vault/links.ts). */
export function knowledgeGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const books = listBooks().filter((b) => b.status === "ready");
  for (const b of books)
    nodes.push({
      id: `book:${b.id}`,
      kind: "book",
      label: b.title,
      mastery: null,
      size: 3,
      detail: b.author,
      bookId: b.id,
      created: new Date(b.createdAt).getTime(),
    });
  for (const c of concepts.list()) {
    const linkedCards = cards.list().filter((k) => k.concepts.includes(c.id)).length;
    nodes.push({
      id: `concept:${c.id}`,
      kind: "concept",
      label: c.name,
      mastery: conceptMastery(c.id),
      size: 1 + Math.min(2, (linkedCards + c.sources.length) / 4),
      detail: c.summary,
      path: concepts.fileOf(c.id) || undefined,
      created: new Date(c.created).getTime(),
    });
  }
  for (const n of notes.list())
    nodes.push({
      id: `note:${n.id}`,
      kind: "note",
      label: n.title,
      mastery: typeof n.score === "number" ? n.score / 100 : null,
      size: 0.8,
      detail: n.type,
      path: n.path,
      created: new Date(n.created).getTime(),
    });
  for (const a of annotations.list())
    nodes.push({
      id: `annotation:${a.id}`,
      kind: "annotation",
      label: a.title || `${a.anchor.quote.split(/\s+/).slice(0, 7).join(" ")}…`,
      mastery: null,
      size: 0.5,
      detail: a.kind,
      bookId: a.bookId,
      path: a.path,
      created: new Date(a.created).getTime(),
    });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (e: GraphEdge) => {
    const key = `${e.from}|${e.to}`;
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to) || seen.has(key)) return;
    seen.add(key);
    edges.push(e);
  };
  // the strongest kind of link between two things is the one drawn: written links first
  const order: Edge["kind"][] = ["link", "embed", "ai", "related", "concept", "mentions", "source"];
  const all = allEdges().filter((e) => e.to);
  for (const kind of order) for (const e of all) if (e.kind === kind) add({ from: e.from, to: e.to!, kind: e.kind });
  for (const c of listConnections()) {
    if (c.status !== "suggested") continue;
    const from = notes.byPath(c.from);
    const to = resolveLink(c.to);
    if (from && to) add({ from: `note:${from.id}`, to: to.node, kind: "suggested", id: c.id, why: c.why });
  }
  return { nodes, edges };
}
