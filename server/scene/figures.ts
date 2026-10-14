/* Figures in books and in the vault.
 *
 * A figure made from a passage is a "scene demo": a demo record (anchored to the passage, shown in
 * the margin like every demo) whose content is a scene spec instead of a demo.js. It is drawn by the
 * platform, so it is ready in seconds and always in the house style. The hand-built demo pipeline
 * (server/handbuilt/) stays available for the rare figure the scene kinds can't express. */
import { join } from "node:path";
import type { Scene, SceneKind } from "../../shared/scene/types.ts";
import { validateScene } from "../../shared/scene/validate.ts";
import type { SavedFigure, SourceRef } from "../../shared/vault-types.ts";
import { anchorFor } from "../books/placement.ts";
import { bookDir, getBook, getDemo, listBooks, listDemos, newId, saveDemo } from "../books/store.ts";
import type { Book, Brief, Demo, TocEntry } from "../books/types.ts";
import { publish } from "../events.ts";
import { findChapter, passageAround } from "../ingest/index.ts";
import { queue } from "../jobs.ts";
import { bookContext, learnerSummary } from "../learn/context.ts";
import { createDoc } from "../learn/docs.ts";
import { blankDoc, logActivity, now, shortId } from "../vault/index.ts";
import { generateScene } from "./generate.ts";

const KINDS = ["plot", "sequence", "graph", "object3d", "diagram"];
const kindOf = (k?: string): SceneKind | "auto" => (k && KINDS.includes(k) ? (k as SceneKind) : "auto");

function words(text: string, n: number) {
  return text.replace(/\s+/g, " ").trim().split(" ").slice(0, n).join(" ");
}

function pendingBrief(text: string, page: number, title: string, kind?: string): Brief {
  return {
    slug: "figure",
    eyebrow: title,
    title,
    caption: "",
    anchorQuote: words(text, 16),
    page,
    idea: text.slice(0, 600),
    picture: "",
    motion: "",
    controls: "",
    readouts: "",
    truth: "",
    predict: null,
    kind,
  };
}

function sceneBrief(scene: Scene, brief: Brief): Brief {
  // a planned figure keeps the planner's topic label; a drawn-on-request one takes the figure's title
  const planned = brief.slug !== "figure";
  return {
    ...brief,
    slug: planned
      ? brief.slug
      : scene.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 50),
    eyebrow: planned && brief.eyebrow ? brief.eyebrow : scene.title,
    title: scene.title,
    caption: scene.caption,
    predict: scene.predict,
    kind: scene.kind,
  };
}

function update(demo: Demo, patch: Partial<Demo>) {
  Object.assign(demo, patch);
  if (saveDemo(demo)) publish(demo.bookId, { type: "demo", data: demo });
}

/** Draws one scene figure for a demo record (new, or rebuilt with feedback). */
function runFigure(
  demo: Demo,
  input: { passage: string; context: string; request?: string; previous?: Scene; book: Book; chapter: TocEntry | null },
) {
  return queue.add(
    { bookId: demo.bookId, kind: "figure", demoId: demo.id, chapterId: demo.chapterId, message: "drawing the figure" },
    async (_job, signal) => {
      let last = 0;
      const activity = (text: string) => {
        if (Date.now() - last < 600) return;
        last = Date.now();
        update(demo, { activity: text });
      };
      update(demo, {
        status: "building",
        activity: "drawing the figure",
        attempts: (demo.attempts || 0) + 1,
        error: undefined,
        startedAt: new Date().toISOString(),
      });
      try {
        const result = await generateScene(
          {
            passage: input.passage,
            context: input.context,
            source: {
              title: input.book.title,
              author: input.book.author,
              chapter: input.chapter
                ? `${input.chapter.title}${input.chapter.subtitle ? ` — ${input.chapter.subtitle}` : ""}`
                : undefined,
            },
            request: input.request,
            // a redraw with the reader's notes may change kind ("make it 3D"); otherwise keep the one asked for
            kind: input.previous && input.request ? "auto" : kindOf(demo.kind),
            learner: learnerSummary(),
            previous: input.previous,
            tier: demo.quality === "careful" ? "smart" : "fast",
          },
          { signal, onActivity: activity, log: join(bookDir(demo.bookId), "figures.jsonl") },
        );
        if (signal.aborted || !getDemo(demo.bookId, demo.id)) return;
        update(demo, {
          status: "ready",
          type: "scene",
          scene: result.scene,
          brief: sceneBrief(result.scene, demo.brief),
          activity: undefined,
          error: undefined,
          feedback: undefined,
          ms: result.ms,
          checks: {
            node: {
              ok: true,
              errors: [],
              warnings: result.warnings,
              stats: { attempts: result.attempts, provider: result.provider, model: result.model },
            },
          },
        });
        logActivity({
          type: "figure",
          bookId: demo.bookId,
          text: `Figure: ${result.scene.title}`,
          data: { demoId: demo.id, kind: result.scene.kind, ms: result.ms },
        });
      } catch (error) {
        update(demo, { status: "failed", error: (error as Error).message, activity: undefined });
        throw error;
      }
    },
  );
}

