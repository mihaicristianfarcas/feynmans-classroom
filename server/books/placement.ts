/* Where a figure sits in its book, and its number. A figure (a declarative scene or a hand-built
 * demo) is anchored to the passage its brief quotes, and numbered in reading order within the
 * chapter that passage falls in ("Fig 7.2"). */
import { figurePrefix } from "../../shared/chapters.ts";
import { chapterAt, chapterRange, locateInBlocks, locateInPages, positionOf } from "./locate.ts";
import { getBlocks, getBook, getPages, listDemos } from "./store.ts";
import type { Book, Brief, Demo, TocEntry } from "./types.ts";

/** Resolves a brief's quote to a place in the book, preferring the chapter it belongs to. */
export function anchorFor(book: Book, chapter: TocEntry, brief: Brief): Demo["anchor"] {
  const range = chapterRange(chapter);
  if (book.format === "pdf") {
    const pages = getPages(book.id);
    const hit =
      locateInPages(pages, brief.anchorQuote, range, brief.page) ||
      locateInPages(pages, brief.anchorQuote, undefined, brief.page);
    if (hit) return { ...hit.loc, quote: brief.anchorQuote, matched: true };
    const page = brief.page >= range.from && brief.page <= range.to ? brief.page : range.from;
    return { page, y: 0.1, quote: brief.anchorQuote, matched: false };
  }
  const blocks = getBlocks(book.id);
  const hit = locateInBlocks(blocks, brief.anchorQuote, range) || locateInBlocks(blocks, brief.anchorQuote);
  if (hit) return { ...hit.loc, quote: brief.anchorQuote, matched: true };
  const block = brief.page >= range.from && brief.page < range.to ? brief.page : range.from;
  return { block, quote: brief.anchorQuote, matched: false };
}

/** Fig numbers follow reading order inside each chapter ("Fig 7.2"); computed on read, never stored. */
export function withFigs(book: Book, demos: Demo[]): Demo[] {
  const byChapter = new Map<string, Demo[]>();
  for (const demo of demos) {
    // a demo belongs to the chapter its anchor sits in
    if (demo.anchor.matched) demo.chapterId = chapterAt(book, demo.anchor)?.entry.id || demo.chapterId;
    if (!byChapter.has(demo.chapterId)) byChapter.set(demo.chapterId, []);
    byChapter.get(demo.chapterId)!.push(demo);
  }
  for (const [chapterId, list] of byChapter) {
    const index = book.toc.findIndex((entry) => entry.id === chapterId);
    list.sort((a, b) => positionOf(a.anchor) - positionOf(b.anchor) || a.createdAt.localeCompare(b.createdAt));
    for (const [i, demo] of list.entries()) demo.fig = `Fig ${figurePrefix(book.toc, index)}.${i + 1}`;
  }
  return demos;
}

/** The Fig number of one demo, as the reader shows it. */
export function figOf(bookId: string, demoId: string): string {
  const book = getBook(bookId);
  if (!book) return "Fig";
  return withFigs(book, listDemos(bookId)).find((demo) => demo.id === demoId)?.fig || "Fig";
}
