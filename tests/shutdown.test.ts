// Stopping the server: SIGTERM ends it even after it has started headless Chrome (whose launcher, left
// to itself, would only close the browser and keep the server running), and Chrome goes with it.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chromePath } from "../server/config.ts";

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!chromePath())("the server", () => {
  it("stops on SIGTERM after it has started Chrome", async () => {
    const port = await freePort();
    const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, PORT: String(port), DATA_DIR: mkdtempSync(join(tmpdir(), "classroom-stop-")) },
      stdio: "ignore",
    });
    const exited = new Promise<boolean>((resolve) => server.once("exit", () => resolve(true)));
    try {
      const base = `http://127.0.0.1:${port}/`;
      for (let i = 0; i < 120; i++) {
        if (
          await fetch(`${base}api/status`).then(
            (r) => r.ok,
            () => false,
          )
        )
          break;
        await wait(250);
      }
      // drawing an animation's stills starts the server's headless Chrome
      const code =
        "import manimgx as m\n\nclass S(m.Scene):\n    def construct(self) -> None:\n        self.add(m.Square())\n";
      const posters = await fetch(`${base}api/manim/posters`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      expect(posters.status).toBe(200);
      server.kill("SIGTERM");
      expect(await Promise.race([exited, wait(10000).then(() => false)])).toBe(true);
    } finally {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
    }
  }, 90000);
});
