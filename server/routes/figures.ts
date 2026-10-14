/* Routes for figures kept in the vault (figures/*.md): drawing a new one for a note or a concept, and
 * keeping one that was drawn in a book. (Listing or deleting them is what every document does:
 * routes/docs.ts.) */
import type { Hono } from "hono";
import type { SourceRef } from "../../shared/vault-types.ts";
import { readBody } from "../http.ts";
import { keepFigure, standaloneFigure } from "../scene/figures.ts";

export function figureRoutes(app: Hono) {
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
}
