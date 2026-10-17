// A vault's history and connections: snapshots kept outside the folder, a note's versions across a
// rename, bringing one back, and accepting or removing a suggested connection (its `related` property).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-history-"));
process.env.DATA_DIR = join(dir, "data");
process.env.VAULTS_POLL_MS = "100000";
const root = join(dir, "Notes");
mkdirSync(join(root, ".obsidian"), { recursive: true });
writeFileSync(join(root, "Energy.md"), "---\ntags: [physics]\n---\nFirst text.\n");
writeFileSync(join(root, "Work.md"), "Work is force along a path.\n");
writeFileSync(join(root, "photo.png"), "not really a picture");

const { createApp } = await import("../server/app.ts");
const { getVault, addVault, announceChanges } = await import("../server/vaults/index.ts");
const { snapshot } = await import("../server/vaults/history.ts");
const { saveNote } = await import("../server/vaults/edit.ts");
const { listConnections } = await import("../server/vaults/connections.ts");
const { addLink, removeLink, listProperty } = await import("../server/vaults/properties.ts");
const app = createApp();

// biome-ignore lint/suspicious/noExplicitAny: the answers are checked field by field
type Json = any;
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as Json };
};

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("vault history", () => {
  const info = addVault(root);
  const vault = getVault(info.id);
  const q = (path: string) => `?path=${encodeURIComponent(path)}`;

  it("keeps notes only, outside the folder", () => {
    expect(snapshot(vault, "Opened in the app")).toBeTruthy();
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(process.env.DATA_DIR!, "vault-meta", info.id, "history.git"))).toBe(true);
  });

  it("lists a note's versions, follows a rename, and brings one back", async () => {
    announceChanges(vault.id, [saveNote(vault, "Energy.md", "---\ntags: [physics]\n---\nSecond text.\n")]);
    snapshot(vault);
    const moved = await call("POST", `/api/vaults/${info.id}/move`, { from: "Energy.md", to: "Physics/Energy" });
    expect(moved.data.path).toBe("Physics/Energy.md");
    snapshot(vault);
    const list = (await call("GET", `/api/vaults/${info.id}/versions${q("Physics/Energy.md")}`)).data;
    expect(list.length).toBeGreaterThanOrEqual(2);
    const first = list[list.length - 1];
    expect(first.path).toBe("Energy.md");
    const old = (await call("GET", `/api/vaults/${info.id}/versions/${first.commit}${q("Physics/Energy.md")}`)).data;
    expect(old.body).toBe("First text.\n");
    const back = await call("POST", `/api/vaults/${info.id}/restore`, {
      path: "Physics/Energy.md",
      commit: first.commit,
    });
    expect(back.status).toBe(200);
    expect(readFileSync(join(root, "Physics/Energy.md"), "utf8")).toContain("First text.");
    const after = (await call("GET", `/api/vaults/${info.id}/versions${q("Physics/Energy.md")}`)).data;
    expect(after[0].subject).toMatch(/Brought back/);
  });

  it("edits a list property and leaves the rest as written", () => {
    const text = "---\ntitle: 'Quoted'  # kept\ntags: [a]\n---\nBody\n";
    const linked = addLink(text, "related", "Work");
    expect(linked).toContain("title: 'Quoted' # kept\ntags: [a]\n");
    expect(listProperty(linked, "related")).toEqual(["[[Work]]"]);
    expect(addLink(linked, "related", "work")).toBe(linked);
    expect(removeLink(linked, "related", "Work")).not.toContain("related");
    expect(addLink("Just a body\n", "related", "Work")).toBe('---\nrelated:\n  - "[[Work]]"\n---\nJust a body\n');
  });

  it("accepts and removes a connection in the note's properties", async () => {
    const file = join(process.env.DATA_DIR!, "vault-meta", info.id, "connections.jsonl");
    const c = {
      id: "c1",
      from: "Physics/Energy.md",
      to: "Work",
      why: "Work is how energy moves.",
      status: "suggested",
      created: new Date().toISOString(),
    };
    writeFileSync(file, `${JSON.stringify(c)}\n`);
    expect((await call("GET", `/api/vaults/${info.id}/connections${q("Physics/Energy.md")}`)).data).toHaveLength(1);
    await call("POST", `/api/vaults/${info.id}/connections/c1/accept`);
    expect(readFileSync(join(root, "Physics/Energy.md"), "utf8")).toContain('"[[Work]]"');
    const note = (await call("GET", `/api/vaults/${info.id}/note${q("Physics/Energy.md")}`)).data;
    expect(note.outgoing.some((o: Json) => o.path === "Work.md")).toBe(true);
    await call("POST", `/api/vaults/${info.id}/move`, { from: "Physics/Energy.md", to: "Energy" });
    expect(listConnections(vault)[0].from).toBe("Energy.md");
    await call("POST", `/api/vaults/${info.id}/connections/c1/remove`);
    expect(readFileSync(join(root, "Energy.md"), "utf8")).not.toContain("Work");
    expect(listConnections(vault)[0].status).toBe("removed");
  });
});
