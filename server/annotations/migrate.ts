/* Migrations of annotations from the first vaults. */
import type { Anchor, Annotation } from "../../shared/vault-types.ts";
import { getBook, listBooks } from "../books/store.ts";
import { annotations, notes, shortId } from "../vault/index.ts";
import { completeAnchor } from "./anchor.ts";

/** Highlights used to be notes; they're annotations of the book now (the note goes to .trash/). */
export function migrateHighlightNotes() {
  const books = new Set(listBooks().map((b) => b.id));
  for (const n of notes.list()) {
    if (n.type !== "highlight" || !n.source?.bookId || !books.has(n.source.bookId)) continue;
    const book = getBook(n.source.bookId)!;
    // the highlight's note held the whole passage as a blockquote; its source kept the first words
    const quote = n.body.replace(/^>\s?/gm, "").trim() || n.source.quote || n.title;
    const raw: Anchor = { quote, page: n.source.page, y: n.source.y, block: n.source.block };
    const a: Annotation = {
      id: shortId("a"),
      kind: "highlight",
      bookId: book.id,
      path: "",
      chapterId: n.source.chapterId,
      anchor: completeAnchor(book, raw),
      color: "yellow",
      status: "ready",
      body: "",
      tags: n.tags,
      created: n.created,
      updated: n.updated,
    };
    annotations.save(a);
    notes.remove(n.id);
  }
}
