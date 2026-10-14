/* Routes for documents of any kind (notes, concepts, cards, annotations, sessions with the tutor, kept
 * figures): listing them, one with its links in and out, making, changing, adding to and deleting one,
 * its saved versions, linking an unlinked mention, and resolving [[links]]. What a kind does beyond
 * this has its own routes (an annotation's answer, a card's review, a session's note…). */
import type { Hono } from "hono";
import type { DocKind } from "../../shared/vault-types.ts";
import { readBody } from "../http.ts";
import { upsertConcept } from "../learn/concepts.ts";
import {
  appendToDoc,
  createDoc,
  type DocFilter,
  deleteDoc,
  docDetail,
  docVersion,
  docVersions,
  getDoc,
  listDocs,
  type NewDoc,
  restoreDoc,
  updateDoc,
} from "../learn/docs.ts";
import { linkMention } from "../learn/notes.ts";
import { docs } from "../vault/index.ts";
import { linkTargets, resolveLink } from "../vault/links.ts";

/** Kinds made here; annotations and sessions are made by what they come from (a selection, the tutor). */
const MADE_HERE: DocKind[] = ["note", "concept", "card", "figure"];

/** `concepts` may come as names: each becomes a concept's id (made if new). */
function conceptIds(b: NewDoc) {
  if (Array.isArray(b.concepts))
    b.concepts = b.concepts.map((x) => docs.get(x, "concept")?.id || upsertConcept({ name: x, source: b.source }).id);
  return b;
}

export function docRoutes(app: Hono) {
  app.get("/api/docs", (c) => c.json(listDocs(c.req.query() as DocFilter)));
  app.get("/api/docs/:id", (c) => {
    const doc = docs.get(c.req.param("id")) || docs.at(c.req.query("path") || "");
    return doc ? c.json(docDetail(doc)) : c.json({ error: "not found" }, 404);
  });
  app.post("/api/docs", async (c) => {
    const b = await readBody<NewDoc>(c);
    if (b.kind && !MADE_HERE.includes(b.kind)) return c.json({ error: `a ${b.kind} isn't made here` }, 400);
    return c.json(createDoc(conceptIds(b)));
  });
  app.patch("/api/docs/:id", async (c) => c.json(updateDoc(c.req.param("id"), conceptIds(await readBody<NewDoc>(c)))));
  app.post("/api/docs/:id/append", async (c) => {
    const b = await readBody<{ markdown: string }>(c);
    if (!b.markdown?.trim()) return c.json({ error: "nothing to add" }, 400);
    return c.json(appendToDoc(c.req.param("id"), b.markdown));
  });
  app.delete("/api/docs/:id", (c) => c.json({ ok: deleteDoc(c.req.param("id")) }));
  app.get("/api/docs/:id/versions", (c) => c.json(docVersions(c.req.param("id"))));
  app.get("/api/docs/:id/versions/:commit", (c) => c.json(docVersion(c.req.param("id"), c.req.param("commit"))));
  app.post("/api/docs/:id/restore", async (c) =>
    c.json(restoreDoc(c.req.param("id"), (await readBody<{ commit: string }>(c)).commit)),
  );
  app.post("/api/docs/:id/link-mention", async (c) => {
    getDoc(c.req.param("id"));
    return c.json(linkMention(c.req.param("id"), (await readBody<{ path: string }>(c)).path));
  });

  /** Everything a [[link]] can point at (for completion). */
  app.get("/api/links/targets", (c) => c.json(linkTargets()));
  /** What a [[link]] points at (with its book and place, when it is anchored in one). */
  app.get("/api/links/resolve", (c) => {
    const r = resolveLink(c.req.query("target") || "", c.req.query("sub") || undefined);
    return r ? c.json(r) : c.json({ error: "nothing by that name" }, 404);
  });
}
