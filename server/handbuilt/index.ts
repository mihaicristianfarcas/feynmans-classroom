/* Hand-built demos: for what the declarative figure kinds can't show, Codex writes a custom demo.js
 * in a sandboxed workspace, checks it in Node and in Chrome, and fixes what fails (minutes per demo,
 * Codex only). This module plans a chapter's demos, queues their builds, and resumes builds that a
 * restart interrupted; build.ts runs one build. */
import { join } from "node:path";
import { chapterAt } from "../books/locate.ts";
import { anchorFor } from "../books/placement.ts";
import { bookDir, getBook, getDemo, listBooks, listDemos, newId, saveDemo } from "../books/store.ts";
import type { Book, Brief, Demo, TocEntry } from "../books/types.ts";
import { GENERATION } from "../config.ts";
import { publish } from "../events.ts";
import { chapterText, findChapter } from "../ingest/index.ts";
import { queue } from "../jobs.ts";
import { activeProvider } from "../settings.ts";
import { buildDemo, resetWorkspace } from "./build.ts";
import { planChapter } from "./plan.ts";

function createDemo(book: Book, chapter: TocEntry, brief: Brief, source: Demo["source"]): Demo {
  const now = new Date().toISOString();
  const anchor = anchorFor(book, chapter, brief);
  if (anchor.matched) chapter = chapterAt(book, anchor)?.entry || chapter;
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
  return queue.add({ bookId: demo.bookId, kind: "build", demoId: demo.id, chapterId: demo.chapterId }, (_job, signal) =>
    buildDemo(demo.id, demo.bookId, signal),
  );
}

/** Plans a chapter with Codex, then queues one build per planned demo. */
export function generateChapter(bookId: string, chapterId: string, options: { count?: number } = {}) {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const chapter = findChapter(book, chapterId);
  if (!chapter) throw new Error("chapter not found");
  const existing = listDemos(bookId).filter((demo) => demo.chapterId === chapterId);
  return queue.add(
    { bookId, kind: "plan", chapterId, message: "Codex is reading the chapter" },
    async (job, signal) => {
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
    },
  );
}

export function regenerate(bookId: string, demoId: string, feedback?: string) {
  const demo = getDemo(bookId, demoId);
  if (!demo) throw new Error("demo not found");
  if (queue.isBusy(demoId)) throw new Error("this demo is already being built");
  resetWorkspace(demo);
  Object.assign(demo, {
    status: "queued",
    feedback: feedback?.trim() || undefined,
    threadId: undefined,
    error: undefined,
    activity: "waiting for a Codex slot",
  });
  saveDemo(demo);
  publish(bookId, { type: "demo", data: demo });
  return enqueueBuild(demo);
}

/** After a restart, demos that were mid-build go back in the queue. */
export function resumeInterrupted() {
  for (const book of listBooks()) {
    for (const demo of listDemos(book.id)) {
      if (demo.type !== "scene" && ["queued", "building", "checking", "planning"].includes(demo.status)) {
        resetWorkspace(demo);
        demo.status = "queued";
        demo.activity = "resuming after a restart";
        saveDemo(demo);
        enqueueBuild(demo);
      }
    }
  }
}

/** Hand-builds a demo.js version of a scene figure, as a new demo beside it (for what the scene kinds can't show). */
export function craftFromFigure(demo: Demo, feedback?: string) {
  if (activeProvider() !== "codex")
    throw new Error("Hand-built demos need Codex (they run in its sandbox). Switch the provider in Settings.");
  const scene = demo.scene as { hint?: string } | undefined;
  const brief = {
    ...demo.brief,
    picture:
      demo.brief.picture ||
      `As in this figure spec, but hand-crafted: ${JSON.stringify(demo.scene || {}).slice(0, 4000)}`,
    motion: demo.brief.motion || scene?.hint || "",
    controls: demo.brief.controls || "",
    readouts: demo.brief.readouts || "",
    truth: demo.brief.truth || "",
  };
  const copy: Demo = {
    ...demo,
    id: newId("d"),
    type: "code",
    scene: undefined,
    status: "queued",
    brief,
    attempts: 0,
    threadId: undefined,
    checks: undefined,
    feedback,
    createdAt: new Date().toISOString(),
    activity: "waiting for a Codex slot",
  };
  saveDemo(copy, { create: true });
  publish(copy.bookId, { type: "demo", data: copy });
  return enqueueBuild(copy);
}
