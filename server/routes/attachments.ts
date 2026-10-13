/* Routes for pictures in notes: saving one (pasted, dropped or captured from a page), serving it,
 * and transcribing it into Markdown (a formula as LaTeX, a table as a table). */
import { readFileSync } from "node:fs";
import type { Hono } from "hono";
import { CONTENT_ONLY, readBody } from "../http.ts";
import { transcribePicture } from "../learn/transcribe.ts";
import { attachmentPath, pictureType, saveAttachment } from "../vault/attachments.ts";

export function attachmentRoutes(app: Hono) {
  app.post("/api/attachments", async (c) => {
    const b = await readBody<{ data: string; name?: string }>(c);
    try {
      return c.json(saveAttachment(b.data, b.name));
    } catch (error) {
      const message = (error as Error).message;
      return c.json({ error: message }, message.includes("too large") ? 413 : 400);
    }
  });

  app.get("/api/vault/attachment", (c) => {
    const path = attachmentPath(c.req.query("path") || "");
    if (!path) return c.json({ error: "not found" }, 404);
    const type = pictureType(path);
    if (!type) return c.json({ error: "not a picture" }, 400);
    return new Response(readFileSync(path), {
      headers: { "content-type": type, "cache-control": "private, max-age=3600", ...CONTENT_ONLY },
    });
  });

  app.post("/api/transcribe", async (c) => {
    const path = attachmentPath((await readBody<{ path: string }>(c)).path || "");
    if (!path) return c.json({ error: "picture not found" }, 404);
    return c.json(await transcribePicture(path));
  });
}
