import { join } from "node:path";
import { chapterRange, locateInBlocks, locateInPages } from "../anchor.ts";
import { GENERATION } from "../config.ts";
import { publish } from "../events.ts";
import { chapterText, findChapter } from "../ingest/index.ts";
import { queue } from "../jobs.ts";
import { bookDir, getBlocks, getBook, getDemo, getPages, listBooks, listDemos, newId, saveDemo } from "../store.ts";
import type { Book, Brief, Demo, Loc, TocEntry } from "../types.ts";
import { buildDemo, resetWorkspace } from "./build.ts";
import { planChapter } from "./plan.ts";

/** Resolves a brief's quote to a place in the book, preferring the chapter it belongs to. */
export function anchorFor(book: Book, chapter: TocEntry, brief: Brief): Demo["anchor"] {
  const range = chapterRange(chapter);
  if (book.format === "pdf") {
    const pages = getPages(book.id);
    const hit = locateInPages(pages, brief.anchorQuote, range, brief.page) || locateInPages(pages, brief.anchorQuote, undefined, brief.page);
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

const position = (loc: Loc) => (loc.page !== undefined ? loc.page + (loc.y ?? 0) : loc.block ?? 0);

/** Fig numbers follow reading order inside each chapter ("Fig 7.2"); computed on read, never stored. */
export function withFigs(book: Book, demos: Demo[]): Demo[] {
  const byChapter = new Map<string, Demo[]>();
  for (const demo of demos) {
    // a demo belongs to the chapter its anchor sits in
    if (demo.anchor.matched) demo.chapterId = chapterAt(book, demo.anchor)?.id || demo.chapterId;
    if (!byChapter.has(demo.chapterId)) byChapter.set(demo.chapterId, []);
    byChapter.get(demo.chapterId)!.push(demo);
  }
  for (const [chapterId, list] of byChapter) {
    const index = book.toc.findIndex((entry) => entry.id === chapterId);
    list.sort((a, b) => position(a.anchor) - position(b.anchor) || a.createdAt.localeCompare(b.createdAt));
    list.forEach((demo, i) => (demo.fig = `Fig ${index + 1}.${i + 1}`));
  }
  return demos;
}

export function figOf(bookId: string, demoId: string): string {
  const book = getBook(bookId);
  if (!book) return "Fig";
  return withFigs(book, listDemos(bookId)).find((demo) => demo.id === demoId)?.fig || "Fig";
}

/** The chapter a location falls in (a quote can land outside the chapter that was asked about). */
function chapterAt(book: Book, loc: Loc): TocEntry | null {
  const at = position(loc);
  return [...book.toc].reverse().find((entry) => position(entry.start) <= at + 1e-6) || null;
}

function createDemo(book: Book, chapter: TocEntry, brief: Brief, source: Demo["source"]): Demo {
  const now = new Date().toISOString();
  const anchor = anchorFor(book, chapter, brief);
  if (anchor.matched) chapter = chapterAt(book, anchor) || chapter;
  const demo: Demo = {
    id: newId("d"),
    bookId: book.id,
    chapterId: chapter.id,
    status: "queued",
    brief,
    anchor,
    fig: "Fig",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    source,
    activity: "waiting for a Codex slot",
  };
  saveDemo(demo, { create: true });
  publish(book.id, { type: "demo", data: demo });
  return demo;
}

export function enqueueBuild(demo: Demo) {
  return queue.add({ bookId: demo.bookId, kind: "build", demoId: demo.id, chapterId: demo.chapterId }, (job, signal) => buildDemo(demo.id, demo.bookId, signal));
}

/** Plans a chapter with Codex, then queues one build per planned demo. */
export function generateChapter(bookId: string, chapterId: string, options: { count?: number } = {}) {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const chapter = findChapter(book, chapterId);
  if (!chapter) throw new Error("chapter not found");
  const existing = listDemos(bookId).filter((demo) => demo.chapterId === chapterId);
  return queue.add({ bookId, kind: "plan", chapterId, message: "Codex is reading the chapter" }, async (job, signal) => {
    const say = (message: string) => {
      job.message = message;
      publish(bookId, { type: "job", data: job });
    };
    const text = chapterText(book, chapter, GENERATION.maxChapterChars);
    const briefs = await planChapter(book, chapter, text, {
      count: options.count,
      existing: existing.map((demo) => `${demo.brief.title}: ${demo.brief.idea}`),
      onActivity: say,
      signal,
      log: join(bookDir(bookId), "plan.jsonl"),
    });
    if (signal.aborted || !getBook(bookId)) return;
    say(`planned ${briefs.length} demos`);
    for (const brief of briefs) enqueueBuild(createDemo(book, chapter, brief, "chapter"));
  });
}

/** One demo for a passage the reader selected. */
export function visualizeSelection(bookId: string, chapterId: string, text: string) {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const chapter = findChapter(book, chapterId);
  if (!chapter) throw new Error("chapter not found");
  return queue.add({ bookId, kind: "plan", chapterId, message: "Codex is reading your selection" }, async (job, signal) => {
    const say = (message: string) => {
      job.message = message;
      publish(bookId, { type: "job", data: job });
    };
    const context = chapterText(book, chapter, Math.min(GENERATION.maxChapterChars, 30000));
    const [brief] = await planChapter(book, chapter, context, { focus: text.slice(0, 4000), onActivity: say, signal });
    if (!brief) throw new Error("no demo planned for the selection");
    if (signal.aborted || !getBook(bookId)) return;
    const demo = createDemo(book, chapter, brief, "selection");
    enqueueBuild(demo);
  });
}

export function regenerate(bookId: string, demoId: string, feedback?: string) {
  const demo = getDemo(bookId, demoId);
  if (!demo) throw new Error("demo not found");
  if (queue.isBusy(demoId)) throw new Error("this demo is already being built");
  resetWorkspace(demo);
  Object.assign(demo, { status: "queued", feedback: feedback?.trim() || undefined, threadId: undefined, error: undefined, activity: "waiting for a Codex slot" });
  saveDemo(demo);
  publish(bookId, { type: "demo", data: demo });
  return enqueueBuild(demo);
}

/** After a restart, demos that were mid-build go back in the queue. */
export function resumeInterrupted() {
  for (const book of listBooks()) {
    for (const demo of listDemos(book.id)) {
      if (["queued", "building", "checking", "planning"].includes(demo.status)) {
        resetWorkspace(demo);
        demo.status = "queued";
        demo.activity = "resuming after a restart";
        saveDemo(demo);
        enqueueBuild(demo);
      }
    }
  }
}
