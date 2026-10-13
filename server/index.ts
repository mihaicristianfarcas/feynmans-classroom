import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { buildDemoPage } from "../runtime/page.mjs";
import { chromePath, CODEX, DATA_DIR, PORT, PROD, RUNTIME_DIR, WEB_DIST } from "./config.ts";
import { codexStatus } from "./codex.ts";
import { publish, subscribe } from "./events.ts";
import { detectChapters } from "./generate/chapters.ts";
import { enqueueBuild, figOf, generateChapter, regenerate, resumeInterrupted, withFigs } from "./generate/index.ts";
import { registerRoutes } from "./routes.ts";
import { figureFromSelection, figuresForChapter, regenerateFigure, resumeFigures } from "./scene/figures.ts";
import { activeProvider } from "./settings.ts";
import { initVault, logActivity } from "./vault/index.ts";
import { exportBook, exportMissingBooks, removeBookExport } from "./vault/library.ts";
import { formatOf, ingestBook } from "./ingest/index.ts";
import { queue } from "./jobs.ts";
import { bookDir, deleteBook, deleteDemo, demoDir, demoSource, getBlocks, getBook, getDemo, listBooks, listDemos, newId, saveDemo } from "./store.ts";

const app = new Hono();
const MAX_UPLOAD = 200 * 1024 * 1024;
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendFile(path: string, extraHeaders: Record<string, string> = {}) {
  const size = statSync(path).size;
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(stream, { headers: { "content-type": TYPES[extname(path).toLowerCase()] || "application/octet-stream", "content-length": String(size), ...extraHeaders } });
}
const within = (base: string, rel: string) => {
  const full = resolve(base, normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ""));
  return full.startsWith(resolve(base)) ? full : null;
};

app.onError((error, c) => {
  console.error("[api]", error);
  return c.json({ error: error.message }, 400);
});

/* ---------- status ---------- */
app.get("/api/status", (c) => c.json({ codex: codexStatus(), chrome: !!chromePath(), queue: queue.stats(), concurrency: CODEX.concurrency }));

/* ---------- books ---------- */
app.get("/api/books", (c) =>
  c.json(
    listBooks().map((book) => {
      const demos = listDemos(book.id);
      return { ...book, demoCount: demos.filter((d) => d.status === "ready").length, building: demos.filter((d) => !["ready", "failed"].includes(d.status)).length };
    }),
  ),
);

app.post("/api/books", bodyLimit({ maxSize: MAX_UPLOAD + 1024 * 1024, onError: (c) => c.json({ error: "file too large (200 MB max)" }, 413) }), async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "send the book as multipart field 'file'" }, 400);
  if (file.size > MAX_UPLOAD) return c.json({ error: "file too large (200 MB max)" }, 413);
  if (!formatOf(file.name)) return c.json({ error: "Upload a PDF, EPUB, Markdown or plain-text book." }, 415);
  const book = await ingestBook({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
  if (book.status === "error") return c.json({ error: book.error, book }, 422);
  try {
    exportBook(book);
  } catch (error) {
    console.warn("[vault] export failed:", (error as Error).message);
  }
  logActivity({ type: "book", bookId: book.id, text: `Added ${book.title}` });
  return c.json(book);
});

app.get("/api/books/:id", (c) => {
  const book = getBook(c.req.param("id"));
  return book ? c.json(book) : c.json({ error: "not found" }, 404);
});

app.delete("/api/books/:id", (c) => {
  const id = c.req.param("id");
  queue.cancelBook(id);
  const book = getBook(id);
  if (book) removeBookExport(book);
  deleteBook(id);
  return c.json({ ok: true });
});

app.get("/api/books/:id/file", (c) => {
  const book = getBook(c.req.param("id"));
  if (!book) return c.json({ error: "not found" }, 404);
  return sendFile(join(bookDir(book.id), book.file), { "cache-control": "private, max-age=3600" });
});

