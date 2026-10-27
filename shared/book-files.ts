/* Which files are books: the formats the library reads, told by the file's name, and how large one may
 * be. The server checks an upload with it, and the page uses it to choose what to send of the files
 * picked or dropped (a folder brings everything in it). */

export type BookFormat = "pdf" | "epub" | "text";

/** The endings of the files a book can come in (for a file field's `accept`). */
export const BOOK_EXTENSIONS = [".pdf", ".epub", ".md", ".markdown", ".txt", ".text"];

/** The largest book file taken (200 MB). */
export const MAX_BOOK_BYTES = 200 * 1024 * 1024;

/** The format a file's name says it is in, or null when it isn't a book. */
export function formatOf(name: string): BookFormat | null {
  const base = name.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  if (ext === ".pdf") return "pdf";
  if (ext === ".epub") return "epub";
  if (BOOK_EXTENSIONS.includes(ext)) return "text";
  return null;
}
