/* The agent: one field in the app, for anything the learner wants done or answered ("summarise this
 * chapter into my DDIA folder", "quiz me on my highlights", "what did I write about consensus?").
 *
 *   1. Where they are (the note, the book and chapter, the selection) goes into the prompt, with the
 *      conversation so far when they follow up on an earlier request (see where.ts, prompt.ts).
 *   2. The CLI's OS sandbox (see llm/): the agent's shell can write only its working folder, read
 *      only that and the vault, never touch .jj or .git, never reach the network.
 *   3. Its own jj workspace (workspace.ts): it never edits a file the learner has open, and several
 *      requests can be worked on at once.
 *   4. Checks (review.ts): app-owned files may not change; a file that can't be read back waits for
 *      the learner's OK. Everything else lands at once, after whatever the learner did meanwhile, and
 *      only if it doesn't clash with it (vault/jj.ts).
 *   5. Undo: each run is one jj change, taken out again with one click. log/agents.jsonl records
 *      every run: the request, where, the model, the files, the change.
 *
 * A request made in an added vault works on a copy of that vault's notes instead, and lands in it (and
 * is undone) through the vault's own history (vaults/agent-work.ts). */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentContext, AgentRun } from "../../shared/vault-types.ts";
import { publish } from "../events.ts";
import { createDoc } from "../learn/docs.ts";
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
  wroteItself,
} from "../vault/index.ts";
import { writeIndexes } from "../vault/indexes.ts";
import { abandon, commitIdOf, describeIn, drop, land } from "../vault/jj.ts";
import {
  dropWork,
  finishWork,
  land as landInVault,
  startWork,
  unland,
  diffOf as vaultDiff,
  type Work,
} from "../vaults/agent-work.ts";
import { createNote } from "../vaults/edit.ts";
import { announceChanges, getVault, listVaults } from "../vaults/index.ts";
import { agentPrompt, REPLY_SCHEMA, type Reply, vaultAgentPrompt } from "./prompt.ts";
import { isForbidden, needsReview, problemsIn } from "./review.ts";
import { describeWhere } from "./where.ts";
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
  }
  cleanUpWorkingCopies(new Set());
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

/** Starts a request; returns at once (the run continues, and announces itself on the global event stream). */
export function startRun(input: {
  task: string;
  context?: AgentContext;
  /** The run this one follows up on: it joins that run's conversation. */
  after?: string;
  tier?: "fast" | "smart";
}): AgentRun {
  load();
  const task = input.task.trim().slice(0, 4000);
  if (!task) throw new Error("say what the agent should do");
  if ([...runs.values()].filter((r) => r.status === "running").length >= MAX_RUNNING)
    throw new Error(`${MAX_RUNNING} requests are already being worked on; wait for one to finish`);
  const previous = input.after ? runs.get(input.after) : undefined;
  const where = describeWhere(input.context);
  const id = shortId("r");
  // a follow-up stays in the vault its conversation started in
  const vault = previous ? previous.vault : listVaults().find((v) => v.id === input.context?.vault)?.id;
  const run = save({
    id,
    task,
    vault,
    thread: previous ? previous.thread || previous.id : undefined,
    where: where.label || undefined,
    tier: input.tier === "smart" ? "smart" : "fast",
    status: "running",
    started: new Date().toISOString(),
    activity: "getting ready",
  });
  void execute(run, where.lines);
  return run;
}

/** The earlier turns of a run's conversation, oldest first. */
function turnsBefore(run: AgentRun): AgentRun[] {
  if (!run.thread) return [];
  return [...runs.values()]
    .filter((r) => (r.id === run.thread || r.thread === run.thread) && r.id !== run.id && r.started <= run.started)
    .sort((a, b) => a.started.localeCompare(b.started));
}

