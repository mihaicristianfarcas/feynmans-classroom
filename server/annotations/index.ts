/* Annotations: what the reader made from a passage (a highlight, an explanation, a definition, an
 * answer, resources, a figure), each one a document beside the book in library/<book>/annotations/,
 * shown in the margin next to its passage.
 *
 * Its source records where the passage is (page, boxes, quote with context, the place in the book's
 * Markdown); the file also says what was asked, which model answered and how long it took, and the
 * answer itself, so a person, Obsidian or an agent can read, edit, link or write one. Changing or
 * deleting one is what every document does (learn/docs.ts); the margin hears of it (live.ts). */

import type { Anchor, Annotation, AnnotationType } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { createDoc } from "../learn/docs.ts";
import { docs, logActivity, now } from "../vault/index.ts";
import { chapterOf, completeAnchor } from "./anchor.ts";
import { writeAnswer } from "./answers.ts";
import { announce, remember } from "./live.ts";

export { animationOf, figureBody, figureOf, followUp, redraw, resumeAnnotations } from "./answers.ts";

export const TYPES: AnnotationType[] = ["highlight", "explain", "define", "ask", "visualize", "resources", "comment"];
const GENERATED: AnnotationType[] = ["explain", "define", "ask", "visualize", "resources"];

/** A book's annotations. */
export function listAnnotations(bookId: string): Annotation[] {
  const list = docs.list("annotation").filter((a) => a.source.bookId === bookId);
  list.forEach(remember);
  return list;
}

export interface NewAnnotation {
  type: AnnotationType;
  anchor: Anchor;
  request?: string;
  color?: string;
  body?: string;
  quality?: "quick" | "careful";
  /** For figures: plot, sequence, graph, diagram, object3d (default: the model picks), or "animation"
   * for an animation (a ManimGX scene) instead of a figure. */
  sceneKind?: string;
}

/** Makes an annotation from a selection; one a model writes starts pending and is announced when ready. */
export function createAnnotation(bookId: string, input: NewAnnotation): Annotation {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  if (!TYPES.includes(input.type)) throw new Error(`unknown type: ${input.type}`);
  const anchor = completeAnchor(book, input.anchor);
  if (!anchor.quote) throw new Error("select some text first");
  const generated = GENERATED.includes(input.type);
  const a = createDoc({
    kind: "annotation",
    type: input.type,
    source: { ...anchor, bookId, chapterId: chapterOf(book, anchor)?.entry.id },
    color: input.type === "highlight" ? input.color || "yellow" : input.color,
    request: input.request?.trim() || undefined,
    status: generated ? "pending" : "ready",
    body: input.body?.trim() || "",
    // an animation is a figure drawn by ManimGX: remembered, so a retry or a restart writes one again
    ...(input.type === "visualize" && input.sceneKind === "animation" ? { props: { engine: "manim" } } : {}),
  }) as Annotation;
  logActivity({
    type: input.type === "highlight" ? "highlight" : input.type === "visualize" ? "figure" : "note",
    bookId,
    text: `${label(a.type)}: “${anchor.quote.slice(0, 60)}${anchor.quote.length > 60 ? "…" : ""}”`,
  });
  announce(a);
  if (generated) void writeAnswer(a, book, { quality: input.quality, sceneKind: input.sceneKind });
  return a;
}

/** Writes a failed (or unwanted) answer again. */
export function retryAnnotation(id: string): Annotation {
  const a = docs.get(id, "annotation");
  if (!a || !GENERATED.includes(a.type)) throw new Error("nothing to write again");
  const book = getBook(a.source.bookId);
  if (!book) throw new Error("book not found");
  Object.assign(a, { status: "pending", error: undefined, updated: now() });
  docs.save(a);
  announce(a);
  void writeAnswer(a, book);
  return a;
}

const label = (k: AnnotationType) =>
  ({
    highlight: "Highlighted",
    explain: "Explained",
    define: "Defined",
    ask: "Asked",
    visualize: "Visualized",
    resources: "Resources for",
    comment: "Commented",
  })[k];
