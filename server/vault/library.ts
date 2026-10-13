/* Each book's text, readable by agents: library/<book>/text/NN-chapter.md, one file per chapter with
 * [[page N]] (or [[block N]]) markers. Derived from the book (and rebuilt when missing), so it is
 * not versioned. */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chapterText } from "../ingest/index.ts";
import { bookDir, bookFolder, listBooks } from "../store.ts";
import type { Book } from "../types.ts";
import { slugify, VAULT } from "./index.ts";

/** The book's folder name under library/. */
export const bookSlug = (book: Book) => bookFolder(book.id) || book.id;
/** The text file of a book's i-th chapter (0-based), relative to the vault. */
export const chapterFile = (book: Book, i: number) => `library/${bookSlug(book)}/text/${String(i + 1).padStart(2, "0")}-${slugify(book.toc[i]?.title || "chapter", 40)}.md`;

/** Writes (or rewrites) a book's chapter files. */
export function exportBook(book: Book) {
  if (book.status !== "ready") return;
  const dir = join(bookDir(book.id), "text");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  book.toc.forEach((chapter, i) => {
    const text = chapterText(book, chapter, 400000);
    writeFileSync(join(VAULT, chapterFile(book, i)), `# ${chapter.title}${chapter.subtitle ? ` — ${chapter.subtitle}` : ""}\n\n${book.title}${book.author ? `, ${book.author}` : ""} · chapter id ${chapter.id}\n\n${text}\n`);
  });
}

/** At startup: write the text of books that don't have it (new, migrated, or a fresh clone of the vault). */
export function exportMissingBooks() {
  for (const book of listBooks()) {
    if (book.status === "ready" && !existsSync(join(bookDir(book.id), "text"))) {
      try {
        exportBook(book);
      } catch (error) {
        console.warn(`[vault] could not export ${book.title}: ${(error as Error).message}`);
      }
    }
  }
}
