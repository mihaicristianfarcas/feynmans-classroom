/* A vault note as the reader's working note: passages and pictures sent from a book land at its end,
 * linking back to the book by its title (an app link, app-links.ts, that Obsidian shows as plain text),
 * and the vault notes that link to a book are listed beside the book's own notes. The book's note and the
 * notes the reader saves (a tutor session's, an explanation, a connection) are made here. */
import { fileNameOf } from "../../shared/links.ts";
import type { Annotation } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { whereOf } from "../vault/index.ts";
import { appLinks } from "./app-links.ts";
import { createNote, saveNote } from "./edit.ts";
import { announceChanges, getVault } from "./index.ts";
import type { Vault } from "./vault.ts";

export type PassageMode = "reference" | "passage" | "embed";

const clean = (s: string) => s.replace(/[[\]|#^]/g, "");

/** A link to the book at the passage's page (`[[Title#page=12|Title, p. 12]]`). */
export function bookLink(a: Pick<Annotation, "source">, label?: string): string {
  const book = getBook(a.source.bookId);
  const title = clean(book?.title || "the book");
  const where = a.source.page !== undefined ? whereOf(a.source) : `¶${a.source.block}`;
  const sub = a.source.page !== undefined ? `#page=${a.source.page}` : "";
  return `[[${title}${sub}|${clean(label ?? `${title}, ${where}`)}]]`;
}

/** The Markdown a passage becomes in a vault note: a link, or the quote under a link to the book. */
export function passageMarkdown(a: Annotation, mode: PassageMode): string {
  if (mode === "reference") {
    const words = a.source.quote.split(/\s+/).slice(0, 8).join(" ");
    const book = getBook(a.source.bookId);
    const where = a.source.page !== undefined ? whereOf(a.source) : `¶${a.source.block}`;
    return bookLink(a, `${book?.title || "the book"}, ${where}: “${words}…”`);
  }
  const quote = a.source.quote
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `> [!quote] ${bookLink(a)}\n${quote}${mode === "embed" && a.body?.trim() ? `\n\n${a.body.trim()}` : ""}`;
}

/** Adds `markdown` at the end of a vault note, after a blank line. */
export function appendToVaultNote(vault: Vault, path: string, markdown: string) {
  const entry = vault.files.get(path);
  if (entry?.kind !== "note") throw new Error("note not found");
  const text = entry.text ?? "";
  const next = `${text.replace(/\s*$/, "")}${text.trim() ? "\n\n" : ""}${markdown.trim()}\n`;
  const change = saveNote(vault, path, next);
  announceChanges(vault.id, [change]);
  return { path: change.path, text: next };
}

/** The vault notes that link to a book. */
export function vaultNotesOfBook(bookId: string) {
  return appLinks()
    .filter((l) => l.to.kind === "book" && l.to.bookId === bookId)
    .map((l) => ({ vault: l.vault, vaultName: l.vaultName, path: l.path, title: l.title, page: l.to.page }));
}

/** A new note's text: frontmatter linking the book (`source`) and the concepts it is about (`about`), and its tags. */
export function noteText(body: string, opts: { bookId?: string; about?: string[]; tags?: string[] } = {}) {
  const book = opts.bookId ? getBook(opts.bookId) : undefined;
  const lines: string[] = [];
  if (opts.tags?.length) lines.push("tags:", ...opts.tags.map((t) => `  - ${JSON.stringify(t)}`));
  if (book) lines.push(`source: ${JSON.stringify(`[[${clean(book.title)}]]`)}`);
  const about = (opts.about || []).map(clean).filter((a) => a.trim());
  if (about.length) lines.push("about:", ...about.map((a) => `  - ${JSON.stringify(`[[${a}]]`)}`));
  const front = lines.length ? `---\n${lines.join("\n")}\n---\n\n` : "";
  return `${front}${body.trim()}\n`;
}

/** Makes a note in vault `id` and announces it; returns its path and title. */
export function newVaultNote(
  id: string,
  opts: { title: string; body?: string; bookId?: string; about?: string[]; tags?: string[] },
) {
  const vault = getVault(id);
  const made = createNote(vault, {
    title: opts.title.replace(/[\\/:]/g, "-"),
    text: noteText(opts.body || "", opts),
  });
  announceChanges(vault.id, [made]);
  return { vault: vault.id, path: made.path, title: titleOf(made.path) };
}

const titleOf = (path: string) => (path.split("/").pop() || path).replace(/\.md$/i, "");

/** The note a book's reading writes into in vault `id`: "<Book title> — notes" linking the book, made on first use. */
export function vaultBookNote(id: string, bookId: string) {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const vault = getVault(id);
  const title = fileNameOf(`${book.title} — notes`.replace(/[\\/:]/g, "-"));
  const existing = [...vault.files.values()].find((e) => e.kind === "note" && e.name === title);
  if (existing) return { vault: vault.id, path: existing.path, title };
  return newVaultNote(vault.id, { title, body: `Notes while reading [[${clean(book.title)}]].`, bookId });
}
