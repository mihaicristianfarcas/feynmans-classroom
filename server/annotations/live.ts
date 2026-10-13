/* Keeping open margins in step with the files: every change to an annotation file (from the app,
 * an agent, another editor) is announced to the book's pages, and a file that disappears is
 * announced as removed. An annotation an agent wrote with only a page and a quote is given its
 * place in the margin the first time it is seen. */
import type { Annotation } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { publish } from "../events.ts";
import { annotations, onVaultChange } from "../vault/index.ts";
import { chapterOf, completeAnchor } from "./anchor.ts";

/** The last known path → (id, book) of each annotation file, to tell the margin when one disappears. */
const known = new Map<string, { id: string; bookId: string }>();
/** Notes where an annotation's file is, so its removal can be announced. */
export function remember(a: Annotation) {
  known.set(a.path, { id: a.id, bookId: a.bookId });
}
/** Tells the book's open pages an annotation is new or changed. */
export function announce(a: Annotation) {
  remember(a);
  publish(a.bookId, { type: "annotation", data: a });
}
onVaultChange((rel) => {
  if (!/^library\/[^/]+\/annotations\/[^/]+\.md$/.test(rel)) return;
  const a = annotations.byPath(rel);
  if (a) {
    // written by an agent or in another editor: give it what the app would have (a place in the margin)
    if (a.bookId && a.anchor.y === undefined && a.anchor.block === undefined && !placed.has(a.id)) {
      placed.add(a.id);
      completeFromFile(a);
    }
    announce(a);
  } else {
    const was = known.get(rel);
    known.delete(rel);
    if (was) publish(was.bookId, { type: "annotation-removed", data: { id: was.id } });
  }
});

/** Annotations already given a place (tried once each: one whose quote can't be found stays as it is). */
const placed = new Set<string>();

function completeFromFile(a: Annotation) {
  const book = getBook(a.bookId);
  if (!book || !a.anchor.quote) return;
  const anchor = completeAnchor(book, a.anchor);
  if (anchor.y === undefined && (anchor.md === undefined || a.anchor.md)) return;
  a.anchor = { ...a.anchor, y: anchor.y, md: a.anchor.md || anchor.md };
  a.chapterId ||= chapterOf(book, a.anchor)?.entry.id;
  annotations.save(a);
}

/** Forgets a deleted annotation's file (its removal is announced by whoever deleted it). */
export const forget = (path: string) => known.delete(path);
