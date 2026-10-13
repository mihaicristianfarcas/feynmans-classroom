/* Routes for figures kept in the vault (figures/*.json): listing, drawing a new one for a note or a
 * concept, keeping one that was drawn in a book, and deleting. */
import type { Hono } from "hono";
import type { SourceRef } from "../../shared/vault-types.ts";
import { readBody } from "../http.ts";
import { deleteFigure, keepFigure, standaloneFigure } from "../scene/figures.ts";
import { figures } from "../vault/index.ts";

export function figureRoutes(app: Hono) {
  app.get("/api/figures", (c) => c.json(figures.list().sort((a, b) => b.created.localeCompare(a.created))));
  app.get("/api/figures/:id", (c) => {
    const f = figures.get(c.req.param("id"));
    return f ? c.json(f) : c.json({ error: "not found" }, 404);
  });
  /** With `scene`, keeps that figure; otherwise draws one for `passage` or `request`. */
  app.post("/api/figures", async (c) => {
    const b = await readBody<{
      scene?: unknown;
      title?: string;
      passage?: string;
      request?: string;
      kind?: string;
      quality?: "quick" | "careful";
      source?: SourceRef;
      save?: boolean;
    }>(c);
    if (b.scene) return c.json(keepFigure({ scene: b.scene, title: b.title, source: b.source, request: b.request }));
    if (!b.passage?.trim() && !b.request?.trim()) return c.json({ error: "say what to show" }, 400);
    return c.json(await standaloneFigure({ ...b, passage: b.passage || b.request || "" }));
  });
  app.delete("/api/figures/:id", (c) => {
    deleteFigure(c.req.param("id"));
    return c.json({ ok: true });
  });
}
