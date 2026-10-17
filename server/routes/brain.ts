/* Routes for the second brain as a whole: today's plan, the learning journey, the knowledge graph,
 * search, and the app-wide event stream. (Questions to the vault go to the agent: routes/agents.ts.) */
import type { Hono } from "hono";
import { eventStream } from "../http.ts";
import { knowledgeGraph } from "../learn/graph.ts";
import { journey, today } from "../learn/journey.ts";
import { search } from "../learn/search.ts";

export function brainRoutes(app: Hono) {
  app.get("/api/today", (c) => c.json(today()));
  app.get("/api/journey", (c) => c.json(journey()));
  app.get("/api/graph", (c) => c.json(knowledgeGraph(c.req.query("vault"))));
  app.get("/api/search", (c) => c.json(search(c.req.query("q") || "")));

  app.get("/api/events", (c) => eventStream(c, "global"));
}
