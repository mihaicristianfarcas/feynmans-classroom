// Vault notes and the rest of the app: a [[link]] or an `about` property naming the app's concept puts
// the note on the concept's page and in the Brain's graph, the note's links say where they lead, [[
// completes to the app's concepts, and ⌘K search finds vault notes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-links-"));
process.env.DATA_DIR = join(dir, "data");
process.env.VAULTS_POLL_MS = "100000";
const root = join(dir, "Physics");
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "Heat engines.md"), "Carnot's limit comes from [[Entropy]]. See [[Work]].\n");
writeFileSync(join(root, "Work.md"), '---\nabout: "[[Entropy]]"\n---\nForce along a path, and flywheels.\n');
writeFileSync(join(root, "Lonely.md"), "Links to [[Nothing yet]].\n");

let app: ReturnType<typeof import("../server/app.ts").createApp>;
let vaultId = "";
let conceptId = "";

// biome-ignore lint/suspicious/noExplicitAny: the answers are checked field by field
type Json = any;
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as Json;
};

beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  app = (await import("../server/app.ts")).createApp();
  conceptId = (await call("POST", "/api/docs", { kind: "concept", title: "Entropy", body: "Disorder." })).id;
  vaultId = (await call("POST", "/api/vaults", { path: root })).id;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("vault notes in the app", () => {
  it("lists the vault notes that link to a concept on its page", async () => {
    const c = await call("GET", `/api/concepts/${conceptId}`);
    expect(c.vaultNotes.map((n: Json) => n.path).sort()).toEqual(["Heat engines.md", "Work.md"]);
  });

  it("draws them in the Brain's graph, joined to the concept", async () => {
    const g = await call("GET", "/api/graph");
    const node = g.nodes.find((n: Json) => n.id === `vnote:${vaultId}:Heat engines.md`);
    expect(node).toMatchObject({ kind: "note", vault: vaultId, path: "Heat engines.md" });
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: node.id, to: `concept:${conceptId}`, kind: "link" }),
    );
    expect(g.edges).toContainEqual(
      expect.objectContaining({ from: `vnote:${vaultId}:Work.md`, to: `concept:${conceptId}`, kind: "about" }),
    );
    expect(g.nodes.some((n: Json) => n.id === `vnote:${vaultId}:Lonely.md`)).toBe(false);
  });

  it("says where a note's links lead, and completes [[ to the app's concepts", async () => {
    const note = await call("GET", `/api/vaults/${vaultId}/note?path=${encodeURIComponent("Heat engines.md")}`);
    const entropy = note.outgoing.find((o: Json) => o.target === "Entropy");
    expect(entropy).toMatchObject({ path: null, app: { kind: "concept", title: "Entropy" } });
    expect(note.outgoing.find((o: Json) => o.target === "Work").path).toBe("Work.md");
    const targets = await call("GET", `/api/vaults/${vaultId}/targets`);
    expect(targets).toContainEqual(expect.objectContaining({ title: "Entropy", kind: "concept" }));
  });

  it("finds vault notes in the search of everything", async () => {
    const hits = await call("GET", "/api/search?q=flywheels");
    expect(hits[0]).toMatchObject({ kind: "vault", vault: vaultId, path: "Work.md", vaultName: "Physics" });
  });
});
