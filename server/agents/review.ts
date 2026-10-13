/* The checks an agent's changes pass before they reach the vault. Some files belong to the app and
 * may never change (such a run fails outright), and every changed file must still parse (JSON, JSONL,
 * Markdown frontmatter, ```quiz blocks): one that doesn't waits for the learner's OK. Everything else lands at once,
 * since every run can be undone. */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { quizBlocks, quizFromData } from "../../shared/quiz.ts";
import type { FileChange } from "../vault/index.ts";

/** Paths an agent may never change: the app's own records. */
const FORBIDDEN = [
  /^log\//,
  /^profile\.md$/,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^\.gitignore$/,
  /^\.jj\//,
  /^\.git\//,
  /^\.classroom\.json$/,
  /^library\/[^/]+\/book\.json$/,
  /^library\/[^/]+\/demos\//,
  /^\.obsidian\//,
];
/** Every changed file must still be readable by the app (and by Obsidian), and none may be the app's own. */
export function problemsIn(dir: string, files: FileChange[]): string[] {
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
        for (const block of quizBlocks(text)) quizFromData(parseYaml(block));
      }
    } catch (error) {
      problems.push(`${f.path}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  return problems;
}

/** True when a problem is a change to a file agents may not touch: such a run fails outright. */
export const isForbidden = (problem: string) => problem.includes("agents may not change");

/** What waits for the learner's OK: files that can't be read back. */
export const needsReview = (problems: string[]) => problems.map((p) => `Can't be read: ${p}`);
