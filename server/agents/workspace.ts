/* An agent's working copy: a jj workspace of the vault (agent-<id>) in DATA_DIR/agent-runs/<vault>/<id>,
 * outside the vault, so it never edits a file the learner has open. It starts from the latest change
 * in the history; what the agent writes becomes that workspace's change, which is landed (or not)
 * after the workspace is forgotten. The vault's derived, unversioned files (the books' text, the
 * indexes) are linked in for it to read. */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { RUNS_DIR } from "../config.ts";
import { currentVault, GENERATED, vaultDir } from "../vault/index.ts";
import { addWorkspace, forgetWorkspace, workspaces } from "../vault/jj.ts";

const PREFIX = "agent-";
/** The jj workspace a run works in. */
export const workspaceOf = (id: string) => `${PREFIX}${id}`;
/** The working copies of the vault's runs. */
const runsDir = () => join(RUNS_DIR, currentVault().id);
/** The folder of a run's working copy. */
export const dirOf = (id: string) => join(runsDir(), id);

/** Makes the working copy for a run on top of `base`; returns its folder and the derived files linked into it. */
export function createWorkingCopy(id: string, base: string): { dir: string; linked: string[] } {
  const dir = dirOf(id);
  mkdirSync(runsDir(), { recursive: true });
  rmSync(dir, { recursive: true, force: true });
  addWorkspace(workspaceOf(id), dir, base);
  return { dir, linked: linkDerived(dir) };
}

/** Takes the linked files out again, so jj never sees them as the agent's. */
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
    const from = join(vaultDir(), rel);
    const to = join(dir, rel);
    if (!existsSync(from) || existsSync(to)) return;
    mkdirSync(join(to, ".."), { recursive: true });
    symlinkSync(from, to);
    linked.push(rel);
  };
  for (const rel of [...GENERATED, "brain/links.tsv", "brain/unresolved.tsv"]) link(rel);
  if (existsSync(join(vaultDir(), "library")))
    for (const book of readdirSync(join(vaultDir(), "library"))) {
      const meta = join(vaultDir(), "library", book, "book.json");
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

/** Forgets a run's workspace and deletes its folder (its change stays in the repository). */
export function removeWorkingCopy(id: string) {
  forgetWorkspace(workspaceOf(id));
  rmSync(dirOf(id), { recursive: true, force: true });
}

/** After a restart (or on opening the vault again): forgets the workspaces and folders of runs that are no longer going. */
export function cleanUpWorkingCopies(going: Set<string>) {
  for (const name of workspaces())
    if (name.startsWith(PREFIX) && !going.has(name.slice(PREFIX.length))) forgetWorkspace(name);
  if (existsSync(runsDir()))
    for (const id of readdirSync(runsDir())) if (!going.has(id)) rmSync(dirOf(id), { recursive: true, force: true });
}
