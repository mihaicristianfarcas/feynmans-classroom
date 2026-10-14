/* Routes for animations (ManimGX): the page an animation plays in (sandboxed, see server/manim/frame.ts),
 * the local mirror of what it runs on (server/manim/mirror.ts), and animations' stills (poster.ts). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { readBody, sendFile } from "../http.ts";
import { frameCsp, framePage } from "../manim/frame.ts";
import { mirrorRoutes } from "../manim/mirror.ts";
import { isPosterName, POSTERS, posterName, renderPosters } from "../manim/poster.ts";

export function manimRoutes(app: Hono) {
  /** The player page, for an animation's sandboxed frame (?mode=check: no player, for checks). */
  app.get("/api/manim/frame", async (c) =>
    c.body(await framePage(), 200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": frameCsp(`http://${c.req.header("host") || "127.0.0.1"}`),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    }),
  );
  mirrorRoutes(app);

  /** An animation's still, by the name its code gives it (see poster.ts). */
  app.get("/api/manim/poster/:name", (c) => {
    const name = c.req.param("name");
    const path = join(POSTERS, name);
    if (!isPosterName(name)) return c.json({ error: "not found" }, 404);
    // none yet: "no content" (the app asks for one to be drawn), not an error in the console
    if (!existsSync(path)) return c.body(null, 204, { "cache-control": "no-store" });
    return sendFile(path, { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" });
  });
  /** Draws an animation's stills if it has none yet (one written in a note, or before stills existed). */
  app.post("/api/manim/posters", async (c) => {
    const { code } = await readBody<{ code?: string }>(c);
    if (!code?.trim() || code.length > 100_000) return c.json({ error: "no animation" }, 400);
    const ok = await renderPosters(code);
    return c.json({ ok, light: posterName(code, "light"), dark: posterName(code, "dark") });
  });
}
