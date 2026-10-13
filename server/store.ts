import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BOOKS_DIR } from "./config.ts";
import type { Block, Book, Demo, PageText } from "./types.ts";

mkdirSync(BOOKS_DIR, { recursive: true });

export const newId = (prefix = "") => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const safe = (id: string) => {
  if (!/^[a-z0-9_-]{4,40}$/i.test(id)) throw new Error(`bad id: ${id}`);
  return id;
};

export const bookDir = (bookId: string) => join(BOOKS_DIR, safe(bookId));
export const demosDir = (bookId: string) => join(bookDir(bookId), "demos");
export const demoDir = (bookId: string, demoId: string) => join(demosDir(bookId), safe(demoId));

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}
export function writeJson(path: string, value: unknown) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 1));
  renameSync(tmp, path);
}

/* ---------- books ---------- */
export function listBooks(): Book[] {
  if (!existsSync(BOOKS_DIR)) return [];
  return readdirSync(BOOKS_DIR)
    .map((id) => readJson<Book | null>(join(BOOKS_DIR, id, "book.json"), null))
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
  mkdirSync(bookDir(book.id), { recursive: true });
  writeJson(join(bookDir(book.id), "book.json"), book);
}
export function deleteBook(bookId: string) {
  rmSync(bookDir(bookId), { recursive: true, force: true });
}
export const getPages = (bookId: string) => readJson<PageText[]>(join(bookDir(bookId), "pages.json"), []);
export const getBlocks = (bookId: string) => readJson<Block[]>(join(bookDir(bookId), "blocks.json"), []);

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
