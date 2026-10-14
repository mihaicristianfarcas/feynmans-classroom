// The vault's history and the agent on Jujutsu, without a model: a stand-in agent writes into its jj
// workspace, and its change lands after what the learner did meanwhile, can be undone, is refused
// when it clashes (never leaving conflict markers in the learner's files), and several run at once.
// Runs only where jj is installed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentRun } from "../shared/vault-types.ts";

const hasJj = spawnSync(process.env.JJ_BIN || "jj", ["--version"]).status === 0;
const dir = mkdtempSync(join(tmpdir(), "classroom-agents-"));
process.env.DATA_DIR = dir;
const vault = join(dir, "vault");

// what the stand-in agent does in its working folder (set by each test), and the prompts it was given
let work: (cwd: string) => void | Promise<void> = () => {};
const prompts: string[] = [];
vi.mock("../server/llm/index.ts", () => ({
  agent: async (options: { cwd: string; prompt: string }) => {
    prompts.push(options.prompt);
    await work(options.cwd);
    return { data: { reply: "Done.", open: "" }, ms: 1, provider: "codex", model: "stand-in" };
  },
  structured: async () => {
    throw new Error("no model in tests");
  },
  text: async () => {
    throw new Error("no model in tests");
  },
  llmLoad: () => 0,
}));

let V: typeof import("../server/vault/index.ts");
let A: typeof import("../server/agents/index.ts");
let N: typeof import("../server/learn/docs.ts");
beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  A = await import("../server/agents/index.ts");
  N = await import("../server/learn/docs.ts");
});

/** Waits for a run to settle. */
async function settled(run: AgentRun): Promise<AgentRun> {
  for (let i = 0; i < 400; i++) {
    const now = A.listRuns().find((r) => r.id === run.id)!;
    if (now.status !== "running") return now;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("the run never finished");
}
const read = (rel: string) => readFileSync(join(vault, rel), "utf8");
const write = (root: string, rel: string, text: string) => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), text);
};

describe.skipIf(!hasJj)("the vault on jj", () => {
  it("is a jj repository colocated with git", () => {
    expect(existsSync(join(vault, ".jj"))).toBe(true);
    expect(existsSync(join(vault, ".git"))).toBe(true);
    expect(V.vaultIsRepo()).toBe(true);
  });

  it("keeps every version of a note, and can show an older one", () => {
    const note = N.createDoc({ title: "Replication", body: "Leaders and followers." });
    V.checkpoint();
    N.updateDoc(note.id, { body: "Leaders, followers, and lag." });
    V.checkpoint();
    const versions = V.fileHistory(note.path);
    expect(versions.length).toBe(2);
    expect(versions[0].subject).toContain("note Replication");
    expect(V.fileAt(versions[1].commit, note.path)).toContain("Leaders and followers.");
    expect(V.vaultHistory(5)[0].subject).toContain("Replication");
  });
});

