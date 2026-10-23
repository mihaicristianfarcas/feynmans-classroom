/* Routes for concepts, the nodes of the knowledge graph: listing them with mastery, one concept's
 * page (its cards, notes and related concepts), what some concepts build on, extracting a chapter's
 * concepts with a model, and having one propose what concepts without builds-on links build on.
 * (Making, changing or deleting one is what every document does: routes/docs.ts.) */
import type { Hono } from "hono";
import { publish } from "../events.ts";
import { readBody } from "../http.ts";
import { suggestBuildsOn } from "../learn/builds-on.ts";
import { conceptDetail, foundations, listConcepts } from "../learn/concept-views.ts";
import { extractConcepts } from "../learn/concepts.ts";
import { docs } from "../vault/index.ts";

export function conceptRoutes(app: Hono) {
  app.get("/api/concepts", (c) => c.json(listConcepts()));
  /** What the concepts named in the body build on, weakest first. */
  app.post("/api/concepts/foundations", async (c) =>
    c.json(foundations((await readBody<{ concepts?: string[] }>(c)).concepts || [])),
  );
  /** Answers once the model has read the concepts: the builds-on links it proposes. */
  app.post("/api/concepts/builds-on/suggest", async (c) => c.json(await suggestBuildsOn()));
  app.get("/api/concepts/:id", (c) => {
    const concept = docs.get(c.req.param("id"), "concept");
    return concept ? c.json(conceptDetail(concept)) : c.json({ error: "not found" }, 404);
  });

  app.post("/api/books/:id/chapters/:chapterId/concepts", async (c) => {
    const list = await extractConcepts(c.req.param("id"), c.req.param("chapterId"));
    publish("global", { type: "book", data: { concepts: list.length } });
    return c.json(list);
  });
}
