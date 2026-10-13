/* Agents that change the vault ("turn my chapter 5 highlights into a summary note", "tidy my notes on
 * consensus into one"), with these guardrails:
 *
 *   1. The CLI's OS sandbox (see llm/): the agent's shell can write only its working folder, read
 *      only that and the vault, never touch .jj or .git, never reach the network.
 *   2. Its own jj workspace (workspace.ts): it never edits a file the learner has open, and several
 *      requests can be worked on at once.
 *   3. Checks (review.ts): app-owned files may not change; a file that can't be read back waits for
 *      the learner's OK. Everything else lands at once, after whatever the learner did meanwhile, and
 *      only if it doesn't clash with it (vault/jj.ts).
 *   4. Undo: each run is one jj change, taken out again with one click. log/agents.jsonl records
 *      every run: the task, the model, the files, the change.
 *
 * Without jj the agent can still read and answer, but not write. */
import type { AgentRun } from "../../shared/vault-types.ts";
import { publish } from "../events.ts";
import { learnerSummary } from "../learn/context.ts";
import { agent } from "../llm/index.ts";
import {
  appendLog,
  changed,
  checkpoint,
  diffOf,
  filesOf,
  logActivity,
  readLog,
  reloadFile,
  shortId,
  takeSelfWrite,
  touched,
  VAULT,
  vaultIsRepo,
  wroteItself,
} from "../vault/index.ts";
import { writeIndexes } from "../vault/indexes.ts";
import { abandon, commitIdOf, describeIn, drop, land } from "../vault/jj.ts";
import { isForbidden, needsReview, problemsIn } from "./review.ts";
import { cleanUpWorkingCopies, createWorkingCopy, removeWorkingCopy, unlinkDerived } from "./workspace.ts";

/** How many requests may be worked on at once (the model calls share a smaller limit besides). */
const MAX_RUNNING = 4;

const runs = new Map<string, AgentRun>();
let loaded = false;
/** Reads the run log once; a run that was going when the server stopped is marked failed. */
function load() {
  if (loaded) return;
  loaded = true;
  for (const r of readLog<AgentRun>("agents.jsonl")) runs.set(r.id, r);
  for (const r of runs.values()) {
    if (r.status === "running")
      save({ ...r, status: "failed", activity: undefined, error: "the server stopped during the run" });
    // runs from before the vault moved to jj: their branches are gone
    else if (r.status === "review" && !r.change)
      save({ ...r, status: "discarded", error: "left waiting when the vault moved to jj" });
  }
  if (vaultIsRepo()) cleanUpWorkingCopies(new Set());
}
/** Records a run's new state in the log and announces it. */
function save(run: AgentRun) {
  runs.set(run.id, run);
  appendLog("agents.jsonl", run);
  if (run.status !== "running") changed(`agent ${run.status}`);
  publish("global", { type: "agent", data: run });
  return run;
}
const get = (id: string) => {
  load();
  const run = runs.get(id);
  if (!run) throw new Error("run not found");
  return run;
};

/** At startup: settles runs a restart interrupted and clears their working copies. */
export const prepareAgents = () => load();

export function listRuns(): AgentRun[] {
  load();
  return [...runs.values()].sort((a, b) => b.started.localeCompare(a.started)).slice(0, 60);
}

const PROMPT = (task: string, write: boolean) => `You are the learner's librarian. ${
  write
    ? "Your working folder is a copy of their knowledge vault, in a jj workspace of its own: change files here freely; what you change lands in their vault when you finish, and they can undo it with one click."
    : "Your working folder is their knowledge vault, read-only (this machine keeps no history of the vault, so agents may not write): look, and answer."
}

Read AGENTS.md first: it explains the layout and the rules. Start from INDEX.md and the folder indexes; search with rg; read only the files you need. The books' text (library/*/text/) and the indexes are read-only.

The learner:
${learnerSummary()}

Their request:
"""
${task}
"""

Do it well, then reply with a short summary (Markdown) of what you changed and why, naming the files. If the request is unclear or risky, do the safe part and say what you left out.`;

/** Starts a run; returns at once (the run continues, and announces itself on the global event stream). */
export function startRun(input: { task: string }): AgentRun {
  load();
  const task = input.task.trim().slice(0, 4000);
  if (!task) throw new Error("say what the agent should do");
  if ([...runs.values()].filter((r) => r.status === "running").length >= MAX_RUNNING)
    throw new Error(`${MAX_RUNNING} agents are already working; wait for one to finish`);
  const run = save({
    id: shortId("r"),
    task,
    mode: vaultIsRepo() ? "write" : "read",
    status: "running",
    started: new Date().toISOString(),
    activity: "getting ready",
  });
  void execute(run);
  return run;
}

