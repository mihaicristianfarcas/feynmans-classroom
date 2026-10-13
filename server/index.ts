/* Starts the server: prepares the vault (migrating older layouts), picks up work a restart
 * interrupted, keeps the indexes fresh, and serves the API (and, in production, the app) on
 * 127.0.0.1:PORT. */
import { serve } from "@hono/node-server";
import { prepareAgents } from "./agents/index.ts";
import { migrateHighlightNotes, resumeAnnotations } from "./annotations/index.ts";
import { createApp } from "./app.ts";
import { migrateLegacyBooks } from "./books/store.ts";
import { chromePath, PORT } from "./config.ts";
import { publish } from "./events.ts";
import { resumeInterrupted } from "./handbuilt/index.ts";
import { codexStatus } from "./llm/codex.ts";
import { resumeFigures } from "./scene/figures.ts";
import { initVault, onVaultChange } from "./vault/index.ts";
import { startIndexing } from "./vault/indexes.ts";
import { exportMissingBooks } from "./vault/library.ts";

// files changing in the vault (from the app, an agent, Obsidian): pages showing them reload
onVaultChange((path) => publish("global", { type: "vault", data: { path } }));
initVault();
const moved = migrateLegacyBooks();
if (moved.length)
  console.log(`[vault] moved ${moved.length} book${moved.length === 1 ? "" : "s"} into the vault: ${moved.join(", ")}`);
exportMissingBooks();
migrateHighlightNotes();
startIndexing();
resumeAnnotations();
resumeInterrupted();
resumeFigures();
prepareAgents();

serve({ fetch: createApp().fetch, port: PORT, hostname: process.env.HOST || "127.0.0.1" }, (info) => {
  const codex = codexStatus();
  const login = codex.loggedIn ? "logged in" : "NOT logged in (run: codex login)";
  console.log(`Feynman's Classroom API on http://${info.address}:${info.port}`);
  console.log(
    `codex: ${codex.installed ? `${codex.version}, ${login}` : "not installed"} · chrome: ${chromePath() ? "found" : "not found"}`,
  );
});
