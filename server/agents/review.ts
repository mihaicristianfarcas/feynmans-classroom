/* The checks an agent's changes pass before they reach the vault. Some files belong to the app and
 * may never change; every changed file must still parse (JSON, JSONL, Markdown frontmatter); and
 * deleting files or taking lines out of the learner's notes waits for their approval. */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentRun } from "../../shared/vault-types.ts";
import { git } from "../vault/index.ts";

type Changes = NonNullable<AgentRun["files"]>;

/** Paths an agent may never change: the app's own records. */
const FORBIDDEN = [
  /^log\//,
  /^profile\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^\.gitignore$/,
  /^\.classroom\.json$/,
  /^library\/[^/]+\/book\.json$/,
  /^library\/[^/]+\/demos\//,
  /^\.obsidian\//,
];
/** Changes that wait for the learner: deleting anything, or taking lines out of their notes and concepts. */
const PROTECTED = /^(notes|concepts)\//;

/** The files a run's commit changed (added, modified, deleted), and how many lines each lost. */
export function changesIn(dir: string): { files: Changes; removed: Map<string, number> } {
  const status = git(["diff", "--name-status", "--no-renames", "HEAD~1", "HEAD"], dir).stdout.trim();
  const files = status
    ? status.split("\n").map((line) => {
        const [change, ...rest] = line.split("\t");
        return { path: rest.join("\t"), change: (change[0] as "A" | "M" | "D") || "M" };
      })
    : [];
  const removed = new Map<string, number>();
  for (const line of git(["diff", "--numstat", "--no-renames", "HEAD~1", "HEAD"], dir)
    .stdout.trim()
    .split("\n")
    .filter(Boolean)) {
    const [, del, ...rest] = line.split("\t");
    removed.set(rest.join("\t"), Number(del) || 0);
  }
  return { files, removed };
}

/** Every changed file must still be readable by the app (and by Obsidian), and none may be the app's own. */
export function problemsIn(dir: string, files: Changes): string[] {
  const problems: string[] = [];
  for (const f of files) {
    if (FORBIDDEN.some((re) => re.test(f.path)))
      problems.push(`${f.path}: the app keeps this file; agents may not change it`);
    if (f.change === "D") continue;
    const full = join(dir, f.path);
    if (!existsSync(full) || lstatSync(full).isSymbolicLink()) continue;
    const text = readFileSync(full, "utf8");
    try {
      if (f.path.endsWith(".json")) JSON.parse(text);
      else if (f.path.endsWith(".jsonl")) {
        for (const line of text.split("\n")) if (line.trim()) JSON.parse(line);
      } else if (f.path.endsWith(".md")) {
        const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
        if (m) parseYaml(m[1]);
        else if (text.startsWith("---")) throw new Error("frontmatter is not closed");
      }
    } catch (error) {
      problems.push(`${f.path}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  return problems;
}

/** True when a problem is a change to a file agents may not touch: such a run fails outright. */
export const isForbidden = (problem: string) => problem.includes("agents may not change");

/** What waits for the learner's OK: unreadable files, deletions, and lines taken out of notes and concepts. */
export function needsReview(files: Changes, removed: Map<string, number>, problems: string[]): string[] {
  return [
    ...problems.map((p) => `Can't be read: ${p}`),
    ...files.filter((f) => f.change === "D").map((f) => `Deletes ${f.path}`),
    ...files
      .filter((f) => f.change === "M" && PROTECTED.test(f.path) && (removed.get(f.path) || 0) > 0)
      .map((f) => `Rewrites ${f.path} (${removed.get(f.path)} line${removed.get(f.path) === 1 ? "" : "s"} out)`),
  ];
}
