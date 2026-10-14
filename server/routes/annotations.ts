/* Routes for the margin: a book's annotations, making one from a selection (a highlight, or an
 * answer a model writes), follow-up questions, writing one again, redrawing a figure, and sending a
 * passage to a note. (Changing or deleting one is what every document does: routes/docs.ts.) */
import type { Hono } from "hono";
import type { Anchor, AnnotationType } from "../../shared/vault-types.ts";
import { createAnnotation, followUp, listAnnotations, redraw, retryAnnotation } from "../annotations/index.ts";
import { sendToNote, type ToNoteRequest } from "../annotations/to-note.ts";
import { readBody } from "../http.ts";

export function annotationRoutes(app: Hono) {
  app.get("/api/books/:id/annotations", (c) => c.json(listAnnotations(c.req.param("id"))));
  app.post("/api/books/:id/annotations", async (c) => {
    const b = await readBody<{
      type: AnnotationType;
      anchor: Anchor;
      request?: string;
      color?: string;
      body?: string;
      quality?: "quick" | "careful";
      sceneKind?: string;
    }>(c);
    if (!b.anchor?.quote?.trim()) return c.json({ error: "select some text first" }, 400);
    if ((b.type === "ask" || b.type === "comment") && !(b.request?.trim() || b.body?.trim()))
      return c.json({ error: b.type === "ask" ? "ask a question" : "write something" }, 400);
    return c.json(createAnnotation(c.req.param("id"), b));
  });

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
