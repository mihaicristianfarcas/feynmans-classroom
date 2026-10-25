/* Routes for the learner's vaults: every vault with what it holds, making one (books from any vault can
 * come along), renaming and deleting one, and opening one (the open vault is closed first). */
import type { Hono } from "hono";
import { readBody } from "../http.ts";
import { renameVault } from "../vault/vaults.ts";
import { deleteVault, makeVault, openVault, vaultSummaries } from "../vaults.ts";

export function vaultRoutes(app: Hono) {
  app.get("/api/vaults", (c) => c.json(vaultSummaries()));

  app.post("/api/vaults", async (c) => {
    const { name, books } = await readBody<{ name?: string; books?: unknown }>(c);
    return c.json(makeVault(String(name ?? ""), Array.isArray(books) ? books.map(String) : []));
  });

  app.patch("/api/vaults/:id", async (c) => {
    const { name } = await readBody<{ name?: string }>(c);
    return c.json(renameVault(c.req.param("id"), String(name ?? "")));
  });

  app.delete("/api/vaults/:id", (c) => {
    deleteVault(c.req.param("id"));
    return c.json({ ok: true });
  });

  /** Opens a vault: answered once it is open (pages then load it). */
  app.post("/api/vaults/:id/open", (c) => c.json(openVault(c.req.param("id"))));
}
