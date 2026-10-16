// Removing the app's own notes (Classroom) from the Notes page: only while there are other vaults,
// nothing in the app's vault is deleted, and they come back when the last vault is removed.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-own-"));
process.env.DATA_DIR = join(dir, "data");
process.env.VAULTS_POLL_MS = "100000";
const root = join(dir, "Physics");
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "Work.md"), "Force along a path.\n");

let app: ReturnType<typeof import("../server/app.ts").createApp>;

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: checked field by field
  return { status: res.status, data: (await res.json()) as any };
};

beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  app = (await import("../server/app.ts")).createApp();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the app's own notes on the Notes page", () => {
  it("can't be removed while there is no other vault", async () => {
    expect((await call("PUT", "/api/vaults/own", { hidden: true })).status).toBe(400);
    expect((await call("GET", "/api/vaults/own")).data).toEqual({ hidden: false });
  });

  it("are removed from the page only, and come back when the last vault goes", async () => {
    const note = (await call("POST", "/api/docs", { kind: "note", title: "Entropy", body: "Disorder." })).data;
    const vault = (await call("POST", "/api/vaults", { path: root })).data;
    expect((await call("PUT", "/api/vaults/own", { hidden: true })).data).toEqual({ hidden: true });
    expect((await call("GET", "/api/vaults/own")).data).toEqual({ hidden: true });
    expect((await call("GET", `/api/docs/${note.id}`)).status).toBe(200);

    await call("DELETE", `/api/vaults/${vault.id}`);
    expect(existsSync(join(root, "Work.md"))).toBe(true);
    expect((await call("GET", "/api/vaults/own")).data).toEqual({ hidden: false });
  });
});
