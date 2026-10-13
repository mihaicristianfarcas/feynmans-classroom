import { copyFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { bookDir, getBlocks, getPages, newId, readJson, saveBook, writeJson } from "../store.ts";
import type { Book, BookFormat, TocEntry } from "../types.ts";
import { ingestEpub } from "./epub.ts";
import { ingestPdf, pagesText } from "./pdf.ts";
import { ingestText } from "./text.ts";

export function formatOf(name: string): BookFormat | null {
  const ext = extname(name).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".epub") return "epub";
  if ([".txt", ".md", ".markdown", ".text"].includes(ext)) return "text";
  return null;
}

/** Stores an uploaded file and extracts text, outline and anchors-ready lines or blocks. */
export async function ingestBook(input: { name: string; data: Buffer } | { path: string; name?: string }): Promise<Book> {
  const name = "data" in input ? input.name : input.name || input.path;
  const format = formatOf(name);
  if (!format) throw new Error("Unsupported file. Upload a PDF, EPUB, Markdown or plain-text book.");
  const id = newId("b");
  const dir = bookDir(id);
  const ext = extname(name).toLowerCase();
  const file = `source${ext}`;
  const book: Book = {
    id,
    title: name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled",
    format,
    file,
    toc: [],
    createdAt: new Date().toISOString(),
    status: "ingesting",
  };
  saveBook(book);
  if ("data" in input) writeFileSync(join(dir, file), input.data);
  else copyFileSync(input.path, join(dir, file));

  try {
    if (format === "pdf") {
      const out = await ingestPdf(join(dir, file));
      writeJson(join(dir, "pages.json"), out.pages);
      writeJson(join(dir, "markdown.json"), out.markdown);
      Object.assign(book, { title: out.title || book.title, author: out.author, pageCount: out.pageCount, toc: out.toc, extractor: out.extractor, tocSource: out.tocSource });
    } else {
      const out = format === "epub" ? await ingestEpub(join(dir, file), join(dir, "assets"), (asset) => `/api/books/${id}/assets/${asset}`) : ingestText(join(dir, file), ext !== ".txt" && ext !== ".text");
      writeJson(join(dir, "blocks.json"), out.blocks);
      Object.assign(book, { title: out.title || book.title, author: out.author, blockCount: out.blocks.length, toc: out.toc, tocSource: format === "epub" ? "nav" : "headings" });
    }
    book.status = "ready";
  } catch (error) {
    book.status = "error";
    book.error = (error as Error).message;
  }
  saveBook(book);
  return book;
}

/** The text of one chapter, with [[page N]] or [[block N]] markers, for the planner and builder. */
export function chapterText(book: Book, entry: TocEntry, maxChars: number): string {
  if (book.format === "pdf") {
    const pages = getPages(book.id);
    const markdown = readJson<string[]>(join(bookDir(book.id), "markdown.json"), []);
    return pagesText(pages, entry.start.page ?? 1, Math.max(entry.start.page ?? 1, entry.end.page ?? entry.start.page ?? 1), maxChars, markdown, { fromY: entry.start.y, toY: entry.end.y });
  }
  const blocks = getBlocks(book.id).slice(entry.start.block ?? 0, entry.end.block ?? undefined);
  let out = "";
  for (const block of blocks) {
    const line = `\n[[block ${block.id}]] ${block.tag.startsWith("h") ? "## " : ""}${block.text}\n`;
    if (out.length + line.length > maxChars) {
      out += `${line.slice(0, Math.max(0, maxChars - out.length))}\n[[truncated]]`;
      break;
    }
    out += line;
  }
  return out;
}

/** A shorter passage around a location, for the builder's excerpt. */
export function passageAround(book: Book, loc: { page?: number; block?: number }, span = 1): string {
  if (book.format === "pdf") {
    const pages = getPages(book.id);
    const markdown = readJson<string[]>(join(bookDir(book.id), "markdown.json"), []);
    const page = loc.page ?? 1;
    return pagesText(pages, Math.max(1, page - span), Math.min(pages.length, page + span), 24000, markdown);
  }
  const blocks = getBlocks(book.id);
  const at = loc.block ?? 0;
  return blocks
    .slice(Math.max(0, at - 12 * span), at + 24 * span)
    .map((b) => `[[block ${b.id}]] ${b.text}`)
    .join("\n\n");
}

export const findChapter = (book: Book, chapterId: string) => book.toc.find((entry) => entry.id === chapterId) || null;
