/* The vault's collections, one per kind of record, and where each one keeps its files. */
import { basename } from "node:path";
import { fileNameOf } from "../../shared/links.ts";
import type { Annotation, Card, Concept, Note, SavedFigure, TutorSession } from "../../shared/vault-types.ts";
import { Collection, isGenerated } from "./collection.ts";
import { slugify } from "./files.ts";
import {
  annotationBookInfo,
  annotationFromFile,
  annotationToFile,
  cardFromFile,
  cardToFile,
  conceptFromFile,
  conceptToFile,
  noteFromFile,
  noteToFile,
  sessionFromFile,
  sessionToFile,
} from "./formats.ts";

export const notes = new Collection<Note>({
  root: "notes",
  ext: ".md",
  recursive: true,
  match: (rel) => !isGenerated(rel),
  read: noteFromFile,
  write: noteToFile,
  place: (n) => `notes/${fileNameOf(n.title)}`,
});
export const concepts = new Collection<Concept & { path?: string; props?: Record<string, unknown> }>({
  root: "concepts",
  ext: ".md",
  match: (rel) => !isGenerated(rel),
  read: conceptFromFile,
  write: conceptToFile,
  place: (c) => `concepts/${fileNameOf(c.name)}`,
});
export const cards = new Collection<Card>({
  root: "cards",
  ext: ".md",
  read: cardFromFile,
  write: cardToFile,
  place: (c) => `cards/${slugify(`${c.deck}-${c.front.slice(0, 40)}`, 70)}`,
});
export const figures = new Collection<SavedFigure>({
  root: "figures",
  ext: ".json",
  read: (rel, text) => ({ id: basename(rel, ".json"), ...JSON.parse(text) }),
  write: (f) => JSON.stringify(f, null, 1),
  place: (f) => `figures/${slugify(f.title, 70)}`,
});
export const annotations = new Collection<Annotation>({
  root: "library",
  ext: ".md",
  recursive: true,
  match: (rel) => /^library\/[^/]+\/annotations\/[^/]+\.md$/.test(rel),
  read: annotationFromFile,
  write: annotationToFile,
  place: (x) => {
    const folder = annotationBookInfo(x.bookId).folder || "unsorted";
    const where =
      x.anchor.page !== undefined ? `p${x.anchor.page}` : x.anchor.block !== undefined ? `b${x.anchor.block}` : "x";
    const words = slugify(x.anchor.quote.split(/\s+/).slice(0, 5).join(" "), 40);
    return `library/${folder}/annotations/${where}-${x.kind}-${words}-${x.id.slice(-4)}`;
  },
});
/** Conversations with the tutor about a book, to look back on: library/<book>/sessions/<date> <title>.md */
export const sessions = new Collection<TutorSession>({
  root: "library",
  ext: ".md",
  recursive: true,
  match: (rel) => /^library\/[^/]+\/sessions\/[^/]+\.md$/.test(rel),
  read: sessionFromFile,
  write: sessionToFile,
  place: (x) => {
    const folder = annotationBookInfo(x.bookId).folder || "unsorted";
    return `library/${folder}/sessions/${x.created.slice(0, 10)} ${fileNameOf(x.title).slice(0, 60).trim() || "session"}`;
  },
});
/** Every collection, for scans and for routing a changed file to its owner. */
export const COLLECTIONS: Collection<{ id: string }>[] = [
  notes,
  concepts,
  cards,
  figures,
  annotations,
  sessions,
] as never;
