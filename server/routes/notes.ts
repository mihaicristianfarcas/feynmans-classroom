/* Routes for notes: listing and the file tree, folders, one note with its links, writing, appending,
 * renaming and deleting, its saved versions, linking an unlinked mention, resolving [[links]], and
 * the connections an agent suggests between notes. */
import type { Hono } from "hono";
import type { Note } from "../../shared/vault-types.ts";
import { readBody } from "../http.ts";
import { upsertConcept } from "../learn/concepts.ts";
import { decideConnection, suggestConnections } from "../learn/connections.ts";
import {
  appendToNote,
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  linkMention,
  listNotes,
  moveFolder,
  noteDetail,
  noteTree,
  noteVersion,
  noteVersions,
  restoreNote,
  updateNote,
} from "../learn/notes.ts";
import { listConnections } from "../vault/connections.ts";
import { annotations, concepts, notes } from "../vault/index.ts";
import { linkTargets, resolveLink } from "../vault/links.ts";

export function noteRoutes(app: Hono) {
  app.get("/api/notes", (c) => c.json(listNotes(c.req.query())));
  app.get("/api/vault/tree", (c) => c.json(noteTree()));
  app.post("/api/folders", async (c) => c.json({ folder: createFolder((await readBody<{ path: string }>(c)).path) }));
  app.post("/api/folders/move", async (c) => {
    const b = await readBody<{ from: string; to: string }>(c);
    return c.json({ folder: moveFolder(b.from, b.to) });
  });
  app.post("/api/folders/delete", async (c) =>
    c.json({ notes: deleteFolder((await readBody<{ path: string }>(c)).path) }),
  );

  app.get("/api/notes/:id", (c) => {
    const note = notes.get(c.req.param("id")) || notes.byPath(c.req.query("path") || "");
    return note ? c.json(noteDetail(note)) : c.json({ error: "not found" }, 404);
  });
  app.post("/api/notes", async (c) => {
    const b = await readBody<Partial<Note> & { folder?: string; concepts?: string[] }>(c);
    const conceptIds = (b.concepts || []).map((name) => upsertConcept({ name, source: b.source }).id);
    return c.json(createNote({ ...b, concepts: conceptIds }));
  });
  app.put("/api/notes/:id", async (c) => {
    const b = await readBody<Partial<Note> & { folder?: string }>(c);
    // concepts may come as names: each becomes a concept id (made if new)
    if (b.concepts) b.concepts = b.concepts.map((x) => concepts.get(x)?.id || upsertConcept({ name: x }).id);
    return c.json(updateNote(c.req.param("id"), b));
  });
  app.post("/api/notes/:id/append", async (c) => {
    const b = await readBody<{ markdown: string }>(c);
    if (!b.markdown?.trim()) return c.json({ error: "nothing to add" }, 400);
    return c.json(appendToNote(c.req.param("id"), b.markdown));
  });
  app.delete("/api/notes/:id", (c) => c.json({ ok: deleteNote(c.req.param("id")) }));
  app.get("/api/notes/:id/versions", (c) => c.json(noteVersions(c.req.param("id"))));
  app.get("/api/notes/:id/versions/:commit", (c) => c.json(noteVersion(c.req.param("id"), c.req.param("commit"))));
  app.post("/api/notes/:id/restore", async (c) =>
    c.json(restoreNote(c.req.param("id"), (await readBody<{ commit: string }>(c)).commit)),
  );
  app.post("/api/notes/:id/link-mention", async (c) =>
    c.json(linkMention(c.req.param("id"), (await readBody<{ path: string }>(c)).path)),
  );

  /** Everything a [[link]] can point at (for completion). */
  app.get("/api/links/targets", (c) => c.json(linkTargets()));
  /** What a [[link]] points at; an annotation comes with its book and place. */
  app.get("/api/links/resolve", (c) => {
    const r = resolveLink(c.req.query("target") || "", c.req.query("sub") || undefined);
    if (!r) return c.json({ error: "nothing by that name" }, 404);
    const annotation = r.kind === "annotation" ? annotations.get(r.id) : undefined;
    return c.json({ ...r, ...(annotation ? { bookId: annotation.bookId, anchor: annotation.anchor } : {}) });
  });

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
