/* The vault's history, kept by Jujutsu (jj) in a repository colocated with git, so git tools,
 * Obsidian Git and a remote keep working.
 *
 * jj treats the working copy as a commit and snapshots it whenever it runs, so nothing is staged:
 * as the learner works, the app names the change in progress ("3× note, card"), and it starts a new
 * one when a sitting ends (a few idle minutes) or before an agent's work comes in. Every snapshot in
 * between stays in jj's operation log.
 *
 * Agents work in jj workspaces of their own (agents/workspace.ts). Their changes are brought in
 * (`land`) or taken out again (`drop`) by rebasing, and a rewrite that would leave conflicts is tried
 * first without touching the files on disk, then rolled back, so conflict markers never reach a
 * note. jj runs with the app's own config, so the learner's own jj or git setup doesn't matter. */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../config.ts";
import { assertOpen, vaultDir, vaultState } from "./current.ts";

const BIN = process.env.JJ_BIN || "jj";

/** Stops with what to do when jj isn't installed: the vault's history, Undo and the agent's changes all
 * go through it. */
export function requireJj() {
  if (spawnSync(BIN, ["--version"], { encoding: "utf8" }).status === 0) return;
  throw new Error(
    `Jujutsu (jj) isn't installed${process.env.JJ_BIN ? `, or JJ_BIN (${process.env.JJ_BIN}) doesn't point to it` : ""}. Install it (brew install jj, or see https://www.jj-vcs.dev) and start again: the vault's history, Undo and the agent's changes all go through it.`,
  );
}

/** How long the vault stays quiet before the change in progress is closed and a new one begun. */
const SITTING_MS = Number(process.env.VAULT_SITTING_MS) || 3 * 60 * 1000;

const CONFIG = `# Written by Feynman's Classroom: how it runs jj on the vault (your own jj config isn't read).
user.name = "Feynman's Classroom"
user.email = "classroom@localhost"
ui.color = "never"
ui.paginate = "never"
# never wait for an editor: the app always gives a message
ui.editor = "false"
# pictures and attachments are tracked up to this size (jj's default is 1 MiB)
snapshot.max-new-file-size = "64MiB"
`;
let configFile = "";
/** The environment jj runs in: the app's config instead of the learner's. */
function env() {
  if (!configFile) {
    configFile = join(DATA_DIR, "jj.toml");
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(configFile, CONFIG);
  }
  return { ...process.env, JJ_CONFIG: configFile };
}

