/* The margin's API: annotations of a book, follow-ups, redraws, and sending a passage to a note. */
import type { Hono } from "hono";
import type { Anchor, Annotation, AnnotationKind } from "../../shared/vault-types.ts";
import { appendToNote, bookNote } from "../learn/notes.ts";
import { getBook } from "../store.ts";
import { annotations, notes } from "../vault/index.ts";
import {
  createAnnotation,
  deleteAnnotation,
  followUp,
  getAnnotation,
  listAnnotations,
  redraw,
  retryAnnotation,
  updateAnnotation,
} from "./index.ts";

const body = async <T>(c: { req: { json: () => Promise<unknown> } }) =>
  ((await c.req.json().catch(() => ({}))) || {}) as T;

/** How a passage goes into a note: a link to it, the quote (as a callout linked to it), or the whole annotation embedded. */
export function noteMarkdown(a: Annotation, mode: "reference" | "passage" | "embed"): string {
  const book = getBook(a.bookId);
  const link = a.path.replace(/\.md$/, "");
  const where = a.anchor.page !== undefined ? `p. ${a.anchor.page}` : `¶${a.anchor.block}`;
  const short = book ? (book.title.length > 40 ? `${book.title.slice(0, 38)}…` : book.title) : "the book";
  if (mode === "reference") {
    const words = a.anchor.quote.split(/\s+/).slice(0, 8).join(" ");
    return `[[${link}|${short}, ${where}: “${words.replace(/[[\]|]/g, "")}…”]]`;
  }
  if (mode === "embed") return `![[${link}]]`;
  return `> [!quote] [[${link}|${short} · ${where}]]\n${a.anchor.quote
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}`;
}

export function registerAnnotationRoutes(app: Hono) {
  app.get("/api/books/:id/annotations", (c) => c.json(listAnnotations(c.req.param("id"))));
  app.post("/api/books/:id/annotations", async (c) => {
    const b = await body<{
      kind: AnnotationKind;
      anchor: Anchor;
      request?: string;
      color?: string;
      body?: string;
      quality?: "quick" | "careful";
      sceneKind?: string;
    }>(c);
    if (!b.anchor?.quote?.trim()) return c.json({ error: "select some text first" }, 400);
    if ((b.kind === "ask" || b.kind === "comment") && !(b.request?.trim() || b.body?.trim()))
      return c.json({ error: b.kind === "ask" ? "ask a question" : "write something" }, 400);
    return c.json(createAnnotation(c.req.param("id"), b));
  });
  app.get("/api/annotations/:id", (c) => {
    const a = getAnnotation(c.req.param("id"));
    return a ? c.json(a) : c.json({ error: "not found" }, 404);
  });
  app.patch("/api/annotations/:id", async (c) => c.json(updateAnnotation(c.req.param("id"), await body(c))));
  app.delete("/api/annotations/:id", (c) => c.json({ ok: deleteAnnotation(c.req.param("id")) }));
  app.post("/api/annotations/:id/followup", async (c) => {
    const b = await body<{ question: string }>(c);
    if (!b.question?.trim()) return c.json({ error: "ask something" }, 400);
    return c.json(await followUp(c.req.param("id"), b.question));
  });
  app.post("/api/annotations/:id/retry", (c) => c.json(retryAnnotation(c.req.param("id"))));
  app.post("/api/annotations/:id/redraw", async (c) => c.json(redraw(c.req.param("id"), await body(c))));

  /**
   * Sends a passage to a note. With an annotation id, that annotation; otherwise the selection is
   * highlighted first (so every passage a note quotes is marked in the book, and links back to it).
   * The note is the one given, or the book's reading note.
   */
  app.post("/api/books/:id/to-note", async (c) => {
    const b = await body<{
      annotationId?: string;
      anchor?: Anchor;
      noteId?: string;
      mode?: "reference" | "passage" | "embed";
      comment?: string;
    }>(c);
    const bookId = c.req.param("id");
    let a = b.annotationId ? annotations.get(b.annotationId) : undefined;
    if (!a) {
      if (!b.anchor?.quote?.trim()) return c.json({ error: "select some text first" }, 400);
      a = createAnnotation(bookId, { kind: "highlight", anchor: b.anchor });
    }
    const note = b.noteId ? notes.get(b.noteId) : bookNote(bookId);
    if (!note) return c.json({ error: "note not found" }, 404);
    const md = `${noteMarkdown(a, b.mode || "passage")}${b.comment?.trim() ? `\n\n${b.comment.trim()}` : ""}`;
    const updated = appendToNote(note.id, md);
    return c.json({ note: updated, annotation: a, markdown: md });
  });
}
