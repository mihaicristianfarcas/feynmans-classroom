/* Routes for the app's state and setup: what's installed (/api/status), the learner's profile, the
 * provider and model settings, and the vault's counts and history. */
import type { Hono } from "hono";
import { CODEX, chromePath } from "../config.ts";
import { readBody } from "../http.ts";
import { queue } from "../jobs.ts";
import { claudeStatus } from "../llm/claude.ts";
import { codexStatus } from "../llm/codex.ts";
import { llmLoad } from "../llm/index.ts";
import { activeProvider, getSettings, saveSettings } from "../settings.ts";
import { getProfile, saveProfile, vaultHistory, vaultStats } from "../vault/index.ts";

export function settingsRoutes(app: Hono) {
  app.get("/api/status", (c) =>
    c.json({ codex: codexStatus(), chrome: !!chromePath(), queue: queue.stats(), concurrency: CODEX.concurrency }),
  );

  app.get("/api/profile", (c) => c.json(getProfile()));
  app.put("/api/profile", async (c) => c.json(saveProfile(await readBody(c))));

  app.get("/api/settings", (c) => {
    const settings = getSettings();
    return c.json({
      settings,
      active: activeProvider(settings),
      codex: codexStatus(),
      claude: claudeStatus(),
      load: llmLoad(),
    });
  });
  app.put("/api/settings", async (c) => {
    const settings = saveSettings(await readBody(c));
    return c.json({ settings, active: activeProvider(settings) });
  });

  app.get("/api/vault", (c) => c.json({ ...vaultStats(), history: vaultHistory(20) }));
}
