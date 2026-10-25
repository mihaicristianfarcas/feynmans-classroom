/* Keeping open margins in step with the files: every change to an annotation file (from the app,
 * an agent, another editor) is announced to the book's pages, and a file that disappears is
 * announced as removed (however it went: deleted in the app, by an agent, in another editor). An
 * annotation an agent wrote with only a page and a quote is given its place in the margin the first
 * time it is seen. */
import type { Annotation } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { publish } from "../events.ts";
import { docs, onVaultChange, vaultState } from "../vault/index.ts";
import { chapterOf, completeAnchor } from "./anchor.ts";

const seen = vaultState(() => ({
  /** The last known path → (id, book) of each annotation file, to tell the margin when one disappears. */
  known: new Map<string, { id: string; bookId: string }>(),
  /** Annotations already given a place (tried once each: one whose quote can't be found stays as it is). */
  placed: new Set<string>(),
}));
/** Notes where an annotation's file is, so its removal can be announced. */
export function remember(a: Annotation) {
  seen().known.set(a.path, { id: a.id, bookId: a.source.bookId });
}
/** Tells the book's open pages an annotation is new or changed. */
export function announce(a: Annotation) {
  remember(a);
  publish(a.source.bookId, { type: "annotation", data: a });
}
onVaultChange((rel) => {
  if (!/^library\/[^/]+\/annotations\/[^/]+\.md$/.test(rel)) return;
  const a = docs.at(rel, "annotation");
  if (a) {
    // written by an agent or in another editor: give it what the app would have (a place in the margin)
    const { placed } = seen();
    if (a.source.bookId && a.source.y === undefined && a.source.block === undefined && !placed.has(a.id)) {
      placed.add(a.id);
      completeFromFile(a);
    }
    announce(a);
  } else {
    const { known } = seen();
    const was = known.get(rel);
    known.delete(rel);
    if (was) publish(was.bookId, { type: "annotation-removed", data: { id: was.id } });
  }
});

function completeFromFile(a: Annotation) {
  const book = getBook(a.source.bookId);
  if (!book || !a.source.quote) return;
  const anchor = completeAnchor(book, a.source);
  if (anchor.y === undefined && (anchor.md === undefined || a.source.md)) return;
  a.source = { ...a.source, y: anchor.y, md: a.source.md || anchor.md };
  a.source.chapterId ||= chapterOf(book, a.source)?.entry.id;
  docs.save(a);
}
