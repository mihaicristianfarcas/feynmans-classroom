/* Turning a plain mention of a document's title into a link, in a note of the app's data vault (notes the
 * learner writes live in vaults: vaults/). Everything else a document does (made, changed, renamed,
 * versions) is learn/docs.ts. */
import { docs } from "../vault/index.ts";
import { updateDoc } from "./docs.ts";

/** Turns the first plain mention of a document's title (or alias) in a note into a link. */
export function linkMention(targetId: string, inPath: string) {
  const target = docs.get(targetId);
  const other = docs.at(inPath, "note");
  if (!target || !other) throw new Error("note not found");
  const names = [target.title, ...target.aliases].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}\\[|])(${escaped})(?=$|[^\\p{L}\\p{N}\\]|])`, "iu");
  const lines = other.body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/\[\[[^\]]*\]\]/.test(lines[i]) && lines[i].toLowerCase().includes(`[[${target.title.toLowerCase()}`)) continue;
    const m = pattern.exec(lines[i]);
    if (!m) continue;
    const found = m[2];
    const link = found === target.title ? `[[${target.title}]]` : `[[${target.title}|${found}]]`;
    lines[i] = lines[i].slice(0, m.index + m[1].length) + link + lines[i].slice(m.index + m[1].length + found.length);
    return updateDoc(other.id, { body: lines.join("\n") });
  }
  return other;
}
