/* Routes for the margin: a book's annotations, making one from a selection (a highlight, or an
 * answer a model writes), follow-up questions, redrawing a figure, and sending a passage to a note. */
import type { Hono } from "hono";
import type { Anchor, AnnotationKind } from "../../shared/vault-types.ts";
import {
  createAnnotation,
  deleteAnnotation,
  followUp,
  getAnnotation,
  listAnnotations,
  redraw,
  retryAnnotation,
  updateAnnotation,
} from "../annotations/index.ts";
import { sendToNote, type ToNoteRequest } from "../annotations/to-note.ts";
import { readBody } from "../http.ts";

export function annotationRoutes(app: Hono) {
  app.get("/api/books/:id/annotations", (c) => c.json(listAnnotations(c.req.param("id"))));
  app.post("/api/books/:id/annotations", async (c) => {
    const b = await readBody<{
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
  app.patch("/api/annotations/:id", async (c) => c.json(updateAnnotation(c.req.param("id"), await readBody(c))));
  app.delete("/api/annotations/:id", (c) => c.json({ ok: deleteAnnotation(c.req.param("id")) }));

  app.post("/api/annotations/:id/followup", async (c) => {
    const b = await readBody<{ question: string }>(c);
    if (!b.question?.trim()) return c.json({ error: "ask something" }, 400);
    return c.json(await followUp(c.req.param("id"), b.question));
  });
  app.post("/api/annotations/:id/retry", (c) => c.json(retryAnnotation(c.req.param("id"))));
  app.post("/api/annotations/:id/redraw", async (c) => c.json(redraw(c.req.param("id"), await readBody(c))));

  app.post("/api/books/:id/to-note", async (c) =>
    c.json(sendToNote(c.req.param("id"), await readBody<ToNoteRequest>(c))),
  );
}
