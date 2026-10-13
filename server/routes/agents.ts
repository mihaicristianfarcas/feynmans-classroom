/* Routes for agents that work on the vault: starting a run, its diff, and approving, discarding or
 * undoing what it changed. */
import type { Hono } from "hono";
import { approveRun, discardRun, listRuns, runDiff, startRun, undoRun } from "../agents/index.ts";
import { readBody } from "../http.ts";

export function agentRoutes(app: Hono) {
  app.get("/api/agents", (c) => c.json(listRuns()));
  app.post("/api/agents", async (c) => {
    const b = await readBody<{ task: string }>(c);
    if (!b.task?.trim()) return c.json({ error: "say what the agent should do" }, 400);
    return c.json(startRun({ task: b.task }));
  });
  app.get("/api/agents/:id/diff", (c) => c.json({ diff: runDiff(c.req.param("id")) }));
  app.post("/api/agents/:id/:action", (c) => {
    const { id, action } = c.req.param();
    if (action === "approve") return c.json(approveRun(id));
    if (action === "discard") return c.json(discardRun(id));
    if (action === "undo") return c.json(undoRun(id));
    return c.json({ error: "approve, discard or undo" }, 400);
  });
}
