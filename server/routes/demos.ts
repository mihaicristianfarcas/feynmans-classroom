/* Routes for the figures in a book: listing them with their Fig numbers, drawing one for a selected
 * passage, redrawing, hand-building with Codex, and serving hand-built demo pages
 * (sandboxed: scripts run, nothing else loads). Also the runtime's reference demos and, in
 * development, figures made by scripts/try-scene.ts. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { buildDemoPage } from "../../runtime/page.mjs";
import { figOf, withFigs } from "../books/placement.ts";
import { deleteDemo, demoDir, demoSource, getBook, getDemo, listDemos } from "../books/store.ts";
import { DATA_DIR, PROD, RUNTIME_DIR } from "../config.ts";
import { publish } from "../events.ts";
import { craftFromFigure, regenerate } from "../handbuilt/index.ts";
import { readBody, sendFile } from "../http.ts";
import { queue } from "../jobs.ts";
import { figureFromSelection, regenerateFigure } from "../scene/figures.ts";

/** Hand-built demo pages may run their own inline script and nothing else: no network, no other origin. */
const PAGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; sandbox allow-scripts";

export function demoRoutes(app: Hono) {
  app.get("/api/books/:id/demos", (c) => {
    const book = getBook(c.req.param("id"));
    return book ? c.json(withFigs(book, listDemos(book.id))) : c.json([]);
  });
  app.get("/api/books/:id/jobs", (c) => c.json(queue.list(c.req.param("id"))));

  /** A figure of a selected passage. */
  app.post("/api/books/:id/visualize", async (c) => {
    const body = await readBody<{
      chapterId: string;
      text: string;
      request?: string;
      kind?: string;
      quality?: "quick" | "careful";
      page?: number;
      block?: number;
    }>(c);
    if (!body.text || body.text.trim().length < 20) return c.json({ error: "select a longer passage" }, 400);
    return c.json(figureFromSelection(c.req.param("id"), body));
  });

  app.post("/api/books/:id/demos/:demoId/regenerate", async (c) => {
    const body = await readBody<{ feedback?: string; quality?: "quick" | "careful"; fresh?: boolean }>(c);
    const demo = getDemo(c.req.param("id"), c.req.param("demoId"));
    if (!demo) return c.json({ error: "not found" }, 404);
    if (demo.type === "scene")
      return c.json(
        regenerateFigure(demo.bookId, demo.id, body.feedback, { quality: body.quality, fresh: body.fresh }),
      );
    return c.json(regenerate(demo.bookId, demo.id, body.feedback));
  });

  app.post("/api/books/:id/demos/:demoId/craft", async (c) => {
    const body = await readBody<{ feedback?: string }>(c);
    const demo = getDemo(c.req.param("id"), c.req.param("demoId"));
    if (!demo) return c.json({ error: "not found" }, 404);
    return c.json(craftFromFigure(demo, body.feedback));
  });

  app.get("/api/books/:id/demos/:demoId/scene", (c) => {
    const demo = getDemo(c.req.param("id"), c.req.param("demoId"));
    return demo?.scene ? c.json(demo.scene) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/books/:id/demos/:demoId", (c) => {
    const { id, demoId } = c.req.param();
    queue.cancelDemo(demoId);
    deleteDemo(id, demoId);
    publish(id, { type: "demo-removed", data: { id: demoId } });
    return c.json({ ok: true });
  });

  /** A hand-built demo as a standalone page, for its sandboxed iframe. */
  app.get("/api/books/:id/demos/:demoId/page", (c) => {
    const { id, demoId } = c.req.param();
    const demo = getDemo(id, demoId);
    const source = demoSource(id, demoId);
    if (!demo || !source) return c.text("not ready", 404);
    const html = buildDemoPage({
      source,
      theme: c.req.query("theme") === "dark" ? "dark" : "light",
      fig: figOf(id, demoId),
      title: demo.brief.title,
      predict: c.req.query("predict") !== "0",
    });
    return c.body(html, 200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": PAGE_CSP,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
  });

  app.get("/api/books/:id/demos/:demoId/source", (c) => {
    const { id, demoId } = c.req.param();
    const source = demoSource(id, demoId);
    return source ? c.body(source, 200, { "content-type": "text/plain; charset=utf-8" }) : c.text("not ready", 404);
  });

  /** The screenshots taken when a hand-built demo was checked. */
  app.get("/api/books/:id/demos/:demoId/shot/:name", (c) => {
    const { id, demoId, name } = c.req.param();
    if (!/^shot-(light|dark)\.png$/.test(name)) return c.json({ error: "not found" }, 404);
    const path = join(demoDir(id, demoId), name);
    return existsSync(path) ? sendFile(path, { "cache-control": "no-cache" }) : c.json({ error: "not found" }, 404);
  });

  /** The runtime's own example demos (runtime/examples), as pages. */
  app.get("/api/examples/:name", (c) => {
    const name = c.req.param("name").replace(/[^a-z0-9-]/g, "");
    const path = join(RUNTIME_DIR, "examples", `${name}.demo.js`);
    if (!existsSync(path)) return c.text("not found", 404);
    const html = buildDemoPage({
      source: readFileSync(path, "utf8"),
      theme: c.req.query("theme") === "dark" ? "dark" : "light",
      fig: "Fig 0",
    });
    return c.body(html, 200, { "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_CSP });
  });

  /** Figures generated by scripts/try-scene.ts, for the gallery (development only). */
  app.get("/api/dev/scenes", (c) => {
    if (PROD) return c.json({});
    const dir = join(DATA_DIR, "scenes-dev");
    if (!existsSync(dir)) return c.json({});
    return c.json(
      Object.fromEntries(
        readdirSync(dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(dir, f), "utf8"))]),
      ),
    );
  });
}
