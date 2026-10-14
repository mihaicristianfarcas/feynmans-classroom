/* Starts the server: prepares the vault, picks up work a restart interrupted, keeps the indexes fresh,
 * and serves the API (and, in production, the app) on 127.0.0.1:PORT. A stop signal stops it. */
import { serve } from "@hono/node-server";
import { prepareAgents } from "./agents/index.ts";
import { resumeAnnotations } from "./annotations/index.ts";
import { createApp } from "./app.ts";
import { chromePath, PORT } from "./config.ts";
import { publish } from "./events.ts";
import { resumeInterrupted } from "./handbuilt/index.ts";
import { codexStatus } from "./llm/codex.ts";
import { resumeFigures } from "./scene/figures.ts";
import { initVault, onVaultChange } from "./vault/index.ts";
import { startIndexing } from "./vault/indexes.ts";
import { exportMissingBooks } from "./vault/library.ts";

// a stop signal (Ctrl-C, a restart, a test that is done with it) ends the server, whoever else listens
// for it: "exit" hooks then close headless Chrome and the model CLIs it started
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => process.exit(0));

// files changing in the vault (from the app, an agent, Obsidian): pages showing them reload
onVaultChange((path) => publish("global", { type: "vault", data: { path } }));
initVault();
exportMissingBooks();
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
