/* Books and their figures, kept in the vault: one folder per book under library/, named after the
 * book (library/calculus-made-easy/) so people and agents can find it, holding book.json, the
 * original file, the extracted text and its figures. The book id (used by the API) maps to the
 * folder through book.json. A book in several vaults has the same id in each, and its own files are
 * kept once (shared.ts). */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../fs.ts";
import { vaultDir, vaultState } from "../vault/current.ts";
import type { Block, Book, Demo, PageText } from "./types.ts";

/** The open vault's library/. */
const booksDir = () => join(vaultDir(), "library");

export const newId = (prefix = "") => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const safe = (id: string) => {
  if (!/^[a-z0-9_-]{4,40}$/i.test(id)) throw new Error(`bad id: ${id}`);
  return id;
};

export function folderSlug(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/, "") || "book"
  );
}

/* ---------- where each book lives ---------- */
/** Book id → its folder's name, read from the folders when a book isn't known yet. */
const foldersOf = vaultState(() => new Map<string, string>());
function scanFolders() {
  const folders = foldersOf();
  folders.clear();
  const dir = booksDir();
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const book = readJson<Book | null>(join(dir, name, "book.json"), null);
    if (book?.id) folders.set(book.id, name);
  }
}

function freeFolder(hint: string, except?: string) {
  const base = folderSlug(hint);
  let name = base;
  for (let n = 2; existsSync(join(booksDir(), name)) && name !== except; n++) name = `${base}-${n}`;
  return name;
}

/** The folder of a book (library/<name>); an unknown id maps to a path that doesn't exist. */
export function bookDir(bookId: string) {
  safe(bookId);
  if (!foldersOf().has(bookId)) scanFolders();
  return join(booksDir(), foldersOf().get(bookId) || `.missing-${bookId}`);
}
export const demosDir = (bookId: string) => join(bookDir(bookId), "demos");
export const demoDir = (bookId: string, demoId: string) => join(demosDir(bookId), safe(demoId));
/** The book's folder name inside library/ (what agents and links see). */
export function bookFolder(bookId: string): string | null {
  if (!foldersOf().has(bookId)) scanFolders();
  return foldersOf().get(bookId) || null;
}

/** Makes the folder for a new book (or one another vault has), named after `hint` (the file name, until
 * the title is known). */
export function createBookDir(bookId: string, hint: string) {
  const name = freeFolder(hint);
  mkdirSync(join(booksDir(), name), { recursive: true });
  foldersOf().set(safe(bookId), name);
  return join(booksDir(), name);
}

/** Renames a book's folder after its title, once ingest has found it. */
export function renameBookDir(bookId: string, title: string) {
  const current = foldersOf().get(bookId);
  if (!current) return;
  const name = freeFolder(title, current);
  if (name === current) return;
  try {
    renameSync(join(booksDir(), current), join(booksDir(), name));
    foldersOf().set(bookId, name);
    booksChanged(bookId);
  } catch (error) {
    console.warn(`[store] could not rename ${current} to ${name}: ${(error as Error).message}`);
  }
}

/* ---------- books ---------- */
const bookListeners = new Set<(bookId: string) => void>();
/** Called with a book's id after it is added, saved or deleted (the link graph and the indexes follow
 * books, and the other vaults that have it get its new files). */
export function onBooksChange(fn: (bookId: string) => void) {
  bookListeners.add(fn);
  return () => bookListeners.delete(fn);
}
/** Tells the listeners a book changed. */
export const booksChanged = (bookId: string) => {
  for (const fn of bookListeners) fn(bookId);
};

export function listBooks(): Book[] {
  scanFolders();
  return [...foldersOf().values()]
    .map((name) => readJson<Book | null>(join(booksDir(), name, "book.json"), null))
    .filter((book): book is Book => !!book)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function getBook(bookId: string): Book | null {
  try {
    return readJson<Book | null>(join(bookDir(bookId), "book.json"), null);
  } catch {
    return null;
  }
}
export function saveBook(book: Book) {
  if (!bookFolder(book.id)) createBookDir(book.id, book.title);
  const dir = bookDir(book.id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, "book.json"), book);
  booksChanged(book.id);
}
/** Takes a book out of the vault (another vault that has it keeps it). */
export function deleteBook(bookId: string) {
  const dir = bookDir(bookId);
  foldersOf().delete(bookId);
  rmSync(dir, { recursive: true, force: true });
  booksChanged(bookId);
}
export const getPages = (bookId: string) => readJson<PageText[]>(join(bookDir(bookId), "pages.json"), []);
export const getBlocks = (bookId: string) => readJson<Block[]>(join(bookDir(bookId), "blocks.json"), []);
export const getMarkdown = (bookId: string) => readJson<string[]>(join(bookDir(bookId), "markdown.json"), []);

/* ---------- demos ---------- */
export function listDemos(bookId: string): Demo[] {
  const dir = demosDir(bookId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((id) => readJson<Demo | null>(join(dir, id, "demo.json"), null))
    .filter((demo): demo is Demo => !!demo)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function getDemo(bookId: string, demoId: string): Demo | null {
  try {
    return readJson<Demo | null>(join(demoDir(bookId, demoId), "demo.json"), null);
  } catch {
    return null;
  }
}
/** Writes a demo. Only creation may make its folder: a late update to a deleted demo must not bring it back. */
export function saveDemo(demo: Demo, { create = false } = {}): boolean {
  const dir = demoDir(demo.bookId, demo.id);
  if (!create && !existsSync(dir)) return false;
  mkdirSync(dir, { recursive: true });
  demo.updatedAt = new Date().toISOString();
  writeJson(join(dir, "demo.json"), demo);
  return true;
}
export function deleteDemo(bookId: string, demoId: string) {
  rmSync(demoDir(bookId, demoId), { recursive: true, force: true });
}
export function demoSource(bookId: string, demoId: string): string | null {
  const path = join(demoDir(bookId, demoId), "demo.js");
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
