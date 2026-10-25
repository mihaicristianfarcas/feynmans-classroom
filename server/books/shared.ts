/* Books in several vaults, kept once. Each vault has its own folder for a book (library/<book>/), where
 * what was made in that vault goes (annotations, tutor sessions, figures), and the book itself (book.json,
 * the file, its pages, blocks and pictures, its text by chapter) is hard-linked into it from the vault
 * that had it first: one copy on disk however many vaults hold it, and still a complete folder that
 * Obsidian, jj and agents read as usual. The file system counts the links, so a book leaves the disk
 * with the last vault that lets it go. Where a link can't be made (another disk), the files are cloned
 * or copied. A book keeps its id in every vault, so what points at it (sources, links) means the same. */
import { constants, copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJson } from "../fs.ts";
import { currentVault, stillOpen } from "../vault/current.ts";
import { listVaults, type VaultEntry, vaultPath } from "../vault/vaults.ts";
import { bookDir, bookFolder, booksChanged, createBookDir, getBook, onBooksChange } from "./store.ts";
import type { Book } from "./types.ts";

/** What a book's folder holds that is the book itself (besides its file), the same in every vault. */
const OWN = ["book.json", "pages.json", "markdown.json", "blocks.json", "assets", "text"];

/** Links `from` at `to` (a file), unless they are one file already; copies it where a link can't be made. */
function linkFile(from: string, to: string) {
  try {
    const a = statSync(from);
    const b = statSync(to);
    if (a.ino === b.ino && a.dev === b.dev) return;
  } catch {}
  rmSync(to, { recursive: true, force: true });
  mkdirSync(dirname(to), { recursive: true });
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to, constants.COPYFILE_FICLONE);
  }
}

/** Makes `to` hold what `from` holds (a file, or a folder of them), linked. Nothing at `from`: `to` is
 * left as it is (a book's text, say, written later). */
function linkTree(from: string, to: string) {
  if (!existsSync(from)) return;
  if (!statSync(from).isDirectory()) return linkFile(from, to);
  if (existsSync(to) && !statSync(to).isDirectory()) rmSync(to, { force: true });
  mkdirSync(to, { recursive: true });
  const names = new Set(readdirSync(from));
  for (const name of readdirSync(to)) if (!names.has(name)) rmSync(join(to, name), { recursive: true, force: true });
  for (const name of names) linkTree(join(from, name), join(to, name));
}

/** Gives the book folder `to` the book's own files from the book folder `from`. */
function linkBook(from: string, to: string, book: Book) {
  mkdirSync(to, { recursive: true });
  for (const name of [...OWN, book.file]) linkTree(join(from, name), join(to, name));
}

/** The books in a vault's library, by id: the folder each is in, and the book. */
function booksIn(vault: VaultEntry): Map<string, { dir: string; book: Book }> {
  const out = new Map<string, { dir: string; book: Book }>();
  const library = join(vaultPath(vault), "library");
  if (!existsSync(library)) return out;
  for (const name of readdirSync(library)) {
    const book = readJson<Book | null>(join(library, name, "book.json"), null);
    if (book?.id && !out.has(book.id)) out.set(book.id, { dir: join(library, name), book });
  }
  return out;
}

/** The other vaults, with the books each has. */
const others = () =>
  listVaults()
    .filter((v) => v.id !== currentVault().id)
    .map((vault) => ({ vault, books: booksIn(vault) }));

/** The names of the other vaults that have a book. */
export function vaultsWith(bookId: string): string[] {
  return others()
    .filter((o) => o.books.has(bookId))
    .map((o) => o.vault.name);
}

/** The names of the other vaults that have each book, by book id (for the library). */
export function elsewhereById(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { vault, books } of others())
    for (const id of books.keys()) out.set(id, [...(out.get(id) || []), vault.name]);
  return out;
}

export interface BookElsewhere {
  book: Book;
  /** The vaults that have it. */
  vaults: string[];
}

/** The books other vaults have that this one doesn't (ready ones), with the vaults that have them. */
export function booksElsewhere(): BookElsewhere[] {
  const found = new Map<string, BookElsewhere>();
  for (const { vault, books } of others()) {
    for (const [id, { book }] of books) {
      if (book.status !== "ready" || bookFolder(id)) continue;
      const entry = found.get(id) || { book, vaults: [] };
      entry.vaults.push(vault.name);
      found.set(id, entry);
    }
  }
  return [...found.values()].sort((a, b) => a.book.title.localeCompare(b.book.title));
}

/** Where another vault keeps a book (the first that has it, ready). */
function holderOf(bookId: string, except?: string) {
  for (const { vault, books } of others()) {
    if (vault.id === except) continue;
    const held = books.get(bookId);
    if (held && held.book.status === "ready") return held;
  }
  return null;
}

/** Puts a book another vault has into the open one, as the same book: its files are linked, not copied.
 * Returns it (or the open vault's own, if it has it already). */
export function bringBook(bookId: string): Book {
  const mine = getBook(bookId);
  if (mine) return mine;
  const held = holderOf(bookId);
  if (!held) throw new Error("No other vault has that book.");
  const dir = createBookDir(bookId, held.dir.split(/[\\/]/).pop() || held.book.title);
  linkBook(held.dir, dir, held.book);
  booksChanged(bookId);
  return getBook(bookId)!;
}

/** The book whose file has this hash (Book.sha256), in the open vault or another one, ready. */
export function bookWithFile(sha256: string): { book: Book; here: boolean } | null {
  for (const vault of [currentVault(), ...listVaults().filter((v) => v.id !== currentVault().id)]) {
    for (const { book } of booksIn(vault).values())
      if (book.sha256 === sha256 && book.status === "ready") return { book, here: vault.id === currentVault().id };
  }
  return null;
}

/** Puts books into a vault that isn't open (one just made), from the vaults that have them. Returns how
 * many it took. */
export function shareInto(target: VaultEntry, bookIds: string[]): number {
  const library = join(vaultPath(target), "library");
  const taken = new Set([...booksIn(target).values()].map((b) => b.dir.split(/[\\/]/).pop()));
  let count = 0;
  for (const id of new Set(bookIds)) {
    const here = getBook(id);
    const held = here ? { dir: bookDir(id), book: here } : holderOf(id, target.id);
    if (held?.book.status !== "ready") continue;
    const base = held.dir.split(/[\\/]/).pop() || id;
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    taken.add(name);
    linkBook(held.dir, join(library, name), held.book);
    count++;
  }
  return count;
}

/** After a book changed in the open vault (its chapters found, its title set), the other vaults that
 * have it are given its new files. */
function spread(bookId: string) {
  const book = getBook(bookId);
  if (book?.status !== "ready") return;
  const from = bookDir(bookId);
  for (const { books } of others()) {
    const held = books.get(bookId);
    if (held) linkBook(from, held.dir, book);
  }
}

onBooksChange((bookId) => {
  // only the open vault's own changes (not late work of a vault that was closed)
  if (!stillOpen()) return;
  try {
    spread(bookId);
  } catch (error) {
    console.warn(`[books] could not give the other vaults ${bookId}'s new files: ${(error as Error).message}`);
  }
});
