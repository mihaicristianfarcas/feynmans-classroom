// A synced vault's server side: the copy the learner's browser keeps in step with their folder. Files
// come in one by one (hidden ones too), are indexed and announced at once, and go when deleted; paths
// can't leave the copy; forgetting the vault deletes the copy.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-sync-"));
process.env.DATA_DIR = dir;
process.env.VAULTS_POLL_MS = "100000";

const { createApp } = await import("../server/app.ts");
const { subscribe } = await import("../server/events.ts");
const app = createApp();

const request = async (method: string, path: string, body?: BodyInit, json = true) => {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", ...(json ? { "content-type": "application/json" } : {}) },
    body,
  });
  return { status: res.status, res };
};
const call = async (method: string, path: string, body?: unknown) => {
  const { status, res } = await request(method, path, body === undefined ? undefined : JSON.stringify(body));
  // biome-ignore lint/suspicious/noExplicitAny: checked field by field
  return { status, data: (await res.json()) as any };
};
const put = (id: string, path: string, text: string) =>
  request("PUT", `/api/vaults/${id}/sync/file?path=${encodeURIComponent(path)}`, text, false).then(async (r) => ({
    status: r.status,
    // biome-ignore lint/suspicious/noExplicitAny: checked field by field
    data: (await r.res.json()) as any,
  }));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("synced vaults", () => {
  let id = "";

  it("is made with a name only, and starts empty", async () => {
    const { data } = await call("POST", "/api/vaults", { name: "Obsidian Vault", synced: true });
    id = data.id;
    expect(data).toMatchObject({ name: "Obsidian Vault", synced: true, path: "" });
    expect((await call("GET", `/api/vaults/${id}/sync`)).data).toEqual([]);
    const listed = (await call("GET", "/api/vaults")).data.find((v: { id: string }) => v.id === id);
    expect(listed).toMatchObject({ status: "ready", notes: 0 });
  });

  it("takes files in, indexes and announces them", async () => {
    const heard: unknown[] = [];
    const off = subscribe("global", (e) => e.type === "vaults" && heard.push(e.data));
    const r = await put(id, "Home.md", "# Home\n\nSee [[Ideas/Energy]].\n");
    await put(id, "Ideas/Energy.md", "# Energy\n");
    await put(id, ".obsidian/app.json", "{}");
    off();
    expect(r.data).toMatchObject({ path: "Home.md", size: 30 });
    expect(heard).toContainEqual({ vault: id, path: "Home.md", change: "added" });
    const note = (await call("GET", `/api/vaults/${id}/note?path=Home.md`)).data;
    expect(note.outgoing[0]).toMatchObject({ target: "Ideas/Energy", path: "Ideas/Energy.md" });
    const list = (await call("GET", `/api/vaults/${id}/sync`)).data.map((e: { path: string }) => e.path).sort();
    expect(list).toEqual([".obsidian/app.json", "Home.md", "Ideas/Energy.md"]);
    expect((await call("GET", "/api/vaults")).data.find((v: { id: string }) => v.id === id).obsidian).toBe(true);
  });

  it("gives files back as they are, and deletes them with folders left empty", async () => {
    const { res } = await request("GET", `/api/vaults/${id}/sync/file?path=Ideas/Energy.md`);
    expect(await res.text()).toBe("# Energy\n");
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    await call("DELETE", `/api/vaults/${id}/sync/file?path=Ideas/Energy.md`);
    expect(existsSync(join(dir, "vaults", id, "Ideas"))).toBe(false);
    const note = (await call("GET", `/api/vaults/${id}/note?path=Home.md`)).data;
    expect(note.outgoing[0].path).toBeNull();
  });

  it("keeps paths inside the copy, and only for synced vaults", async () => {
    expect((await put(id, "../outside.md", "x")).status).toBe(400);
    expect((await put(id, ".git/config", "x")).status).toBe(400);
    expect(existsSync(join(dir, "vaults", "outside.md"))).toBe(false);
    expect((await call("GET", "/api/vaults/nope/sync")).status).toBe(404);
  });

  it("deletes the copy when forgotten", async () => {
    await call("DELETE", `/api/vaults/${id}`);
    expect(existsSync(join(dir, "vaults", id))).toBe(false);
  });
});
