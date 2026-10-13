/* Agents that change the vault ("turn my chapter 5 highlights into a summary note", "tidy my notes on
 * consensus into one"), with the guardrails agreed on:
 *
 *   1. The OS sandbox of the CLI (see llm.ts): the agent's shell can write only its working folder,
 *      read only that and the vault, never touch .git, never reach the network.
 *   2. Its own branch: the agent works in a git worktree of the vault (DATA_DIR/agent-runs/<id>), so it
 *      never edits a file you have open. The vault's derived files (the books' text, the indexes) are
 *      linked in read-only.
 *   3. Checks before anything lands: every changed file must parse; app-owned files (logs, profile,
 *      book.json, AGENTS.md…) must be untouched; deleting files or rewriting your notes waits for
 *      your OK (you see the diff). Otherwise the branch is merged.
 *   4. Undo: every run lands as one merge commit, reverted with one click. log/agents.jsonl records
 *      each run: the task, the model, the files, the commit. */
import { existsSync } from "node:fs";
import type { AgentRun } from "../../shared/vault-types.ts";
import { publish } from "../events.ts";
import { learnerSummary } from "../learn/context.ts";
import { agent } from "../llm/index.ts";
import {
  appendLog,
  changed,
  commitNow,
  git,
  gitIdentity,
  readLog,
  reloadFile,
  shortId,
  touched,
  VAULT,
  vaultIsRepo,
} from "../vault/index.ts";
import { writeIndexes } from "../vault/indexes.ts";
import { changesIn, isForbidden, needsReview, problemsIn } from "./review.ts";
import { branch, createWorkingCopy, dirOf, removeWorkingCopy, unlinkDerived } from "./workspace.ts";

const runs = new Map<string, AgentRun>();
let loaded = false;
/** Reads the run log once; a run that was going when the server stopped is marked failed. */
function load() {
  if (loaded) return;
  loaded = true;
  for (const r of readLog<AgentRun>("agents.jsonl")) runs.set(r.id, r);
  // a run that was going when the server stopped can't be resumed
  for (const r of runs.values())
    if (r.status === "running") save({ ...r, status: "failed", error: "the server stopped during the run" });
}
/** Records a run's new state in the log and announces it. */
function save(run: AgentRun) {
  runs.set(run.id, run);
  appendLog("agents.jsonl", run);
  if (run.status !== "running") changed(`agent ${run.status}`);
  publish("global", { type: "agent", data: run });
  return run;
}

export function listRuns(): AgentRun[] {
  load();
  return [...runs.values()].sort((a, b) => b.started.localeCompare(a.started)).slice(0, 50);
}

const PROMPT = (
  task: string,
) => `You are the learner's librarian. Your working folder is a copy of their knowledge vault, on its own branch: change files here freely; nothing reaches the real vault until it passes checks (and, for deletions or rewrites of their notes, until they approve).

Read AGENTS.md first: it explains the layout and the rules. Start from INDEX.md and the folder indexes; search with rg; read only the files you need. The books' text (library/*/text/) and the indexes are read-only links.

The learner:
${learnerSummary()}

Their request:
"""
${task}
"""

Do it well, then reply with a short summary (Markdown) of what you changed and why, naming the files. If the request is unclear or risky, do the safe part and say what you left out.`;

/** Starts a run; returns at once (the run continues, and announces itself on the global event stream). */
export function startRun(task: string): AgentRun {
  load();
  if (!vaultIsRepo())
    throw new Error("agents that write need git (the vault's history is how their changes are checked and undone)");
  if ([...runs.values()].some((r) => r.status === "running"))
    throw new Error("an agent is already working on the vault; wait for it to finish");
  const id = shortId("r");
  const run = save({
    id,
    task: task.trim().slice(0, 2000),
    mode: "write",
    status: "running",
    started: new Date().toISOString(),
    activity: "preparing a working copy",
  });
  void execute(run);
  return run;
}

