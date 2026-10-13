/* Each book, readable by agents: a page in sources/ and its text by chapter in library/. */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chapterText } from "../ingest/index.ts";
import { listBooks } from "../store.ts";
import type { Book } from "../types.ts";
import { changed, concepts, notes, slugify, stringifyFrontmatter, VAULT } from "./index.ts";

export const bookSlug = (book: Book) => `${slugify(book.title, 48)}-${book.id.slice(-4)}`;
/** The library file of a book's i-th chapter (0-based), relative to the vault. */
export const chapterFile = (book: Book, i: number) => `library/${bookSlug(book)}/${String(i + 1).padStart(2, "0")}-${slugify(book.toc[i]?.title || "chapter", 40)}.md`;

/** Writes (or rewrites) a book's source page and chapter files. */
export function exportBook(book: Book) {
  if (book.status !== "ready") return;
  const slug = bookSlug(book);
  const dir = join(VAULT, "library", slug);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  book.toc.forEach((chapter, i) => {
    const text = chapterText(book, chapter, 400000);
    writeFileSync(join(VAULT, chapterFile(book, i)), `# ${chapter.title}${chapter.subtitle ? ` — ${chapter.subtitle}` : ""}\n\n${book.title}${book.author ? `, ${book.author}` : ""} · chapter id ${chapter.id}\n\n${text}\n`);
  });
  writeSourcePage(book);
}

/** The book's page: metadata, chapters, and the notes and concepts that came from it. */
export function writeSourcePage(book: Book) {
  const slug = bookSlug(book);
  const fromBook = notes.list().filter((n) => n.source?.bookId === book.id);
  const bookConcepts = concepts.list().filter((c) => c.sources.some((s) => s.bookId === book.id));
  const body = [
    `# ${book.title}`,
    book.author ? `by ${book.author}` : "",
    "",
    "## Chapters",
    ...book.toc.map((c, i) => `${i + 1}. ${c.title}${c.subtitle ? ` — ${c.subtitle}` : ""} (\`${c.id}\`, text: ${chapterFile(book, i)})`),
    "",
    bookConcepts.length ? "## Concepts" : "",
    ...bookConcepts.map((c) => `- [[${c.id}]] — ${c.summary}`),
    "",
    fromBook.length ? "## Notes" : "",
    ...fromBook.map((n) => `- [[${n.title}]] (${n.type})`),
  ]
    .filter((line, i, all) => line || all[i - 1])
    .join("\n");
  writeFileSync(join(VAULT, "sources", `${slug}.md`), stringifyFrontmatter({ id: book.id, title: book.title, author: book.author, format: book.format, pages: book.pageCount, chapters: book.toc.length, added: book.createdAt }, body));
  changed(`source ${book.title}`);
}

export function removeBookExport(book: Book) {
  rmSync(join(VAULT, "library", bookSlug(book)), { recursive: true, force: true });
  rmSync(join(VAULT, "sources", `${bookSlug(book)}.md`), { force: true });
  changed(`remove ${book.title}`);
}

/** At startup: export books the vault doesn't have yet. */
export function exportMissingBooks() {
  for (const book of listBooks()) {
    if (book.status === "ready" && !existsSync(join(VAULT, "sources", `${bookSlug(book)}.md`))) {
      try {
        exportBook(book);
      } catch (error) {
        console.warn(`[vault] could not export ${book.title}: ${(error as Error).message}`);
      }
    }
  }
}
