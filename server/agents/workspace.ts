/* An agent's working copy: a git worktree of the vault on its own branch (agent/<id>), outside the
 * vault in DATA_DIR/agent-runs/<id>, so it never edits a file the learner has open. The vault's
 * derived, unversioned files (the books' text, the indexes) are linked in for it to read. */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { RUNS_DIR } from "../config.ts";
import { GENERATED, git, VAULT } from "../vault/index.ts";

/** The branch a run works on. */
export const branch = (id: string) => `agent/${id}`;
/** The folder of a run's working copy. */
export const dirOf = (id: string) => join(RUNS_DIR, id);

/** Makes the working copy for a run; returns its folder and the derived files linked into it. */
export function createWorkingCopy(id: string): { dir: string; linked: string[] } {
  const dir = dirOf(id);
  mkdirSync(RUNS_DIR, { recursive: true });
  const add = git(["worktree", "add", "-q", "-b", branch(id), dir, "HEAD"]);
  if (!add.ok) throw new Error(`could not make a working copy: ${add.stderr.trim()}`);
  return { dir, linked: linkDerived(dir) };
}

/** Takes the linked files out again, so they aren't committed with the agent's changes. */
export function unlinkDerived(dir: string, linked: string[]) {
  for (const rel of linked) {
    try {
      if (lstatSync(join(dir, rel)).isSymbolicLink()) unlinkSync(join(dir, rel));
    } catch {}
  }
}

/** Links the vault's derived, unversioned files into a working copy (read-only for the agent). */
function linkDerived(dir: string): string[] {
  const linked: string[] = [];
  const link = (rel: string) => {
    const from = join(VAULT, rel);
    const to = join(dir, rel);
    if (!existsSync(from) || existsSync(to)) return;
    mkdirSync(join(to, ".."), { recursive: true });
    symlinkSync(from, to);
    linked.push(rel);
  };
  for (const rel of [...GENERATED, "brain/links.tsv", "brain/unresolved.tsv"]) link(rel);
  if (existsSync(join(VAULT, "library")))
    for (const book of readdirSync(join(VAULT, "library"))) {
      const meta = join(VAULT, "library", book, "book.json");
      if (!existsSync(meta)) continue;
      link(`library/${book}/text`);
      link(`library/${book}/README.md`);
      try {
        const file = (JSON.parse(readFileSync(meta, "utf8")) as { file?: string }).file;
        if (file) link(`library/${book}/${file}`);
      } catch {}
    }
  return linked;
}

/** Removes a run's working copy and its branch. */
export function removeWorkingCopy(id: string) {
  const dir = dirOf(id);
  if (existsSync(dir)) git(["worktree", "remove", "--force", dir]);
  rmSync(dir, { recursive: true, force: true });
  git(["worktree", "prune"]);
  git(["branch", "-D", branch(id)]);
}