/** Runs jj in the vault (or `cwd`), synchronously: one call at a time, so multi-step rewrites never interleave. */
export function jj(args: string[], cwd = vaultDir(), extraEnv: Record<string, string> = {}) {
  const run = spawnSync(BIN, args, {
    cwd,
    encoding: "utf8",
    env: { ...env(), ...extraEnv },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: run.status === 0, stdout: run.stdout || "", stderr: (run.stderr || "").trim() };
}

/** A path as a jj fileset that matches exactly that file, whatever characters its name has. */
export const fileset = (rel: string) => `root-file:${JSON.stringify(rel)}`;

/** One field of a revision, by template. */
const field = (rev: string, template: string, cwd = vaultDir()) =>
  jj(["log", "-r", rev, "--no-graph", "-T", template], cwd).stdout.trim();

/** A revision's full change id (stable across rewrites); "" if there's no such revision. */
export const changeIdOf = (rev: string, cwd = vaultDir()) => field(rev, "change_id", cwd);
/** A revision's commit id (a hidden commit is still reachable by it, e.g. for its diff). */
export const commitIdOf = (rev: string, cwd = vaultDir()) => field(rev, "commit_id", cwd);
const isEmpty = (rev: string) => field(rev, "empty") === "true";

/* ---------------- the change in progress ---------------- */

/** What changed since the last snapshot was named, and since the sitting began, and when each is due. */
const progress = vaultState(() => ({
  pending: [] as string[],
  sitting: [] as string[],
  snapTimer: null as ReturnType<typeof setTimeout> | null,
  sittingTimer: null as ReturnType<typeof setTimeout> | null,
}));

/** Something in the vault changed: the change in progress is named a few seconds from now. */
export function changed(what: string) {
  assertOpen();
  const p = progress();
  p.pending.push(what);
  if (p.snapTimer) clearTimeout(p.snapTimer);
  p.snapTimer = setTimeout(snapshot, 3000);
  p.snapTimer.unref?.();
}

/** Bookkeeping the app does alongside everything (the activity log, the agent's run log). */
const quiet = (item: string) => item === "activity" || item.startsWith("agent ");

function subjectOf(items: string[]) {
  // the logs change with almost everything; name them only when nothing else changed
  if (items.some((i) => !quiet(i))) items = items.filter((i) => !quiet(i));
  const counts = new Map<string, number>();
  for (const item of items) {
    const kind = item.split(" ")[0];
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  return (
    items.length === 1 ? items[0] : [...counts].map(([k, n]) => (n > 1 ? `${n}× ${k}` : k)).join(", ") || "update"
  ).slice(0, 120);
}

/** A name for the change in progress when nothing said what happened: from the files it touches. */
function subjectFromFiles(): string {
  const paths = filesOf("@").map((f) => f.path);
  if (!paths.length) return "update";
  if (paths.every((p) => p.startsWith("log/"))) return "logs";
  const shown = paths.filter((p) => !p.startsWith("log/"));
  return shown.length === 1 ? `edit ${shown[0]}` : `edit ${shown.length} files`;
}

/** The change in progress's name: what was said to happen in it, else the files it touches. */
function nameOfChange() {
  const { sitting } = progress();
  return sitting.some((i) => !quiet(i)) ? subjectOf(sitting) : subjectFromFiles();
}

/** Snapshots the working copy and names the change in progress after everything in this sitting. */
function snapshot() {
  const p = progress();
  p.snapTimer = null;
  p.sitting.push(...p.pending.splice(0).filter(Boolean));
  // nothing differs on disk (jj itself just updated the files, or an edit was taken back)
  if (isEmpty("@")) return;
  jj(["describe", "-m", nameOfChange()]);
  if (p.sittingTimer) clearTimeout(p.sittingTimer);
  p.sittingTimer = setTimeout(() => checkpoint(), SITTING_MS);
  p.sittingTimer.unref?.();
}

/** Closes the change in progress (named after what happened in it) and begins a new one, unless only
 * the app's logs changed. Returns the change id of the latest change in the history, which agents
 * start from. */
export function checkpoint(): string | null {
  const p = progress();
  for (const t of [p.snapTimer, p.sittingTimer]) if (t) clearTimeout(t);
  p.snapTimer = p.sittingTimer = null;
  p.sitting.push(...p.pending.splice(0).filter(Boolean));
  // the app's logs alone don't make an entry in the history: they wait for the next real change
  const files = filesOf("@");
  if (files.some((f) => !f.path.startsWith("log/"))) {
    jj(["commit", "-m", nameOfChange()]);
    keepMainBookmark();
    p.sitting = [];
  }
  return changeIdOf("@-") || null;
}

/** Keeps a `main` bookmark on the latest change, so git sees a branch (for pushing, or Obsidian Git). */
function keepMainBookmark() {
  jj(["bookmark", "set", "main", "-r", "@-", "--allow-backwards"]);
}

/* ---------------- history ---------------- */

export interface Version {
  /** jj's change id (short): stays the same when the change is rebased. */
  change: string;
  /** The commit id (short): this exact version. */
  commit: string;
  when: string;
  subject: string;
}

const VERSION =
  'change_id.short(12) ++ "\\t" ++ commit_id.short(12) ++ "\\t" ++ committer.timestamp().utc().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\t" ++ description.first_line() ++ "\\n"';

function versions(revset: string, paths: string[], limit: number): Version[] {
  const run = jj(["log", "-r", revset, "-n", String(limit), "--no-graph", "-T", VERSION, ...paths.map(fileset)]);
  return run.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [change, commit, when, ...subject] = line.split("\t");
      return { change, commit, when, subject: subject.join("\t") || "(in progress)" };
    });
}

/** The vault's latest changes, newest first (the change in progress too, once something is in it). */
export const vaultHistory = (limit = 30) => versions("(::@ ~ root()) ~ (@ & empty())", [], limit);

/** The saved versions of one file, newest first (the change in progress is the file as it is now). */
export const fileHistory = (rel: string, limit = 50) => versions("::@- ~ root()", [rel], limit);

/** Whether a string is a commit id (so a request can't pass a revset expression instead). */
const isCommitId = (id: string) => /^[0-9a-f]{6,64}$/.test(id);

/** A file as it was in a version (null when it didn't exist there). */
export function fileAt(commit: string, rel: string): string | null {
  if (!isCommitId(commit)) return null;
  const run = jj(["file", "show", "-r", commit, fileset(rel)]);
  return run.ok ? run.stdout : null;
}

/** A commit's changes as a git-style diff (one file's, with `rel`). */
export function diffOf(commit: string, rel?: string): string {
  if (!isCommitId(commit)) return "";
  return jj(["diff", "--git", "-r", commit, ...(rel ? [fileset(rel)] : [])]).stdout;
}

export interface FileChange {
  path: string;
  change: "A" | "M" | "D";
}
const FILES =
  'self.diff().files().map(|f| f.status_char() ++ "\\t" ++ f.source().path() ++ "\\t" ++ f.path() ++ "\\n").join("")';

/** The files a revision added, modified or deleted (a rename counts as a deletion and an addition). */
export function filesOf(rev: string, cwd = vaultDir()): FileChange[] {
  const out: FileChange[] = [];
  for (const line of field(rev, FILES, cwd).split("\n").filter(Boolean)) {
    const [status, from, to] = line.split("\t");
    if (status === "R") out.push({ path: from, change: "D" }, { path: to, change: "A" });
    else if (status === "C" || status === "A") out.push({ path: to, change: "A" });
    else out.push({ path: to, change: status === "D" ? "D" : "M" });
  }
  return out;
}

