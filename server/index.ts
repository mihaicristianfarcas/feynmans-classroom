/* Starts the server: opens the vault that was open last (setting it up and picking up work a restart
 * interrupted), and serves the API (and, in production, the app) on 127.0.0.1:PORT. A stop signal
 * stops it. */
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { chromePath, PORT } from "./config.ts";
import { publish } from "./events.ts";
import { codexStatus } from "./llm/codex.ts";
import { onVaultChange, VaultClosed } from "./vault/index.ts";
import { openAtStart } from "./vaults.ts";

// a stop signal (Ctrl-C, a restart, a test that is done with it) ends the server, whoever else listens
// for it: "exit" hooks then close headless Chrome and the model CLIs it started
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => process.exit(0));

// work of a vault that was closed (another one was opened) stops where it next reaches for the vault;
// anything else that goes uncaught still stops the server, as it would without these
process.on("unhandledRejection", (reason) => {
  if (reason instanceof VaultClosed) return;
  throw reason;
});
process.on("uncaughtException", (error) => {
  if (error instanceof VaultClosed) return;
  console.error(error);
  process.exit(1);
});

// files changing in the vault (from the app, an agent, Obsidian): pages showing them reload
onVaultChange((path) => publish("global", { type: "vault", data: { path } }));
try {
  openAtStart();
} catch (error) {
  // jj missing, or the vault's repository couldn't be started: say what to do, without a stack trace
  console.error(`Feynman's Classroom can't start: ${(error as Error).message}`);
  process.exit(1);
}

serve({ fetch: createApp().fetch, port: PORT, hostname: process.env.HOST || "127.0.0.1" }, (info) => {
  const codex = codexStatus();
  const login = codex.loggedIn ? "logged in" : "NOT logged in (run: codex login)";
  console.log(`Feynman's Classroom API on http://${info.address}:${info.port}`);
  console.log(
    `codex: ${codex.installed ? `${codex.version}, ${login}` : "not installed"} · chrome: ${chromePath() ? "found" : "not found"}`,
  );
});
