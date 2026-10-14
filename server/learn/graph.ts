/* The knowledge graph: books and documents (concepts, notes, annotations) as nodes, with the links
 * between them (the learner's own, accepted and suggested connections) and each concept's mastery as
 * a ring. */
import { listBooks } from "../books/store.ts";
import { listConnections } from "../vault/connections.ts";
import { docs } from "../vault/index.ts";
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
  kind: "source" | "related" | "about" | "mentions" | "link" | "embed" | "ai" | "suggested" | "concept";
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
  const cards = docs.list("card");
  for (const d of docs.list()) {
    // cards, kept figures and sessions are reached from the concepts and notes they link, not drawn
    if (d.kind === "card" || d.kind === "figure" || d.kind === "session") continue;
    const node: GraphNode = {
      id: `${d.kind}:${d.id}`,
      kind: d.kind,
      label: d.title,
      mastery: null,
      size: 0.8,
      path: d.path,
      bookId: d.source?.bookId,
      created: new Date(d.created).getTime(),
    };
    if (d.kind === "concept") {
      const linkedCards = cards.filter((k) => k.concepts.includes(d.id)).length;
      Object.assign(node, {
        mastery: conceptMastery(d.id),
        size: 1 + Math.min(2, (linkedCards + d.sources.length) / 4),
        detail: d.summary,
        bookId: undefined,
      });
    } else if (d.kind === "note")
      Object.assign(node, { mastery: typeof d.score === "number" ? d.score / 100 : null, detail: d.type });
    else if (d.kind === "annotation") Object.assign(node, { size: 0.5, detail: d.type });
    nodes.push(node);
  }
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
  const order: Edge["kind"][] = ["link", "embed", "ai", "related", "about", "concept", "mentions", "source"];
  const all = allEdges().filter((e) => e.to);
  for (const kind of order) for (const e of all) if (e.kind === kind) add({ from: e.from, to: e.to!, kind: e.kind });
  for (const c of listConnections()) {
    if (c.status !== "suggested") continue;
    const from = docs.at(c.from);
    const to = resolveLink(c.to);
    if (from && to) add({ from: `${from.kind}:${from.id}`, to: to.node, kind: "suggested", id: c.id, why: c.why });
  }
  return { nodes, edges };
}