function newSceneDemo(book: Book, chapter: TocEntry, brief: Brief, extra: Partial<Demo>): Demo {
  const anchor = anchorFor(book, chapter, brief);
  const created = now();
  const demo: Demo = {
    id: newId("d"),
    bookId: book.id,
    chapterId: chapter.id,
    status: "queued",
    type: "scene",
    brief,
    anchor,
    fig: "Fig",
    createdAt: created,
    updatedAt: created,
    attempts: 0,
    activity: "waiting to draw",
    ...extra,
  };
  saveDemo(demo, { create: true });
  publish(book.id, { type: "demo", data: demo });
  return demo;
}

/** A figure for a passage the reader selected, with their request. */
export function figureFromSelection(
  bookId: string,
  input: {
    text: string;
    chapterId: string;
    request?: string;
    kind?: string;
    quality?: "quick" | "careful";
    page?: number;
    block?: number;
  },
) {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const chapter = findChapter(book, input.chapterId) || book.toc[0];
  if (!chapter) throw new Error("the book has no chapters");
  const page =
    book.format === "pdf" ? (input.page ?? chapter.start.page ?? 1) : (input.block ?? chapter.start.block ?? 0);
  const demo = newSceneDemo(book, chapter, pendingBrief(input.text, page, "Drawing a figure", input.kind), {
    source: "selection",
    request: input.request?.trim() || undefined,
    kind: kindOf(input.kind),
    quality: input.quality || "quick",
  });
  const context = passageAround(
    book,
    book.format === "pdf" ? { page: demo.anchor.page ?? page } : { block: demo.anchor.block ?? page },
    1,
  );
  runFigure(demo, { passage: input.text, context, request: input.request, book, chapter });
  return demo;
}

/** Redraws a scene figure with the reader's notes (keeping what works). */
export function regenerateFigure(
  bookId: string,
  demoId: string,
  feedback?: string,
  options: { quality?: "quick" | "careful"; fresh?: boolean } = {},
) {
  const book = getBook(bookId);
  const demo = getDemo(bookId, demoId);
  if (!book || !demo) throw new Error("figure not found");
  if (queue.isBusy(demoId)) throw new Error("this figure is already being drawn");
  const chapter = findChapter(book, demo.chapterId);
  const context = passageAround(
    book,
    book.format === "pdf"
      ? { page: demo.anchor.page ?? demo.brief.page }
      : { block: demo.anchor.block ?? demo.brief.page },
    1,
  );
  if (options.quality) demo.quality = options.quality;
  update(demo, {
    status: "queued",
    feedback: feedback?.trim() || undefined,
    error: undefined,
    activity: "waiting to draw",
  });
  const request = feedback?.trim()
    ? `${demo.request ? `${demo.request}\n` : ""}The reader's notes on the current version: ${feedback.trim()}`
    : demo.request;
  return runFigure(demo, {
    passage: demo.brief.idea || demo.anchor.quote,
    context,
    request,
    previous: options.fresh || !demo.scene ? undefined : (demo.scene as Scene),
    book,
    chapter,
  });
}

/** A figure for the vault (a note, a concept, a flashcard), returned when drawn (and kept, unless `save` is false). */
export async function standaloneFigure(input: {
  passage: string;
  request?: string;
  kind?: string;
  quality?: "quick" | "careful";
  source?: SourceRef;
  save?: boolean;
}): Promise<SavedFigure> {
  const ctx = bookContext(input.source, 6000);
  const result = await generateScene({
    passage: input.passage,
    context: ctx.context,
    source: ctx.source,
    request: input.request,
    kind: kindOf(input.kind),
    learner: learnerSummary(),
    tier: input.quality === "careful" ? "smart" : "fast",
  });
  const fields = { title: result.scene.title, scene: result.scene, source: input.source, request: input.request };
  if (input.save === false) return Object.assign(blankDoc("figure", shortId("f"), now()), fields) as SavedFigure;
  const figure = createDoc({ kind: "figure", ...fields }) as SavedFigure;
  logActivity({
    type: "figure",
    bookId: input.source?.bookId,
    text: `Figure: ${figure.title}`,
    data: { figureId: figure.id, kind: result.scene.kind, ms: result.ms },
  });
  return figure;
}

/** Keeps a figure that was already drawn (one from a book, say) in the vault. Throws if it isn't a valid scene. */
export function keepFigure(input: {
  scene: unknown;
  title?: string;
  source?: SourceRef;
  request?: string;
}): SavedFigure {
  const check = validateScene(input.scene);
  if (!check.ok || !check.scene) throw new Error(check.errors[0] || "not a figure");
  return createDoc({
    kind: "figure",
    title: input.title || check.scene.title,
    scene: check.scene,
    source: input.source,
    request: input.request,
  }) as SavedFigure;
}

/** After a restart, scene figures that were being drawn are drawn again. */
export function resumeFigures() {
  for (const book of listBooks()) {
    for (const demo of listDemos(book.id)) {
      if (demo.type === "scene" && ["queued", "building", "checking", "planning"].includes(demo.status)) {
        try {
          regenerateFigure(book.id, demo.id, demo.feedback, { fresh: !demo.scene });
        } catch (error) {
          console.warn(`[figures] could not resume ${demo.id}: ${(error as Error).message}`);
        }
      }
    }
  }
}
