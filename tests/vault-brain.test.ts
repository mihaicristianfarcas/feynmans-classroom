// The Brain suggests connections in the selected vault, draws sidebar suggestions as graph edges,
// and applies decisions to the same vault. No models or learner data are used.
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-brain-"));
process.env.DATA_DIR = join(dir, "data");
let modelCalls = 0;
let suggestions = [{ from: "A.md", to: "B.md", why: "A contrasting example." }];
vi.mock("../server/llm/index.ts", () => ({
  agent: async (options: { cwd: string; prompt: string }) => {
    modelCalls++;
    expect(options.cwd).toBe(realpathSync(join(dir, "chosen")));
    expect(options.prompt).toContain("notes:");
    return {
      data: { suggestions },
      provider: "codex",
      model: "stand-in",
    };
  },
  llmLoad: () => 0,
}));
let app: ReturnType<typeof import("../server/app.ts").createApp>;
let id: string;
let other: string;
let V: typeof import("../server/vaults/index.ts");
const call = async (path: string, body?: unknown) => {
  const res = await app.request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: { host: "localhost", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  expect(res.status).toBe(200);
  return res.json();
};
beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  V = await import("../server/vaults/index.ts");
  for (const folder of ["chosen", "other"]) {
    const root = join(dir, folder);
    mkdirSync(root);
    writeFileSync(join(root, "A.md"), "An idea.");
    writeFileSync(join(root, "B.md"), "A contrasting example.");
    const info = V.addVault(root);
    if (folder === "chosen") id = info.id;
    else other = info.id;
  }
  app = (await import("../server/app.ts")).createApp();
});
afterAll(() => {
  for (const info of V.listVaults()) V.removeVault(info.id);
  rmSync(dir, { recursive: true, force: true });
});

describe("Brain connections", () => {
  it("generates suggestions without a note path from the active vault's recent notes", async () => {
    const out = (await call(`/api/vaults/${id}/connections/suggest`, {})) as {
      suggested: { id: string; from: string; to: string; status: string }[];
    };
    expect(out.suggested).toHaveLength(1);
    expect(out.suggested[0]).toMatchObject({ from: "A.md", to: "B", status: "suggested" });
    const { knowledgeGraph } = await import("../server/learn/graph.ts");
    expect(knowledgeGraph(id).edges).toContainEqual(
      expect.objectContaining({
        from: `vnote:${id}:A.md`,
        to: `vnote:${id}:B.md`,
        vault: id,
        id: out.suggested[0].id,
        kind: "suggested",
      }),
    );
    expect(knowledgeGraph(other).edges).toEqual([]);
    expect(modelCalls).toBe(1);
    await call(`/api/vaults/${id}/connections/${out.suggested[0].id}/accept`, {});
    expect(V.getVault(id).files.get("A.md")?.text).toContain('"[[B]]"');
    expect(V.getVault(other).files.get("A.md")?.text).toBe("An idea.");
    expect(knowledgeGraph(id).edges).toContainEqual(
      expect.objectContaining({ from: `vnote:${id}:A.md`, to: `vnote:${id}:B.md`, kind: "link" }),
    );
    expect(knowledgeGraph(id).edges.some((e) => e.kind === "suggested")).toBe(false);
  });

  it("includes sidebar suggestions and respects rejected decisions when suggesting again", async () => {
    suggestions = [{ from: "B.md", to: "A.md", why: "The prerequisite." }];
    const out = (await call(`/api/vaults/${id}/connections/suggest`, { path: "B.md" })) as {
      suggested: { id: string }[];
    };
    const { knowledgeGraph } = await import("../server/learn/graph.ts");
    expect(knowledgeGraph(id).edges).toContainEqual(
      expect.objectContaining({ from: `vnote:${id}:B.md`, to: `vnote:${id}:A.md`, kind: "suggested" }),
    );
    await call(`/api/vaults/${id}/connections/${out.suggested[0].id}/reject`, {});
    await call(`/api/vaults/${id}/connections/suggest`, {});
    expect(knowledgeGraph(id).edges.filter((e) => e.kind === "suggested")).toEqual([]);
  });
});
