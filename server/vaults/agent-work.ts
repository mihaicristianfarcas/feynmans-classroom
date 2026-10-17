/* An agent's work on a vault, through the vault's history (history.ts), as the app's own vault does it
 * with jj: the agent gets a copy of the notes (a git worktree in DATA_DIR/agent-runs/<id>), what it
 * changes there becomes one commit, and that commit is brought into the vault after whatever the
 * learner did meanwhile, only if it applies cleanly (tried first without touching the folder), and
 * taken out again the same way for Undo. */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { RUNS_DIR } from "../config.ts";
import { git, gitOut, head, snapshot } from "./history.ts";
import { announceChanges } from "./index.ts";
import type { Vault } from "./vault.ts";

export interface Work {
  dir: string;
  base: string;
}

export interface FileChange {
  path: string;
  change: "A" | "M" | "D";
}

/** Snapshots the vault and checks its notes out for run `id`. */
export function startWork(vault: Vault, id: string): Work {
  snapshot(vault);
  if (git(vault, ["rev-parse", "--verify", "-q", "HEAD"]).status !== 0)
    gitOut(vault, ["commit", "-q", "--allow-empty", "--no-verify", "-m", "Opened in the app"]);
  const dir = join(RUNS_DIR, id);
  rmSync(dir, { recursive: true, force: true });
  git(vault, ["worktree", "prune"]);
  const base = head(vault);
  gitOut(vault, ["worktree", "add", "-q", "--detach", dir, base]);
  return { dir, base };
}

/** Records what the agent changed as one commit (kept under refs/agent/<id>); removes its copy. */
export function finishWork(vault: Vault, work: Work, id: string, message: string) {
  try {
    gitOut(vault, ["add", "-A"], { cwd: work.dir });
    const files: FileChange[] = gitOut(vault, ["diff", "--cached", "--name-status", "--no-renames"], { cwd: work.dir })
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [status, path] = line.split("\t");
        return { path, change: status === "A" ? "A" : status === "D" ? "D" : "M" };
      });
    if (!files.length) return { files, commit: null };
    gitOut(vault, ["commit", "-q", "--no-verify", "-m", message], { cwd: work.dir });
    const commit = gitOut(vault, ["rev-parse", "HEAD"], { cwd: work.dir }).trim();
    gitOut(vault, ["update-ref", `refs/agent/${id}`, commit]);
    return { files, commit };
  } finally {
    dropWork(vault, work);
  }
}

export function dropWork(vault: Vault, work: Work) {
  if (git(vault, ["worktree", "remove", "--force", work.dir]).status !== 0) {
    rmSync(work.dir, { recursive: true, force: true });
    git(vault, ["worktree", "prune"]);
  }
}

type Outcome = { ok: true; commit: string } | { ok: false; clash: boolean; error: string };

/** Applies `commit` (from `from` to `to`) on top of the vault as it is now, if it applies cleanly. */
function apply(vault: Vault, args: string[], from: string, to: string): Outcome {
  snapshot(vault);
  const trial = git(vault, ["merge-tree", "--write-tree", `--merge-base=${from}`, "HEAD", to]);
  if (trial.status !== 0) return { ok: false, clash: true, error: "your notes changed in the same places since" };
  const r = git(vault, args);
  if (r.status !== 0) {
    git(vault, [args[0], "--abort"]);
    return { ok: false, clash: false, error: (r.stderr || r.stdout).trim().split("\n")[0] || "couldn't apply it" };
  }
  announceChanges(vault.id, vault.reconcile());
  return { ok: true, commit: head(vault) };
}

/** Brings an agent's commit into the vault. */
export const land = (vault: Vault, commit: string) =>
  apply(vault, ["cherry-pick", "--allow-empty", commit], `${commit}^`, commit);

/** Takes a landed commit out again (as a new commit). */
export const unland = (vault: Vault, commit: string) =>
  apply(vault, ["revert", "--no-edit", commit], commit, `${commit}^`);

/** What a commit changed, as a unified diff. */
export const diffOf = (vault: Vault, commit: string) => git(vault, ["show", "--format=", commit]).stdout;
