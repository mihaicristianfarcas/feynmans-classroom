/* Changing what a book says about itself from the app: its title, its author and its chapters' names.
 * The book's folder keeps its name (notes link to the files in it), links to the book by its old title
 * follow the new one, its text by chapter is written again, the other vaults that have it get the new
 * details, and an open reader hears of them. */
import { NotFound } from "../errors.ts";
import { publish } from "../events.ts";
import { changed } from "../vault/index.ts";
import { exportBook } from "../vault/library.ts";
import { carryLinks, resolveLink } from "../vault/links.ts";
import { bookFolder, getBook, saveBook } from "./store.ts";
import type { Book } from "./types.ts";

export interface BookDetails {
  title?: unknown;
  /** Empty: no author. */
  author?: unknown;
  /** Chapters to rename, by id (an empty subtitle takes it away); the others stay as they are. */
  chapters?: unknown;
}

/** One line of plain text, at most `max` characters. */
const line = (value: unknown, max: number) =>
  String(value ?? "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a name is one line of text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();

/** Changes a book's details; returns the book as the API gives it (with its folder). */
export function editBook(bookId: string, details: BookDetails): Book & { folder: string | null } {
  const book = getBook(bookId);
  if (!book) throw new NotFound("That book isn't in this vault.");
  if (book.status === "ingesting") throw new Error("The book is still being read; change it once it's on the shelf.");
  const oldTitle = book.title;
  if (details.title !== undefined) {
    book.title = line(details.title, 300);
    if (!book.title) throw new Error("A book needs a title.");
  }
  if (details.author !== undefined) book.author = line(details.author, 200) || undefined;
  if (Array.isArray(details.chapters)) {
    for (const change of details.chapters as { id?: unknown; title?: unknown; subtitle?: unknown }[]) {
      const entry = book.toc.find((t) => t.id === change?.id);
      if (!entry) continue;
      if (change.title !== undefined) entry.title = line(change.title, 200) || entry.title;
      if (change.subtitle !== undefined) entry.subtitle = line(change.subtitle, 200) || undefined;
    }
  }
  // links that name the book by its old title (and not something else of that name) are carried along
  const carry = book.title !== oldTitle && resolveLink(oldTitle)?.node === `book:${book.id}`;
  // the text first, so the other vaults are given it with the book
  try {
    exportBook(book);
  } catch (error) {
    console.warn(`[books] could not write ${book.title}'s text: ${(error as Error).message}`);
  }
  saveBook(book);
  if (carry) carryLinks([oldTitle], { name: book.title, path: `library/${bookFolder(book.id)}` });
  changed(`book ${book.title.slice(0, 40)}`);
  const out = { ...book, folder: bookFolder(book.id) };
  publish(book.id, { type: "book", data: out });
  return out;
}