/** The run itself: working copy, agent, commit, checks; then merge, wait for review, or fail. */
async function execute(run: AgentRun) {
  const started = Date.now();
  try {
    writeIndexes();
    commitNow(`before agent: ${run.task.slice(0, 80)}`);
    const { dir, linked } = createWorkingCopy(run.id);
    save({ ...run, activity: "the agent is working" });
    let last = 0;
    const result = await agent({
      cwd: dir,
      write: true,
      readRoots: [VAULT],
      prompt: PROMPT(run.task),
      tier: "smart",
      timeoutMs: 15 * 60 * 1000,
      onActivity: (text) => {
        if (Date.now() - last < 1500) return;
        last = Date.now();
        save({ ...runs.get(run.id)!, activity: text });
      },
    });
    unlinkDerived(dir, linked);
    git(["add", "-A"], dir);
    const committed = git([...gitIdentity, "commit", "-q", "-m", `agent: ${run.task.slice(0, 100)}`], dir);
    const base = {
      ...runs.get(run.id)!,
      activity: undefined,
      ms: Date.now() - started,
      provider: result.provider,
      model: result.model,
      answer: String(result.data || "").trim(),
    };
    if (!committed.ok) {
      save({ ...base, status: "done", files: [] });
      removeWorkingCopy(run.id);
      return;
    }
    const { files, removed } = changesIn(dir);
    const problems = problemsIn(dir, files);
    if (problems.some(isForbidden)) {
      save({ ...base, status: "failed", files, error: problems.join("; ") });
      removeWorkingCopy(run.id);
      return;
    }
    const review = needsReview(files, removed, problems);
    if (review.length) {
      save({ ...base, status: "review", files, review });
      return;
    }
    save(merge({ ...base, files }));
  } catch (error) {
    save({
      ...runs.get(run.id)!,
      status: "failed",
      activity: undefined,
      ms: Date.now() - started,
      error: (error as Error).message.slice(0, 600),
    });
    removeWorkingCopy(run.id);
  }
}

/** Brings a run's branch into the vault as one merge commit, and reloads what it changed. */
function merge(run: AgentRun): AgentRun {
  commitNow("your edits before an agent's changes");
  const merged = git([
    ...gitIdentity,
    "merge",
    "--no-ff",
    "-q",
    "-m",
    `agent: ${run.task.slice(0, 100)}`,
    branch(run.id),
  ]);
  if (!merged.ok) {
    git(["merge", "--abort"]);
    removeWorkingCopy(run.id);
    return {
      ...run,
      status: "failed",
      error: `its changes clash with edits you made meanwhile: ${merged.stderr.trim().slice(0, 300) || merged.stdout.trim().slice(0, 300)}`,
    };
  }
  const commit = git(["rev-parse", "HEAD"]).stdout.trim();
  for (const f of run.files || []) {
    reloadFile(f.path);
    touched(f.path);
  }
  removeWorkingCopy(run.id);
  return { ...run, status: "merged", commit, review: undefined };
}

export function approveRun(id: string): AgentRun {
  load();
  const run = runs.get(id);
  if (run?.status !== "review") throw new Error("nothing waiting for approval");
  return save(merge(run));
}

export function discardRun(id: string): AgentRun {
  load();
  const run = runs.get(id);
  if (run?.status !== "review") throw new Error("nothing waiting for approval");
  removeWorkingCopy(id);
  return save({ ...run, status: "discarded" });
}

/** Reverts a merged run (one commit), unless your later edits touch the same lines. */
export function undoRun(id: string): AgentRun {
  load();
  const run = runs.get(id);
  if (run?.status !== "merged" || !run.commit) throw new Error("only a merged run can be undone");
  commitNow("your edits before undoing an agent run");
  const reverted = git([...gitIdentity, "revert", "-m", "1", "--no-edit", run.commit]);
  if (!reverted.ok) {
    git(["revert", "--abort"]);
    throw new Error(`can't undo cleanly: you've edited the same lines since (${reverted.stderr.trim().slice(0, 200)})`);
  }
  for (const f of run.files || []) {
    reloadFile(f.path);
    touched(f.path);
  }
  return save({ ...run, status: "undone" });
}

/** The changes a run made (or proposes), as a unified diff. */
export function runDiff(id: string): string {
  load();
  const run = runs.get(id);
  if (!run) throw new Error("run not found");
  if (run.status === "review" && existsSync(dirOf(id)))
    return git(["diff", "--no-color", "HEAD~1", "HEAD"], dirOf(id)).stdout;
  if (run.commit) return git(["diff", "--no-color", `${run.commit}^1`, run.commit]).stdout;
  return "";
}
