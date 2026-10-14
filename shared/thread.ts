/* Conversations. A margin card's, as its file keeps it: the answer, then each follow-up question as a
 * "## Follow-up: …" heading with its answer under it (readable in any editor, and in Obsidian); the
 * reader draws it as a chat, and a redrawn figure keeps it; a closed card shows the answer's gist. And
 * any conversation as plain text, for a model to make a note or cards from. */

export interface Turn {
  role: "user" | "tutor";
  text: string;
}

/** An answer and its follow-ups, split into turns. */
export function threadOf(body: string): { answer: string; turns: Turn[] } {
  const parts = body.split(/^## Follow-up: (.*)$/m);
  const turns: Turn[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    turns.push({ role: "user", text: parts[i].trim() });
    turns.push({ role: "tutor", text: (parts[i + 1] || "").trim() });
  }
  return { answer: parts[0].trim(), turns };
}

/** The follow-ups at the end of an answer, as they are in the file (empty when there are none). */
export function followUpsOf(body: string): string {
  const at = body.search(/^## Follow-up: /m);
  return at >= 0 ? body.slice(at).trim() : "";
}

/** An answer with a follow-up added. */
export function withFollowUp(body: string, question: string, answer: string): string {
  return `${body.trim()}\n\n## Follow-up: ${question.replace(/\s+/g, " ").trim()}\n\n${answer.trim()}`;
}

/** A conversation as plain text ("Learner: …", "Tutor: …"), at most `max` characters: when it is longer,
 * its first question and as much of its end as fits. */
export function transcript(turns: Turn[], max = 12000): string {
  const lines = turns.map((t) => `${t.role === "user" ? "Learner" : "Tutor"}: ${t.text.trim()}`);
  const all = lines.join("\n\n");
  if (all.length <= max) return all;
  const first = lines[0].slice(0, Math.floor(max / 4));
  let tail = "";
  for (let i = lines.length - 1; i > 0 && first.length + tail.length + lines[i].length + 8 <= max; i--)
    tail = `${lines[i]}\n\n${tail}`;
  return `${first}\n\n[…]\n\n${tail.trim()}`;
}

/** An answer in one line, for a closed card in the margin: the words it bolded as the answer when it
 * asks for that (`key`), else its opening sentence (enough of it to stand on), as plain text. */
export function gistOf(answer: string, { key = false, max = 180 } = {}): string {
  const plain = (s: string) =>
    s
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, a: string, b: string) => b || a.split("/").pop() || "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
      .replace(/(^|\W)[*_]([^*_\n]+)[*_](?=\W|$)/g, "$1$2")
      .replace(/`([^`]+)`|==([^=]+)==/g, "$1$2")
      .replace(/\$([^$\n]+)\$/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  const bold = answer.match(/\*\*([^*\n]{3,120})\*\*/)?.[1];
  if (key && bold && bold.trim().split(/\s+/).length >= 2) return plain(bold);
  const body = answer
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .split(/\n+/)
    .filter((line) => !/^\s*#+\s/.test(line))
    .map((line) => line.replace(/^\s*([-*+]|\d+[.)]|>)\s+/, ""))
    .map(plain)
    .filter((line) => /\p{L}/u.test(line));
  const text = body.join(" ");
  let out = "";
  for (const sentence of text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? []) {
    out += sentence;
    if (out.trim().length >= 40) break;
  }
  out = out.trim();
  return out.length > max ? `${out.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : out;
}