app.get("/api/books/:id/blocks", (c) => c.json(getBlocks(c.req.param("id"))));

app.get("/api/books/:id/assets/*", (c) => {
  const id = c.req.param("id");
  const rel = decodeURIComponent(c.req.path.split(`/api/books/${id}/assets/`)[1] || "");
  const path = within(join(bookDir(id), "assets"), rel);
  if (!path || !existsSync(path)) return c.json({ error: "not found" }, 404);
  // book images (SVG included) are content, never code: no scripts even when opened directly
  return sendFile(path, { "cache-control": "private, max-age=86400", "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox", "x-content-type-options": "nosniff" });
});

/* ---------- demos ---------- */
app.get("/api/books/:id/demos", (c) => {
  const book = getBook(c.req.param("id"));
  return book ? c.json(withFigs(book, listDemos(book.id))) : c.json([]);
});
app.get("/api/books/:id/jobs", (c) => c.json(queue.list(c.req.param("id"))));

app.post("/api/books/:id/chapters/:chapterId/generate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { count?: number; mode?: "scene" | "code" };
  // scene figures by default (seconds each); hand-built demos on request (minutes each, Codex only)
  const job = body.mode === "code" ? generateChapter(c.req.param("id"), c.req.param("chapterId"), { count: body.count }) : figuresForChapter(c.req.param("id"), c.req.param("chapterId"), { count: body.count });
  return c.json(job);
});

app.post("/api/books/:id/detect-chapters", (c) => c.json(detectChapters(c.req.param("id"))));

app.post("/api/books/:id/visualize", async (c) => {
  const body = (await c.req.json()) as { chapterId: string; text: string; request?: string; kind?: string; quality?: "quick" | "careful"; page?: number; block?: number };
  if (!body.text || body.text.trim().length < 20) return c.json({ error: "select a longer passage" }, 400);
  return c.json(figureFromSelection(c.req.param("id"), body));
});

app.post("/api/books/:id/demos/:demoId/regenerate", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { feedback?: string; quality?: "quick" | "careful"; fresh?: boolean };
  const demo = getDemo(c.req.param("id"), c.req.param("demoId"));
  if (!demo) return c.json({ error: "not found" }, 404);
  if (demo.type === "scene") return c.json(regenerateFigure(demo.bookId, demo.id, body.feedback, { quality: body.quality, fresh: body.fresh }));
  return c.json(regenerate(c.req.param("id"), c.req.param("demoId"), body.feedback));
});