/** Passes the agent's progress on to the page, at most every second and a half. */
function reporter(id: string) {
  let last = 0;
  return (text: string) => {
    if (Date.now() - last < 1500) return;
    last = Date.now();
    const current = runs.get(id);
    if (current?.status === "running") save({ ...current, activity: text });
  };
}

/** The run itself: a working copy, the agent, the checks; then it lands, waits for review, or fails. */
async function execute(run: AgentRun) {
  const started = Date.now();
  const write = run.mode === "write";
  const finish = (patch: Partial<AgentRun>) =>
    save({ ...runs.get(run.id)!, activity: undefined, ms: Date.now() - started, ...patch });
  let workspace = false;
  try {
    writeIndexes();
    let dir = VAULT;
    let linked: string[] = [];
    if (write) {
      const base = checkpoint();
      if (!base) throw new Error("the vault's history isn't available");
      ({ dir, linked } = createWorkingCopy(run.id, base));
      workspace = true;
    }
    save({ ...runs.get(run.id)!, activity: "the agent is working" });
    const result = await agent({
      cwd: dir,
      write,
      readRoots: write ? [VAULT] : undefined,
      prompt: PROMPT(run.task, write),
      tier: "smart",
      timeoutMs: 15 * 60 * 1000,
      onActivity: reporter(run.id),
    });
    const base = { provider: result.provider, model: result.model, answer: String(result.data || "").trim() };
    if (!write) {
      finish({ ...base, status: "done", files: [] });
      return;
    }

    unlinkDerived(dir, linked);
    const change = describeIn(dir, `agent: ${run.task.split("\n")[0].slice(0, 100)}`);
    const files = filesOf("@", dir);
    const problems = problemsIn(dir, files);
    removeWorkingCopy(run.id);
    workspace = false;
    if (!files.length) {
      abandon(change);
      finish({ ...base, status: "done", files: [] });
      return;
    }
    const commit = commitIdOf(change);
    if (problems.some(isForbidden)) {
      abandon(change);
      finish({ ...base, status: "failed", files, commit, error: problems.join("; ") });
      return;
    }
    if (problems.length) {
      finish({ ...base, status: "review", files, change, commit, review: needsReview(problems) });
      return;
    }
    save(
      bringIn({ ...runs.get(run.id)!, ...base, activity: undefined, ms: Date.now() - started, files, change, commit }),
    );
  } catch (error) {
    if (workspace) removeWorkingCopy(run.id);
    finish({ status: "failed", error: (error as Error).message.slice(0, 600) });
  }
}

/** jj is about to write these files: the watcher shouldn't take them for the learner's own edits. */
function expect(files: AgentRun["files"]) {
  for (const f of files || []) wroteItself(f.path);
}
/** It didn't write them after all. */
function unexpect(files: AgentRun["files"]) {
  for (const f of files || []) takeSelfWrite(f.path);
}

/** Reloads and announces the files a run changed (after it lands or is undone). */
function refresh(files: AgentRun["files"]) {
  for (const f of files || []) {
    reloadFile(f.path);
    touched(f.path);
  }
}

/** Lands a run's change in the vault, after everything the learner did meanwhile. */
function bringIn(run: AgentRun): AgentRun {
  expect(run.files);
  const landed = land(run.change!);
  if (!landed.ok) {
    unexpect(run.files);
    if (!landed.clash) abandon(run.change!);
    return {
      ...run,
      status: "failed",
      review: undefined,
      error: landed.clash ? `${landed.error}; ask again and it will start from your latest version` : landed.error,
    };
  }
  refresh(run.files);
  logActivity({ type: "ask", text: `Agent: ${run.task.slice(0, 80)}` });
  return { ...run, status: "merged", review: undefined, commit: commitIdOf(run.change!) || run.commit };
}

export function approveRun(id: string): AgentRun {
  const run = get(id);
  if (run.status !== "review" || !run.change) throw new Error("nothing waiting for approval");
  return save(bringIn(run));
}

export function discardRun(id: string): AgentRun {
  const run = get(id);
  if (run.status !== "review") throw new Error("nothing waiting for approval");
  if (run.change) abandon(run.change);
  return save({ ...run, status: "discarded" });
}

/** Takes a landed run's change out of the vault, unless later edits touch the same lines. */
export function undoRun(id: string): AgentRun {
  const run = get(id);
  if (run.status !== "merged" || !run.change) throw new Error("only a run that changed your vault can be undone");
  expect(run.files);
  const dropped = drop(run.change);
  if (!dropped.ok) unexpect(run.files);
  if (!dropped.ok)
    throw new Error(
      dropped.clash ? "can't undo it cleanly: you've changed the same lines since" : `can't undo it: ${dropped.error}`,
    );
  refresh(run.files);
  return save({ ...run, status: "undone" });
}

/** The changes a run made (or proposes), as a unified diff. */
export function runDiff(id: string): string {
  const run = get(id);
  return run.commit ? diffOf(run.commit) : "";
}
