/* Changing one list property of a vault note's frontmatter (`related`, `about`) without touching the
 * rest: the other properties keep their order, quoting and comments (spacing may be tidied); a note
 * without properties gets a frontmatter block. Links are written as Obsidian writes them: "[[Name]]". */
import { isSeq, parseDocument } from "yaml";

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** The property `key` of a note's text as a list of strings. */
export function listProperty(text: string, key: string): string[] {
  const m = FRONT.exec(text);
  if (!m) return [];
  const value = parseDocument(m[1]).toJS()?.[key];
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => String(v));
}

/** The text with property `key` set to `list` (removed when it's empty). */
export function setListProperty(text: string, key: string, list: string[]): string {
  const m = FRONT.exec(text);
  const doc = parseDocument(m ? m[1] : "");
  if (doc.errors.length) throw new Error("this note's properties can't be read");
  if (!list.length) doc.delete(key);
  else {
    const node = doc.createNode(list);
    if (isSeq(node)) node.flow = false;
    doc.set(key, node);
  }
  const out = doc.toString({ flowCollectionPadding: false }).trimEnd();
  const yaml = out && out !== "{}" ? out : "";
  const body = m ? text.slice(m[0].length) : text;
  return yaml ? `---\n${yaml}\n---\n${body}` : body;
}

const key = (link: string) =>
  link
    .replace(/^\[\[|\]\]$/g, "")
    .split("|")[0]
    .trim()
    .toLowerCase();

/** Adds a [[link]] to a list property, unless it's there. */
export function addLink(text: string, prop: string, to: string): string {
  const list = listProperty(text, prop);
  if (list.some((l) => key(l) === key(to))) return text;
  return setListProperty(text, prop, [...list, `[[${to}]]`]);
}

/** Takes a [[link]] out of a list property. */
export function removeLink(text: string, prop: string, to: string): string {
  const list = listProperty(text, prop);
  const kept = list.filter((l) => key(l) !== key(to));
  return kept.length === list.length ? text : setListProperty(text, prop, kept);
}
