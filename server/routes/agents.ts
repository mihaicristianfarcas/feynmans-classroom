/* Routes for the agent: a request (with where the learner is, and the run it follows up on), the
 * runs so far, a run's diff, and approving, discarding, undoing or keeping what it did. */
import type { Hono } from "hono";
import type { AgentContext } from "../../shared/vault-types.ts";
import { approveRun, discardRun, keepRun, listRuns, runDiff, startRun, undoRun } from "../agents/index.ts";
import { readBody } from "../http.ts";

const ACTIONS = { approve: approveRun, discard: discardRun, undo: undoRun, keep: keepRun };

export function agentRoutes(app: Hono) {
  app.get("/api/agents", (c) => c.json(listRuns()));
  app.post("/api/agents", async (c) => {
    const b = await readBody<{ task: string; context?: AgentContext; after?: string; tier?: "fast" | "smart" }>(c);
    if (!b.task?.trim()) return c.json({ error: "say what the agent should do" }, 400);
    return c.json(startRun(b));
  });
  app.get("/api/agents/:id/diff", (c) => c.json({ diff: runDiff(c.req.param("id")) }));
  app.post("/api/agents/:id/:action", (c) => {
    const { id, action } = c.req.param();
    const act = ACTIONS[action as keyof typeof ACTIONS];
    return act ? c.json(act(id)) : c.json({ error: "approve, discard, undo or keep" }, 400);
  });
}
