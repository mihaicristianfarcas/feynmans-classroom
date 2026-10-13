/* What the concept pages show: every concept with how well it's known right now, and one concept
 * with its cards, the notes that link to it, related concepts and the passages it came from. */
import type { Concept } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { cards, concepts, notes } from "../vault/index.ts";
import { allEdges } from "../vault/links.ts";
import { viewCard } from "./cards.ts";
import { conceptMastery } from "./context.ts";

/** Every concept, by name, with its mastery and how many cards it has. */
export function listConcepts() {
  const at = Date.now();
  return concepts
    .list()
    .map((x) => ({
      ...x,
      mastery: conceptMastery(x.id, at),
      cards: cards.list().filter((k) => k.concepts.includes(x.id)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const brief = (c: Concept) => ({ id: c.id, name: c.name, mastery: conceptMastery(c.id) });

/** One concept's page: its cards, the notes that use or link to it, related and linking concepts, its sources. */
export function conceptDetail(concept: Concept) {
  const linking = new Set(
    allEdges()
      .filter((e) => e.to === `concept:${concept.id}` && e.from.startsWith("note:"))
      .map((e) => e.from.slice(5)),
  );
  return {
    ...concept,
    sources: concept.sources.map((s) => ({ ...s, title: getBook(s.bookId)?.title })),
    mastery: conceptMastery(concept.id),
    cards: cards
      .list()
      .filter((k) => k.concepts.includes(concept.id))
      .map((k) => viewCard(k)),
    notes: notes.list().filter((n) => n.concepts.includes(concept.id) || linking.has(n.id)),
    related: concept.related
      .map((id) => concepts.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map(brief),
    backlinks: concepts
      .list()
      .filter((x) => x.related.includes(concept.id))
      .map(brief),
  };
}
