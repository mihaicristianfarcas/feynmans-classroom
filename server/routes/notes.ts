/* Routes for what only notes have: the file tree and its folders, and the connections an agent
 * suggests between notes. (A note itself is a document: routes/docs.ts.) */
import type { Hono } from "hono";
import { readBody } from "../http.ts";
import { decideConnection, suggestConnections } from "../learn/connections.ts";
import { createFolder, deleteFolder, moveFolder, noteTree } from "../learn/notes.ts";
import { listConnections } from "../vault/connections.ts";

export function noteRoutes(app: Hono) {
  app.get("/api/vault/tree", (c) => c.json(noteTree()));
  app.post("/api/folders", async (c) => c.json({ folder: createFolder((await readBody<{ path: string }>(c)).path) }));
  app.post("/api/folders/move", async (c) => {
    const b = await readBody<{ from: string; to: string }>(c);
    return c.json({ folder: moveFolder(b.from, b.to) });
  });
  app.post("/api/folders/delete", async (c) =>
    c.json({ notes: deleteFolder((await readBody<{ path: string }>(c)).path) }),
  );

  app.get("/api/connections", (c) => {
    const path = c.req.query("path");
    return c.json(listConnections().filter((x) => !path || x.from === path));
  });
  app.post("/api/connections/suggest", async (c) =>
    c.json(await suggestConnections((await readBody<{ path?: string }>(c)).path || undefined)),
  );
  app.post("/api/connections/:id/:decision", (c) => {
    const decision = c.req.param("decision");
    if (decision !== "accept" && decision !== "reject" && decision !== "remove")
      return c.json({ error: "accept, reject or remove" }, 400);
    return c.json(decideConnection(c.req.param("id"), decision));
  });
}