describe.skipIf(!hasJj)("the agent on a jj vault", () => {
  it("lands a new note after the learner's own edits, and can take it out again", async () => {
    const mine = N.createDoc({ title: "Mine", body: "one" });
    V.checkpoint();
    work = (cwd) => {
      write(cwd, "notes/DDIA/Chapter 5 summary.md", "---\ntype: summary\n---\nA summary.\n");
      // meanwhile, the learner keeps writing
      N.updateDoc(mine.id, { body: "one\ntwo" });
    };
    const run = await settled(A.startRun({ task: "Summarise chapter 5 into my DDIA folder" }));
    expect([run.status, run.error]).toEqual(["merged", undefined]);
    expect(run.files).toEqual([{ path: "notes/DDIA/Chapter 5 summary.md", change: "A" }]);
    expect(read("notes/DDIA/Chapter 5 summary.md")).toContain("A summary.");
    expect(V.docs.at("notes/DDIA/Chapter 5 summary.md", "note")?.type).toBe("summary");
    expect(read(mine.path)).toContain("one\ntwo");
    expect(V.vaultHistory(3).map((v) => v.subject)).toContain("agent: Summarise chapter 5 into my DDIA folder");

    // later edits of other files survive the undo
    N.updateDoc(mine.id, { body: "one\ntwo\nthree" });
    const undone = A.undoRun(run.id);
    expect(undone.status).toBe("undone");
    expect(existsSync(join(vault, "notes/DDIA/Chapter 5 summary.md"))).toBe(false);
    expect(V.docs.at("notes/DDIA/Chapter 5 summary.md", "note")).toBeUndefined();
    expect(read(mine.path)).toContain("one\ntwo\nthree");
  });

  it("refuses a change that clashes with the learner's edits, leaving their file as it is", async () => {
    const note = N.createDoc({ title: "Consensus", body: "Raft\nPaxos\nZab" });
    V.checkpoint();
    work = (cwd) => {
      write(cwd, note.path, read(note.path).replace("Paxos", "Paxos (agent)"));
      N.updateDoc(note.id, { body: "Raft\nPaxos (mine)\nZab" });
    };
    const run = await settled(A.startRun({ task: "Expand my consensus note" }));
    expect(run.status).toBe("failed");
    expect(run.error).toContain("clashes");
    expect(read(note.path)).toContain("Paxos (mine)");
    expect(read(note.path)).not.toMatch(/<<<<<<<|>>>>>>>|%%%%%%%/);
  });

  it("won't undo a run whose note the learner has changed since", async () => {
    work = (cwd) => write(cwd, "notes/Quiz on lag.md", "Question one\n");
    const run = await settled(A.startRun({ task: "Make a quiz on replication lag" }));
    expect([run.status, run.error]).toEqual(["merged", undefined]);
    const quiz = V.docs.at("notes/Quiz on lag.md", "note")!;
    N.updateDoc(quiz.id, { body: "Question one, answered" });
    expect(() => A.undoRun(run.id)).toThrow(/same lines/);
    expect(read("notes/Quiz on lag.md")).toContain("answered");
    expect(read("notes/Quiz on lag.md")).not.toMatch(/<<<<<<<|>>>>>>>/);
  });

  it("works on several requests at once", async () => {
    work = async (cwd) => {
      await new Promise((r) => setTimeout(r, 50));
      write(cwd, `notes/Parallel ${prompts.length}.md`, "x\n");
    };
    const runs = await Promise.all([
      settled(A.startRun({ task: "First of two" })),
      settled(A.startRun({ task: "Second of two" })),
    ]);
    expect(runs.map((r) => r.status)).toEqual(["merged", "merged"]);
    for (const r of runs) expect(existsSync(join(vault, r.files![0].path))).toBe(true);
  });

  it("fails a run that changes the app's own files, and changes nothing", async () => {
    const guide = read("AGENTS.md");
    work = (cwd) => write(cwd, "AGENTS.md", "new rules\n");
    const run = await settled(A.startRun({ task: "Rewrite the vault's rules" }));
    expect(run.status).toBe("failed");
    expect(read("AGENTS.md")).toBe(guide);
  });

  it("holds a file it can't read back for the learner's OK", async () => {
    work = (cwd) => write(cwd, "notes/Broken.md", "---\ntitle: [unclosed\n---\nbody\n");
    const run = await settled(A.startRun({ task: "Make a broken note" }));
    expect(run.status).toBe("review");
    expect(existsSync(join(vault, "notes/Broken.md"))).toBe(false);
    expect(A.discardRun(run.id).status).toBe("discarded");
  });

  it("answers without changing anything, keeps the answer on request, and remembers the conversation", async () => {
    work = () => {};
    const first = await settled(A.startRun({ task: "What is replication lag?", context: { route: "#/review" } }));
    expect(first.status).toBe("done");
    expect(first.where).toBe("Review");
    const kept = A.keepRun(first.id);
    expect(kept.kept && existsSync(join(vault, kept.kept))).toBe(true);
    const second = await settled(A.startRun({ task: "Shorter, please", after: first.id }));
    expect(second.thread).toBe(first.id);
    expect(prompts.at(-1)).toContain("They asked: What is replication lag?");
    expect(prompts.at(-1)).toContain("You replied: Done.");
  });

  it("tells the agent which note is open", async () => {
    const note = N.createDoc({ title: "Open one", body: "here" });
    work = () => {};
    const run = await settled(A.startRun({ task: "Fix the typos in this", context: { docId: note.id } }));
    expect(run.where).toBe("Open one");
    expect(prompts.at(-1)).toContain(`They have this note open: ${note.path}`);
  });
});
