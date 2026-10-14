/* Annotations: what the reader made from a passage (a highlight, an explanation, a definition, an
 * answer, resources, a figure), each one a Markdown file beside the book in
 * library/<book>/annotations/, shown in the margin next to its passage.
 *
 * The file records where the passage is (page, boxes, quote with context, the place in the book's
 * Markdown), what was asked, which model answered and how long it took, and the answer itself, so a
 * person, Obsidian or an agent can read, edit, link or write one. */

import type { Anchor, Annotation, AnnotationKind } from "../../shared/vault-types.ts";
import { bookFolder, getBook } from "../books/store.ts";
import { publish } from "../events.ts";
import { annotations, changed, logActivity, now, setAnnotationBookInfo, shortId } from "../vault/index.ts";
import { chapterOf, completeAnchor } from "./anchor.ts";
import { writeAnswer } from "./answers.ts";
import { announce, forget, remember } from "./live.ts";

export { animationOf, figureBody, figureOf, followUp, redraw, resumeAnnotations } from "./answers.ts";
export { migrateHighlightNotes } from "./migrate.ts";

export const KINDS: AnnotationKind[] = ["highlight", "explain", "define", "ask", "visualize", "resources", "comment"];
const GENERATED: AnnotationKind[] = ["explain", "define", "ask", "visualize", "resources"];

setAnnotationBookInfo((bookId) => {
  const book = getBook(bookId);
  if (!book) return {};
  return {
    folder: bookFolder(bookId) || undefined,
    pdf: {
      file: book.file,
      sha256: book.sha256,
      ...(book.format === "pdf" ? { pages: book.pageCount } : { blocks: book.blockCount }),
    },
  };
});

/** A book's annotations. */
export function listAnnotations(bookId: string): Annotation[] {
  const list = annotations.list().filter((a) => a.bookId === bookId);
  list.forEach(remember);
  return list;
}

export function getAnnotation(id: string) {
  return annotations.get(id) || null;
}

export interface NewAnnotation {
  kind: AnnotationKind;
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
  if (!KINDS.includes(input.kind)) throw new Error(`unknown kind: ${input.kind}`);
  const anchor = completeAnchor(book, input.anchor);
  if (!anchor.quote) throw new Error("select some text first");
  const generated = GENERATED.includes(input.kind);
  const a: Annotation = {
    id: shortId("a"),
    kind: input.kind,
    bookId,
    path: "",
    chapterId: chapterOf(book, anchor)?.entry.id,
    anchor,
    color: input.kind === "highlight" ? input.color || "yellow" : input.color,
    request: input.request?.trim() || undefined,
    status: generated ? "pending" : "ready",
    body: input.body?.trim() || "",
    tags: [],
    // an animation is a figure drawn by ManimGX: remembered, so a retry or a restart writes one again
    ...(input.kind === "visualize" && input.sceneKind === "animation" ? { props: { engine: "manim" } } : {}),
    created: now(),
    updated: now(),
  };
  annotations.save(a);
  changed(`${a.kind} ${anchor.quote.slice(0, 40)}`);
  logActivity({
    type: input.kind === "highlight" ? "highlight" : input.kind === "visualize" ? "figure" : "note",
    bookId,
    text: `${label(a.kind)}: “${anchor.quote.slice(0, 60)}${anchor.quote.length > 60 ? "…" : ""}”`,
  });
  announce(a);
  if (generated) void writeAnswer(a, book, { quality: input.quality, sceneKind: input.sceneKind });
  return a;
}

/** Writes a failed (or unwanted) answer again. */
export function retryAnnotation(id: string): Annotation {
  const a = annotations.get(id);
  if (!a || !GENERATED.includes(a.kind)) throw new Error("nothing to write again");
  const book = getBook(a.bookId);
  if (!book) throw new Error("book not found");
  Object.assign(a, { status: "pending", error: undefined, updated: now() });
  annotations.save(a);
  announce(a);
  void writeAnswer(a, book);
  return a;
}

const label = (k: AnnotationKind) =>
  ({
    highlight: "Highlighted",
    explain: "Explained",
    define: "Defined",
    ask: "Asked",
    visualize: "Visualized",
    resources: "Resources for",
    comment: "Commented",
  })[k];

/** Edits what the reader can change on an annotation (its colour, their note, tags, title). */
export function updateAnnotation(
  id: string,
  patch: Partial<Pick<Annotation, "color" | "body" | "request" | "tags" | "title" | "kind">>,
): Annotation {
  const a = annotations.get(id);
  if (!a) throw new Error("annotation not found");
  for (const key of ["color", "body", "request", "tags", "title"] as const)
    if (patch[key] !== undefined) (a as unknown as Record<string, unknown>)[key] = patch[key];
  // a highlight can become a comment (and back) when the reader writes on it
  if (patch.kind && ["highlight", "comment"].includes(patch.kind) && ["highlight", "comment"].includes(a.kind))
    a.kind = patch.kind;
  a.updated = now();
  annotations.save(a);
  changed(`annotation ${a.id}`);
  announce(a);
  return a;
}

/** Deletes an annotation (its file goes to .trash/). */
export function deleteAnnotation(id: string) {
  const a = annotations.get(id);
  if (!a) return false;
  annotations.remove(id);
  forget(a.path);
  changed(`delete ${a.kind} ${a.id}`);
  publish(a.bookId, { type: "annotation-removed", data: { id } });
  return true;
}
