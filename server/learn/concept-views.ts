/* What the concept pages show: every concept with how well it's known right now, and one concept
 * with its cards, the notes that link to it, what it builds on and leads to, related concepts and the
 * passages it came from. */
import type { Concept } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { docs } from "../vault/index.ts";
import { allEdges } from "../vault/links.ts";
import { viewCard } from "./cards.ts";
import { conceptMastery } from "./context.ts";

/** Every concept, by name, with its mastery and how many cards it has. */
export function listConcepts() {
  const at = Date.now();
  const cards = docs.list("card");
  return docs
    .list("concept")
    .map((x) => ({
      ...x,
      mastery: conceptMastery(x.id, at),
      cards: cards.filter((k) => k.concepts.includes(x.id)).length,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

const brief = (c: Concept) => ({ id: c.id, title: c.title, mastery: conceptMastery(c.id) });
const concept = (node: string) => (node.startsWith("concept:") ? docs.get(node.slice(8), "concept") : undefined);

/** One concept's page: its cards, the notes that use or link to it, what it builds on and leads to,
 * related and linking concepts, its sources. */
export function conceptDetail(c: Concept) {
  const node = `concept:${c.id}`;
  const edges = allEdges();
  const linking = new Set(edges.filter((e) => e.to === node && e.from.startsWith("note:")).map((e) => e.from.slice(5)));
  const found = (list: (Concept | undefined)[]) => list.filter((x): x is Concept => !!x);
  const buildsOn = found(
    edges.filter((e) => e.from === node && e.kind === "builds-on" && e.to).map((e) => concept(e.to!)),
  );
  const leadsTo = found(edges.filter((e) => e.to === node && e.kind === "builds-on").map((e) => concept(e.from)));
  // a concept already shown as one it builds on or leads to isn't listed again as related
  const directed = new Set([...buildsOn, ...leadsTo].map((x) => x.id));
  const related = found(
    edges.filter((e) => e.from === node && e.kind === "concept" && e.to).map((e) => concept(e.to!)),
  );
  const linkedFrom = found(edges.filter((e) => e.to === node && e.kind === "concept").map((e) => concept(e.from)));
  return {
    ...c,
    sources: c.sources.map((s) => ({ ...s, title: getBook(s.bookId)?.title })),
    mastery: conceptMastery(c.id),
    cards: docs
      .list("card")
      .filter((k) => k.concepts.includes(c.id))
      .map((k) => viewCard(k)),
    notes: docs.list("note").filter((n) => n.concepts.includes(c.id) || linking.has(n.id)),
    buildsOn: buildsOn.map(brief),
    leadsTo: leadsTo.map(brief),
    related: related.filter((x) => !directed.has(x.id)).map(brief),
    backlinks: linkedFrom.filter((x) => !directed.has(x.id)).map(brief),
  };
}