/** Hand-builds a demo.js version of a scene figure with Codex (minutes; for what the scene kinds can't express). */
app.post("/api/books/:id/demos/:demoId/craft", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { feedback?: string };
  const demo = getDemo(c.req.param("id"), c.req.param("demoId"));
  if (!demo) return c.json({ error: "not found" }, 404);
  if (activeProvider() !== "codex") return c.json({ error: "Hand-built demos need Codex (they run in its sandbox). Switch the provider in Settings." }, 400);
  const scene = demo.scene as { title?: string; caption?: string; hint?: string } | undefined;
  const brief = { ...demo.brief, picture: demo.brief.picture || `As in this figure spec, but hand-crafted: ${JSON.stringify(demo.scene || {}).slice(0, 4000)}`, motion: demo.brief.motion || scene?.hint || "", controls: demo.brief.controls || "", readouts: demo.brief.readouts || "", truth: demo.brief.truth || "" };
  const copy = { ...demo, id: newId("d"), type: "code" as const, scene: undefined, status: "queued" as const, brief, attempts: 0, threadId: undefined, checks: undefined, feedback: body.feedback, createdAt: new Date().toISOString(), activity: "waiting for a Codex slot" };
  saveDemo(copy, { create: true });
  publish(copy.bookId, { type: "demo", data: copy });
  return c.json(enqueueBuild(copy));
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

const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; sandbox allow-scripts";

app.get("/api/books/:id/demos/:demoId/page", (c) => {
  const { id, demoId } = c.req.param();
  const demo = getDemo(id, demoId);
  const source = demoSource(id, demoId);
  if (!demo || !source) return c.text("not ready", 404);
  const theme = c.req.query("theme") === "dark" ? "dark" : "light";
  const html = buildDemoPage({ source, theme, fig: figOf(id, demoId), title: demo.brief.title, predict: c.req.query("predict") !== "0" });
  return c.body(html, 200, { "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_CSP, "cache-control": "no-store", "x-content-type-options": "nosniff" });
});

app.get("/api/books/:id/demos/:demoId/source", (c) => {
  const { id, demoId } = c.req.param();
  const source = demoSource(id, demoId);
  return source ? c.body(source, 200, { "content-type": "text/plain; charset=utf-8" }) : c.text("not ready", 404);
});

app.get("/api/books/:id/demos/:demoId/shot/:name", (c) => {
  const { id, demoId, name } = c.req.param();
  if (!/^shot-(light|dark)\.png$/.test(name)) return c.json({ error: "not found" }, 404);
  const path = join(demoDir(id, demoId), name);
  return existsSync(path) ? sendFile(path, { "cache-control": "no-cache" }) : c.json({ error: "not found" }, 404);
});

/* ---------- figures generated by scripts/try-scene.ts (development) ---------- */
app.get("/api/dev/scenes", (c) => {
  if (PROD) return c.json({});
  const dir = join(DATA_DIR, "scenes-dev");
  if (!existsSync(dir)) return c.json({});
  return c.json(Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(join(dir, f), "utf8"))])));
});

/* ---------- reference demos (the runtime's own examples) ---------- */
app.get("/api/examples/:name", (c) => {
  const name = c.req.param("name").replace(/[^a-z0-9-]/g, "");
  const path = join(RUNTIME_DIR, "examples", `${name}.demo.js`);
  if (!existsSync(path)) return c.text("not found", 404);
  const html = buildDemoPage({ source: readFileSync(path, "utf8"), theme: c.req.query("theme") === "dark" ? "dark" : "light", fig: "Fig 0" });
  return c.body(html, 200, { "content-type": "text/html; charset=utf-8", "content-security-policy": PAGE_CSP });
});

/* ---------- live updates ---------- */
app.get("/api/books/:id/events", (c) =>
  streamSSE(c, async (stream) => {
    const id = c.req.param("id");
    const unsubscribe = subscribe(id, (event) => {
      stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) }).catch(() => {});
    });
    // say hello at once, so proxies flush the headers and the client knows it is connected
    await stream.writeSSE({ event: "hello", data: "{}" });
    const ping = setInterval(() => stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {}), 20000);
    await new Promise<void>((done) => stream.onAbort(() => done()));
    clearInterval(ping);
    unsubscribe();
  }),
);

registerRoutes(app);

/* ---------- the web app (production build) ---------- */
if (PROD && existsSync(WEB_DIST)) {
  app.get("*", (c) => {
    const path = within(WEB_DIST, c.req.path.replace(/^\/+/, "")) || "";
    if (path && existsSync(path) && statSync(path).isFile()) return sendFile(path, path.includes("/assets/") ? { "cache-control": "public, max-age=31536000, immutable" } : {});
    return sendFile(join(WEB_DIST, "index.html"));
  });
}

initVault();
exportMissingBooks();
resumeInterrupted();
resumeFigures();
serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOST || "127.0.0.1" }, (info) => {
  const status = codexStatus();
  console.log(`Feynman's Classroom API on http://${info.address}:${info.port}`);
  console.log(`codex: ${status.installed ? `${status.version}, ${status.loggedIn ? "logged in" : "NOT logged in (run: codex login)"}` : "not installed"} · chrome: ${chromePath() ? "found" : "not found"}`);
});
