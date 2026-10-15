/* Routes for what a vault's notes have beyond their files: their versions (read one, bring it back),
 * the connections an agent suggests between them, and their part in reading (adding to a note from
 * the book, the vault notes about a book). */
import type { Hono } from "hono";
import { NotFound } from "../errors.ts";
import { readBody } from "../http.ts";
import { decideConnection, listConnections, suggestConnections } from "../vaults/connections.ts";
import { saveNote } from "../vaults/edit.ts";
import { snapshot, versionOf, versions } from "../vaults/history.ts";
import { announceChanges, getVault } from "../vaults/index.ts";
import { appendToVaultNote, vaultNotesOfBook } from "../vaults/reading.ts";
import { cleanRel, type Vault } from "../vaults/vault.ts";

/** The note named by `path` in the request, which must exist. */
function noteAt(vault: Vault, path: string | undefined) {
  const clean = cleanRel(path || "");
  const entry = clean ? vault.files.get(clean) : undefined;
  if (!clean || entry?.kind !== "note") throw new NotFound("no such note in this vault");
  return clean;
}

export function vaultNoteRoutes(app: Hono) {
  app.get("/api/vaults/:id/versions", (c) => {
    const vault = getVault(c.req.param("id"));
    return c.json(versions(vault, noteAt(vault, c.req.query("path"))));
  });
  app.get("/api/vaults/:id/versions/:commit", (c) => {
    const vault = getVault(c.req.param("id"));
    const { body, diff } = versionOf(vault, noteAt(vault, c.req.query("path")), c.req.param("commit"));
    return c.json({ body, diff });
  });
  app.post("/api/vaults/:id/restore", async (c) => {
    const vault = getVault(c.req.param("id"));
    const b = await readBody<{ path: string; commit: string }>(c);
    const path = noteAt(vault, b.path);
    const { text } = versionOf(vault, path, b.commit);
    // the text it has now stays in the history
    snapshot(vault);
    announceChanges(vault.id, [saveNote(vault, path, text)]);
    snapshot(vault, `Brought back an earlier version of ${vault.files.get(path)?.name}`);
    return c.json({ path });
  });

  app.get("/api/vaults/:id/connections", (c) => {
    const vault = getVault(c.req.param("id"));
    const path = c.req.query("path");
    return c.json(listConnections(vault).filter((x) => !path || x.from === path));
  });
  app.post("/api/vaults/:id/connections/suggest", async (c) => {
    const vault = getVault(c.req.param("id"));
    const path = noteAt(vault, (await readBody<{ path: string }>(c)).path);
    return c.json({ suggested: await suggestConnections(vault, path) });
  });
  app.post("/api/vaults/:id/connections/:cid/:decision", (c) => {
    const decision = c.req.param("decision");
    if (decision !== "accept" && decision !== "reject" && decision !== "remove")
      return c.json({ error: "accept, reject or remove" }, 400);
    return c.json(decideConnection(getVault(c.req.param("id")), c.req.param("cid"), decision));
  });

  app.post("/api/vaults/:id/append", async (c) => {
    const vault = getVault(c.req.param("id"));
    const b = await readBody<{ path: string; text: string }>(c);
    return c.json(appendToVaultNote(vault, noteAt(vault, b.path), String(b.text ?? "")));
  });
  app.get("/api/books/:id/vault-notes", (c) => c.json(vaultNotesOfBook(c.req.param("id"))));
}
