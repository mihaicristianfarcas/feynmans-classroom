/* Routes for the second brain as a whole: today's plan, the learning journey, the knowledge graph,
 * search, asking the vault a question (and keeping the answer), and the app-wide event stream. */
import type { Hono } from "hono";
import { eventStream, readBody } from "../http.ts";
import { askVault, saveAnswer } from "../learn/ask.ts";
import { knowledgeGraph } from "../learn/graph.ts";
import { journey, today } from "../learn/journey.ts";
import { search } from "../learn/search.ts";

export function brainRoutes(app: Hono) {
  app.get("/api/today", (c) => c.json(today()));
  app.get("/api/journey", (c) => c.json(journey()));
  app.get("/api/graph", (c) => c.json(knowledgeGraph()));
  app.get("/api/search", (c) => c.json(search(c.req.query("q") || "")));

  app.post("/api/ask", async (c) => {
    const b = await readBody<{ question: string }>(c);
    if (!b.question?.trim()) return c.json({ error: "ask a question" }, 400);
    return c.json(await askVault(b.question.trim()));
  });
  app.post("/api/ask/save", async (c) => {
    const b = await readBody<{ question: string; answer: string; sources: { path: string; quote: string }[] }>(c);
    return c.json(saveAnswer(b.question, b.answer, b.sources || []));
  });

  app.get("/api/events", (c) => eventStream(c, "global"));
}
