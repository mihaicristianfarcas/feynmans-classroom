/* Routes for concepts, the nodes of the knowledge graph: listing them with mastery, one concept's
 * page, editing, and extracting a chapter's concepts with a model. */
import type { Hono } from "hono";
import { publish } from "../events.ts";
import { readBody } from "../http.ts";
import { conceptDetail, listConcepts } from "../learn/concept-views.ts";
import { deleteConcept, extractConcepts, saveConcept, upsertConcept } from "../learn/concepts.ts";
import { concepts } from "../vault/index.ts";

export function conceptRoutes(app: Hono) {
  app.get("/api/concepts", (c) => c.json(listConcepts()));
  app.get("/api/concepts/:id", (c) => {
    const concept = concepts.get(c.req.param("id"));
    return concept ? c.json(conceptDetail(concept)) : c.json({ error: "not found" }, 404);
  });
  app.post("/api/concepts", async (c) => {
    const b = await readBody<{ name: string; summary?: string; body?: string; related?: string[] }>(c);
    if (!b.name?.trim()) return c.json({ error: "name the concept" }, 400);
    return c.json(upsertConcept(b));
  });
  app.put("/api/concepts/:id", async (c) => c.json(saveConcept(c.req.param("id"), await readBody(c))));
  app.delete("/api/concepts/:id", (c) => {
    deleteConcept(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/books/:id/chapters/:chapterId/concepts", async (c) => {
    const list = await extractConcepts(c.req.param("id"), c.req.param("chapterId"));
    publish("global", { type: "book", data: { concepts: list.length } });
    return c.json(list);
  });
}
