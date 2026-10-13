/* The HTTP app: the local-only guard, errors as JSON, every group of API routes, and (in production)
 * the built web app with its client-side routing. Building the app has no side effects, so tests
 * can create one; server/index.ts prepares the vault and starts listening. */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { PROD, WEB_DIST } from "./config.ts";
import { NotFound } from "./errors.ts";
import { safeJoin } from "./fs.ts";
import { localOnly, sendFile } from "./http.ts";
import { agentRoutes } from "./routes/agents.ts";
import { annotationRoutes } from "./routes/annotations.ts";
import { attachmentRoutes } from "./routes/attachments.ts";
import { bookRoutes } from "./routes/books.ts";
import { brainRoutes } from "./routes/brain.ts";
import { cardRoutes } from "./routes/cards.ts";
import { conceptRoutes } from "./routes/concepts.ts";
import { demoRoutes } from "./routes/demos.ts";
import { figureRoutes } from "./routes/figures.ts";
import { noteRoutes } from "./routes/notes.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { studyRoutes } from "./routes/study.ts";

export function createApp() {
  const app = new Hono();
  app.use("*", localOnly());
  app.onError((error, c) => {
    if (error instanceof NotFound) return c.json({ error: error.message }, 404);
    console.error("[api]", error);
    return c.json({ error: error.message }, 400);
  });

  settingsRoutes(app);
  bookRoutes(app);
  demoRoutes(app);
  annotationRoutes(app);
  noteRoutes(app);
  attachmentRoutes(app);
  conceptRoutes(app);
  cardRoutes(app);
  studyRoutes(app);
  figureRoutes(app);
  brainRoutes(app);
  agentRoutes(app);

  if (PROD && existsSync(WEB_DIST)) {
    // the built app: files by path (hashed assets cached for good), anything else is a route of the app
    app.get("*", (c) => {
      const path = safeJoin(WEB_DIST, c.req.path.replace(/^\/+/, ""));
      if (path && existsSync(path) && statSync(path).isFile())
        return sendFile(
          path,
          path.includes("/assets/") ? { "cache-control": "public, max-age=31536000, immutable" } : {},
        );
      return sendFile(join(WEB_DIST, "index.html"));
    });
  }
  return app;
}
