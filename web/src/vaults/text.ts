/* Small edits to a note's text that the vaults page makes for you: ticking a task box from the text
 * read, and turning a mention of a note into a link to it. Also the text after a note's properties. */

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])\]/;

/** A note's text without its properties (the frontmatter). */
export const bodyOf = (text: string) => text.replace(FRONTMATTER, "");

/** Ticks or clears the task on `line` (1-based, of the text after the properties); null if it's not a task. */
export function toggleTaskAt(text: string, line: number): string | null {
  const front = FRONTMATTER.exec(text)?.[0] ?? "";
  const lines = text.split("\n");
  const at = line - 1 + (front.match(/\n/g)?.length ?? 0);
  if (!TASK.test(lines[at] ?? "")) return null;
  lines[at] = lines[at].replace(TASK, (_, open: string, mark: string) => `${open}${mark === " " ? "x" : " "}]`);
  return lines.join("\n");
}

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Turns the first unlinked mention of one of `names` on `line` of the text into a link to `target`
 * (keeping the words as written: [[Target|words]]); null if the line has none. */
export function linkMention(text: string, line: number, names: string[], target: string): string | null {
  const lines = text.split("\n");
  const at = lines[line - 1];
  if (at === undefined) return null;
  for (const name of names) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}[|])${literal(name)}(?![\\p{L}\\p{N}\\]])`, "iu");
    const m = re.exec(at);
    if (!m) continue;
    const link = m[0] === target ? `[[${target}]]` : `[[${target}|${m[0]}]]`;
    lines[line - 1] = at.slice(0, m.index) + link + at.slice(m.index + m[0].length);
    return lines.join("\n");
  }
  return null;
}
