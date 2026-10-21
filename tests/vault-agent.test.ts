// The agent in an added vault, without a model: a stand-in agent writes into its copy of the notes, and
// its change lands in the vault folder after what the learner did meanwhile, can be undone, is refused
// when it clashes, and an answer can be kept as a note in that vault.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentRun } from "../shared/vault-types.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-agent-"));
process.env.DATA_DIR = join(dir, "data");
process.env.VAULTS_POLL_MS = "100000";
const root = join(dir, "Garden");
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "Seeds.md"), "one\ntwo\nthree\nfour\nfive\nsix\nseven\n");
writeFileSync(join(root, "photo.png"), "not really a picture");

let work: (cwd: string) => void | Promise<void> = () => {};
const prompts: string[] = [];
vi.mock("../server/llm/index.ts", () => ({
  agent: async (options: { cwd: string; prompt: string }) => {
    prompts.push(options.prompt);
    await work(options.cwd);
    return { data: { reply: "Done.", open: "Soil.md" }, ms: 1, provider: "codex", model: "stand-in" };
  },
  structured: async () => {
    throw new Error("no model in tests");
  },
  text: async () => {
    throw new Error("no model in tests");
  },
  llmLoad: () => 0,
}));

let A: typeof import("../server/agents/index.ts");
let vaultId = "";
beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  const { addVault } = await import("../server/vaults/index.ts");
  vaultId = addVault(root).id;
  A = await import("../server/agents/index.ts");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function settled(run: AgentRun): Promise<AgentRun> {
  for (let i = 0; i < 400; i++) {
    const now = A.listRuns().find((r) => r.id === run.id)!;
    if (now.status !== "running") return now;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("the run never finished");
}
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const ask = (task: string, path = "Seeds.md") => A.startRun({ task, context: { vault: vaultId, vaultPath: path } });

describe("the agent in an added vault", () => {
  it("works on a copy of the notes and lands its change after the learner's edits", async () => {
    work = (cwd) => {
      expect(existsSync(join(cwd, "photo.png"))).toBe(false);
      writeFileSync(join(cwd, "Soil.md"), "Loam and [[Seeds]].\n");
      writeFileSync(join(cwd, "Seeds.md"), read("Seeds.md").replace("seven", "seven, sown"));
    };
    const run = ask("make a note about soil");
    // the learner edits the top of the note while the agent works
    writeFileSync(join(root, "Seeds.md"), read("Seeds.md").replace("one", "one (mine)"));
    const done = await settled(run);
    expect(done.status).toBe("merged");
    expect(done.vault).toBe(vaultId);
    expect(done.files?.map((f) => `${f.change} ${f.path}`).sort()).toEqual(["A Soil.md", "M Seeds.md"]);
    expect(read("Soil.md")).toContain("Loam");
    expect(read("Seeds.md")).toContain("one (mine)");
    expect(read("Seeds.md")).toContain("seven, sown");
    expect(prompts.at(-1)).toContain('vault "Garden"');
    expect(prompts.at(-1)).toContain("Seeds.md");
    expect(A.runDiff(run.id)).toContain("+Loam and [[Seeds]].");

    A.undoRun(run.id);
    expect(existsSync(join(root, "Soil.md"))).toBe(false);
    expect(read("Seeds.md")).toContain("one (mine)");
    expect(read("Seeds.md")).not.toContain("sown");
  });

  it("refuses a change that clashes with the learner's, leaving their note alone", async () => {
    work = async (cwd) => {
      writeFileSync(join(cwd, "Seeds.md"), read("Seeds.md").replace("four", "four (agent)"));
    };
    const run = ask("rewrite line four");
    writeFileSync(join(root, "Seeds.md"), read("Seeds.md").replace("four", "four (learner)"));
    const done = await settled(run);
    expect(done.status).toBe("failed");
    expect(read("Seeds.md")).toContain("four (learner)");
    expect(read("Seeds.md")).not.toContain("<<<<");
  });

  it("keeps an answer that changed nothing as a note in the vault", async () => {
    work = () => {};
    const done = await settled(ask("what is in this note?"));
    expect(done.status).toBe("done");
    const kept = A.keepRun(done.id);
    expect(kept.kept).toBe("what is in this note.md");
    expect(read(kept.kept!)).toContain("Done.");
  });
  it("routes requests without vault context into a visible vault, with working Open and Undo", async () => {
    const { defaultVault, getVault } = await import("../server/vaults/index.ts");
    work = (cwd) => writeFileSync(join(cwd, "Soil.md"), "A summary from Today.\n");
    const done = await settled(A.startRun({ task: "Make a summary", context: { route: "#/" } }));
    expect(done).toMatchObject({ status: "merged", vault: defaultVault(), open: "Soil.md" });
    expect(getVault(done.vault!).files.get(done.open!)?.text).toContain("summary from Today");
    expect(existsSync(join(dir, "data", "vault", "notes", "Soil.md"))).toBe(false);
    A.undoRun(done.id);
    expect(getVault(done.vault!).files.has("Soil.md")).toBe(false);
  });

  it("fails a follow-up to a removed vault without an unhandled rejection", async () => {
    work = () => {};
    const first = await settled(ask("Remember this conversation"));
    (await import("../server/vaults/index.ts")).removeVault(vaultId);
    const done = await settled(A.startRun({ task: "Continue", after: first.id }));
    expect(done).toMatchObject({ status: "failed", vault: vaultId, error: "no such vault" });
    expect(done.activity).toBeUndefined();
    // Another request can still run on the remaining default vault.
    expect((await settled(A.startRun({ task: "Still there?" }))).status).toBe("done");
  });
});
