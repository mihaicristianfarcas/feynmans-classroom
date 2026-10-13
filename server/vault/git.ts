/* The vault's history: changes are committed a few seconds after they happen (several changes in a
 * row become one commit with a summary subject), and agents branch off and merge back through git.
 * Every command runs with the app's own identity, so the learner's git config doesn't matter. */
import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { VAULT } from "./files.ts";

/** Whether git is installed. Without it the vault still works, unversioned (and agents can't write). */
export const hasGit = spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;

/** Whether the vault is a git repository (it becomes one on first start when git is installed). */
export const vaultIsRepo = () => hasGit && existsSync(join(VAULT, ".git"));
const pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let committing = false;
const GIT_ID = ["-c", "user.name=Feynman's Classroom", "-c", "user.email=classroom@localhost"];

/** Something in the vault changed: commit it a few seconds from now, with everything else that changes meanwhile. */
export function changed(what: string) {
  pending.push(what);
  if (!hasGit) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(commit, 4000);
}

function subjectOf(items: string[]) {
  // the activity log changes with almost everything; name it only when nothing else changed
  if (items.some((i) => i !== "activity")) items = items.filter((i) => i !== "activity");
  const counts = new Map<string, number>();
  for (const item of items) {
    const kind = item.split(" ")[0];
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  return (
    items.length === 1 ? items[0] : [...counts].map(([k, n]) => (n > 1 ? `${n}× ${k}` : k)).join(", ") || "update"
  ).slice(0, 120);
}

function commit() {
  timer = null;
  if (committing || !pending.length) return;
  committing = true;
  const subject = subjectOf(pending.splice(0).filter(Boolean));
  execFile("git", ["add", "-A"], { cwd: VAULT }, (error) => {
    if (error) {
      committing = false;
      return;
    }
    execFile("git", [...GIT_ID, "commit", "-q", "-m", subject], { cwd: VAULT }, () => {
      committing = false;
      if (pending.length) changed("");
    });
  });
}

/** Commits whatever is pending right now (before an agent branches off, or merges back). */
export function commitNow(subject?: string): string | null {
  if (!vaultIsRepo()) return null;
  if (timer) clearTimeout(timer);
  timer = null;
  const items = pending.splice(0).filter(Boolean);
  git(["add", "-A"]);
  const status = git(["status", "--porcelain"]);
  if (status.stdout.trim())
    git([...GIT_ID, "commit", "-q", "-m", subject || subjectOf(items.length ? items : ["update"])]);
  return git(["rev-parse", "HEAD"]).stdout.trim() || null;
}

/** Runs git in the vault (or `cwd`), synchronously. */
export function git(args: string[], cwd = VAULT) {
  const run = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: run.status === 0, stdout: run.stdout || "", stderr: run.stderr || "" };
}
/** `-c` flags that sign the app's commits (so they work without a global git identity). */
export const gitIdentity = GIT_ID;

/** The vault's latest commits, newest first. */
export function vaultHistory(limit = 30): { hash: string; when: string; subject: string }[] {
  if (!vaultIsRepo()) return [];
  const run = spawnSync("git", ["log", `-${limit}`, "--pretty=format:%h%x09%cI%x09%s"], {
    cwd: VAULT,
    encoding: "utf8",
  });
  return (run.stdout || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, when, subject] = line.split("\t");
      return { hash, when, subject };
    });
}