/** Passes the agent's progress on to the panel, at most every second and a half. */
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
async function execute(run: AgentRun, where: string[]) {
  if (run.vault) return executeInVault(run, run.vault, where);
  const started = Date.now();
  const prompt = agentPrompt({ task: run.task, where, turns: turnsBefore(run) });
  const finish = (patch: Partial<AgentRun>) =>
    save({ ...runs.get(run.id)!, activity: undefined, ms: Date.now() - started, ...patch });
  let workspace = false;
  try {
    writeIndexes();
    const start = checkpoint();
    if (!start) throw new Error("the vault's history isn't available");
    const { dir, linked } = createWorkingCopy(run.id, start);
    workspace = true;
    save({ ...runs.get(run.id)!, activity: "reading your vault" });
    const result = await agent({
      cwd: dir,
      write: true,
      readRoots: [VAULT],
      prompt,
      schema: REPLY_SCHEMA,
      tier: run.tier,
      timeoutMs: (run.tier === "smart" ? 15 : 6) * 60 * 1000,
      onActivity: reporter(run.id),
    });
    const reply = (result.data || {}) as Partial<Reply>;
    // the file to open from the reply: one it made, or (for an answer) one that already exists
    const open = String(reply.open || "").replace(/^\/+/, "");
    const base = {
      provider: result.provider,
      model: result.model,
      answer: String(reply.reply || "").trim(),
      open: open && !open.includes("..") ? open : undefined,
    };
    const existing = base.open && existsSync(join(VAULT, base.open)) ? base.open : undefined;
    unlinkDerived(dir, linked);
    const change = describeIn(dir, `agent: ${run.task.split("\n")[0].slice(0, 100)}`);
    const files = filesOf("@", dir);
    const problems = problemsIn(dir, files);
    removeWorkingCopy(run.id);
    workspace = false;
    if (!files.length) {
      abandon(change);
      finish({ ...base, status: "done", files: [], open: existing });
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

/** A run in an added vault: a copy of its notes, the agent, then its commit lands in the vault (or fails). */
async function executeInVault(run: AgentRun, id: string, where: string[]) {
  const started = Date.now();
  const finish = (patch: Partial<AgentRun>) =>
    save({ ...runs.get(run.id)!, activity: undefined, ms: Date.now() - started, ...patch });
  let work: Work | null = null;
  const vault = getVault(id);
  try {
    const name = listVaults().find((v) => v.id === id)?.name || "vault";
    work = startWork(vault, run.id);
    save({ ...runs.get(run.id)!, activity: "reading your notes" });
    const result = await agent({
      cwd: work.dir,
      write: true,
      readRoots: [vault.root, VAULT],
      prompt: vaultAgentPrompt({
        task: run.task,
        where,
        turns: turnsBefore(run),
        name,
        files: vault.root,
        classroom: VAULT,
      }),
      schema: REPLY_SCHEMA,
      tier: run.tier,
      timeoutMs: (run.tier === "smart" ? 15 : 6) * 60 * 1000,
      onActivity: reporter(run.id),
    });
    const reply = (result.data || {}) as Partial<Reply>;
    const open = String(reply.open || "").replace(/^\/+/, "");
    const base = {
      provider: result.provider,
      model: result.model,
      answer: String(reply.reply || "").trim(),
      open: open && !open.includes("..") ? open : undefined,
    };
    const done = finishWork(vault, work, run.id, `agent: ${run.task.split("\n")[0].slice(0, 100)}`);
    work = null;
    if (!done.commit) {
      finish({
        ...base,
        status: "done",
        files: [],
        open: base.open && vault.files.has(base.open) ? base.open : undefined,
      });
      return;
    }
    const landed = landInVault(vault, done.commit);
    if (!landed.ok) {
      finish({
        ...base,
        status: "failed",
        files: done.files,
        commit: done.commit,
        error: landed.clash ? `${landed.error}; ask again and it will start from your latest version` : landed.error,
      });
      return;
    }
    logActivity({ type: "ask", text: `Asked the agent: ${run.task.slice(0, 80)}` });
    finish({ ...base, status: "merged", files: done.files, change: landed.commit, commit: landed.commit });
  } catch (error) {
    if (work) dropWork(vault, work);
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
  logActivity({ type: "ask", text: `Asked the agent: ${run.task.slice(0, 80)}` });
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
  if (run.vault) {
    const out = unland(getVault(run.vault), run.change);
    if (!out.ok)
      throw new Error(
        out.clash ? "can't undo it cleanly: you've changed the same lines since" : `can't undo it: ${out.error}`,
      );
    return save({ ...run, status: "undone" });
  }
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
  if (!run.commit) return "";
  return run.vault ? vaultDiff(getVault(run.vault), run.commit) : diffOf(run.commit);
}

/** Keeps an answer as a note (for a request that changed nothing). */
export function keepRun(id: string): AgentRun {
  const run = get(id);
  if (!run.answer) throw new Error("there's no answer to keep");
  if (run.kept) return run;
  if (run.vault) {
    const vault = getVault(run.vault);
    const made = createNote(vault, {
      title: run.task.split("\n")[0].slice(0, 80).replace(/\//g, "-"),
      text: run.answer,
    });
    announceChanges(vault.id, [made]);
    return save({ ...run, kept: made.path });
  }
  const note = createDoc({
    kind: "note",
    type: "answer",
    title: run.task.split("\n")[0].slice(0, 80),
    body: run.answer,
    tags: ["ask"],
  });
  return save({ ...run, kept: note.path });
}