/* ---------------- bringing changes in and out ---------------- */

/** A random moment in 2001, for commits that are only tried and then rolled back. */
const trialTime = () => new Date(Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 365 * 86400) * 1000).toISOString();
const currentOp = () => jj(["op", "log", "-n", "1", "--no-graph", "-T", "id"]).stdout.trim();
const conflictsFrom = (base: string) =>
  jj(["--ignore-working-copy", "log", "-r", `(${base}::) & conflicts()`, "--no-graph", "-T", 'change_id ++ "\\n"'])
    .stdout.trim()
    .split("\n")
    .filter(Boolean);

/**
 * Runs a rewrite only if it leaves no conflicts in `base` and what follows it. It is tried first
 * without touching the working copy, and the operation log puts everything back if it clashes; then
 * it runs for real (snapshotting the latest edits first) and is undone if those clash after all.
 */
function rewriteCleanly(args: string[], base: string): { ok: true } | { ok: false; error: string; clash?: boolean } {
  const before = currentOp();
  // the trial's commits get a made-up time: jj can't write the same commit twice, and the real run
  // (within the same second) would otherwise make exactly the same ones
  const trial = jj(["--ignore-working-copy", ...args], vaultDir(), { JJ_TIMESTAMP: trialTime() });
  if (!trial.ok) return { ok: false, error: trial.stderr };
  const clashes = conflictsFrom(base).length > 0;
  jj(["--ignore-working-copy", "op", "restore", before]);
  if (clashes) return { ok: false, clash: true, error: "it clashes with edits made meanwhile" };
  const real = jj(args);
  if (!real.ok) return { ok: false, error: real.stderr };
  if (conflictsFrom(base).length) {
    jj(["undo"]);
    return { ok: false, clash: true, error: "it clashes with edits made just now" };
  }
  return { ok: true };
}

/**
 * Brings a change made elsewhere (an agent's workspace, already forgotten) into the history after
 * everything the learner did meanwhile, and updates the files. A change that would conflict is left
 * out (and hidden), and the files are never touched.
 */
export function land(change: string): { ok: true } | { ok: false; error: string; clash?: boolean } {
  checkpoint();
  // first on top of the latest saved change, beside the working copy: no file on disk changes yet
  const moved = jj(["rebase", "-r", change, "-o", "@-"]);
  if (!moved.ok) return { ok: false, error: moved.stderr };
  if (conflictsFrom(change).length) {
    jj(["abandon", change]);
    return { ok: false, clash: true, error: "it clashes with edits made while the agent worked" };
  }
  // then the working copy moves on top of it, and the files follow
  const result = rewriteCleanly(["rebase", "-s", "@", "-o", change], change);
  if (result.ok) keepMainBookmark();
  return result;
}

/**
 * Takes a change out of the history, as if it had never been made: what came after it is rebased
 * onto its parent (jj's `abandon`). If it was already pushed somewhere (immutable), its reverse is
 * added instead. Refused, with nothing touched, if later edits would clash.
 */
export function drop(change: string): { ok: true } | { ok: false; error: string; clash?: boolean } {
  checkpoint();
  const parent = commitIdOf(`${change}-`);
  if (!parent) return { ok: false, error: "that change is no longer in the history" };
  const abandoned = rewriteCleanly(["abandon", change], parent);
  if (abandoned.ok || abandoned.clash) {
    if (abandoned.ok) keepMainBookmark();
    return abandoned;
  }
  // an immutable change (pushed to a remote): add its reverse before the working copy instead
  const reverted = rewriteCleanly(["revert", "-r", change, "-B", "@"], parent);
  if (reverted.ok) keepMainBookmark();
  return reverted;
}

/* ---------------- workspaces ---------------- */

/** Makes a second working copy of the vault at `dir`, on top of `rev`, for an agent to write in. */
export function addWorkspace(name: string, dir: string, rev: string) {
  const run = jj(["workspace", "add", "--name", name, "-r", rev, dir]);
  if (!run.ok) throw new Error(`could not make a working copy: ${run.stderr}`);
}

/** Names the change in a workspace (snapshotting what was written there); returns its change id. */
export function describeIn(dir: string, message: string): string {
  jj(["describe", "-m", message], dir);
  return changeIdOf("@", dir);
}

/** Forgets a workspace (its change stays in the repository until it is landed or abandoned). */
export function forgetWorkspace(name: string) {
  jj(["workspace", "forget", name]);
}

/** The names of the vault's workspaces besides the main one. */
export function workspaces(): string[] {
  return jj(["workspace", "list", "-T", 'name ++ "\\n"'])
    .stdout.split("\n")
    .map((l) => l.trim())
    .filter((n) => n && n !== "default");
}

/** Hides a change for good (a discarded run): it stays reachable through the operation log. */
export const abandon = (change: string) => jj(["abandon", change]).ok;
