/* A vault's history: a git repository of its notes (.md files only, nothing hidden) kept in
 * DATA_DIR/vault-meta/<id>/history.git, outside the vault's folder, with the folder as its work tree.
 * A snapshot is taken when the vault is first read, a few quiet minutes after its notes change, and
 * around anything the app does in bulk (an agent's changes, bringing a version back). A note's
 * versions are the snapshots that changed it, followed across renames. */
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../config.ts";
import { parseNote } from "./parse.ts";
import type { Vault } from "./vault.ts";

/** Where the app keeps what it knows about a vault beside its files (history, connections). */
export const metaDir = (id: string) => join(DATA_DIR, "vault-meta", id);
const gitDir = (id: string) => join(metaDir(id), "history.git");

const QUIET_MS = Number(process.env.VAULT_SITTING_MS) || 3 * 60 * 1000;

// every file is left out, then folders and notes let back in, then anything hidden left out again
const EXCLUDE = "*\n!*/\n!*.md\n.*\nnode_modules/\n";

/** Runs git on a vault's history: in its folder, or in another work tree (`cwd`, an agent's copy). */
export function git(
  vault: Vault,
  args: string[],
  opts: { cwd?: string; input?: string } = {},
): SpawnSyncReturns<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  if (!opts.cwd) {
    env.GIT_DIR = gitDir(vault.id);
    env.GIT_WORK_TREE = vault.root;
  }
  return spawnSync(
    "git",
    [
      "-c",
      "user.name=Feynman's Classroom",
      "-c",
      "user.email=classroom@localhost",
      "-c",
      "core.quotepath=false",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { cwd: opts.cwd ?? vault.root, env, encoding: "utf8", input: opts.input, maxBuffer: 256 * 1024 * 1024 },
  );
}

/** Runs git and returns its output, or throws with what it said. */
export function gitOut(vault: Vault, args: string[], opts: { cwd?: string } = {}): string {
  const r = git(vault, args, opts);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `git ${args[0]} failed`).trim().split("\n")[0]);
  return r.stdout;
}

function ensureRepo(vault: Vault) {
  const dir = gitDir(vault.id);
  if (existsSync(join(dir, "HEAD"))) return;
  mkdirSync(dir, { recursive: true });
  gitOut(vault, ["init", "-q"]);
  mkdirSync(join(dir, "info"), { recursive: true });
  writeFileSync(join(dir, "info", "exclude"), EXCLUDE);
}

const title = (path: string) => (path.split("/").pop() || path).replace(/\.md$/i, "");

/** What a snapshot changed, in a few words ("Edited Energy", "Added 3 notes, edited 2"). */
function describe(lines: string[]): string {
  const counts = { added: [] as string[], edited: [] as string[], moved: [] as string[], deleted: [] as string[] };
  for (const line of lines) {
    const [status, ...paths] = line.split("\t");
    const path = paths[paths.length - 1];
    if (status.startsWith("A")) counts.added.push(path);
    else if (status.startsWith("D")) counts.deleted.push(path);
    else if (status.startsWith("R")) counts.moved.push(path);
    else counts.edited.push(path);
  }
  const parts = Object.entries(counts)
    .filter(([, paths]) => paths.length)
    .map(([what, paths]) => `${what} ${paths.length === 1 ? title(paths[0]) : `${paths.length} notes`}`);
  const text = parts.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

/** Records the notes as they are now; returns the snapshot's commit, or null if nothing changed. */
export function snapshot(vault: Vault, message?: string): string | null {
  ensureRepo(vault);
  gitOut(vault, ["add", "-A"]);
  const staged = gitOut(vault, ["diff", "--cached", "--name-status", "-M"]).trim();
  if (!staged) return null;
  gitOut(vault, ["commit", "-q", "--no-verify", "-m", message || describe(staged.split("\n"))]);
  return head(vault);
}

export const head = (vault: Vault) => gitOut(vault, ["rev-parse", "HEAD"]).trim();

const timers = new Map<string, NodeJS.Timeout>();

/** The vault's notes changed: a snapshot follows once they've been quiet for a few minutes. */
export function noteChanged(vault: Vault) {
  clearTimeout(timers.get(vault.id));
  const timer = setTimeout(() => {
    timers.delete(vault.id);
    try {
      snapshot(vault);
    } catch (error) {
      console.warn(`[vaults] no snapshot of ${vault.root}:`, (error as Error).message);
    }
  }, QUIET_MS);
  timer.unref();
  timers.set(vault.id, timer);
}

/** Takes the first snapshot of a vault just read, a moment later (a big vault takes a while to add). */
export function startHistory(vault: Vault) {
  setTimeout(() => {
    try {
      snapshot(vault, existsSync(join(gitDir(vault.id), "refs", "heads")) ? undefined : "Opened in the app");
    } catch (error) {
      console.warn(`[vaults] no history for ${vault.root}:`, (error as Error).message);
    }
  }, 1000).unref();
}

/** Forgets a vault's history and what else the app kept beside it. */
export function dropMeta(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  rmSync(metaDir(id), { recursive: true, force: true });
}

export interface VaultVersion {
  commit: string;
  when: string;
  subject: string;
  /** The note's path in that version (it may have been renamed since). */
  path: string;
}

/** The snapshots that changed the note at `path`, newest first. */
export function versions(vault: Vault, path: string): VaultVersion[] {
  ensureRepo(vault);
  const r = git(vault, [
    "log",
    "--follow",
    "--diff-filter=AMR",
    "--name-only",
    "--format=%x1e%H%x1f%cI%x1f%s",
    "--",
    path,
  ]);
  if (r.status !== 0) return [];
  return r.stdout
    .split("\x1e")
    .filter((s) => s.trim())
    .map((record) => {
      const [first, ...rest] = record.split("\n");
      const [commit, when, subject] = first.split("\x1f");
      return { commit, when, subject, path: rest.find((l) => l.trim())?.trim() || path };
    });
}

function versionAt(vault: Vault, path: string, commit: string): VaultVersion {
  const v = versions(vault, path).find((x) => x.commit === commit);
  if (!v) throw new Error("that version isn't in the history");
  return v;
}

/** A note as it was in one snapshot (its body, and its whole text), and what that snapshot changed in it. */
export function versionOf(vault: Vault, path: string, commit: string) {
  const v = versionAt(vault, path, commit);
  const text = gitOut(vault, ["show", `${commit}:${v.path}`]);
  const diff = git(vault, ["show", "--format=", "-M", commit, "--", v.path]).stdout;
  return { text, body: parseNote(text).body, diff };
}
