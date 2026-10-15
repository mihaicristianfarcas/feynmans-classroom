/* Reading a note of an outside vault (Obsidian's, or any folder of Markdown) the way Obsidian reads it:
 * its properties (frontmatter: tags, aliases), its links (both [[wiki links]] and [text](path.md)
 * Markdown links, embeds of either kind, links written in properties), its #tags, its headings, and
 * the part of it a "#heading" or "#^block" link points at. */
import { codeRanges, inlineTags, linksInValue, parseWikiLinks } from "../../shared/links.ts";
import { parseFrontmatter } from "../vault/files.ts";

export interface VaultLink {
  /** As written: a name, a path, or (Markdown links) a relative path, decoded. */
  target: string;
  /** After "#": a heading or "^block". */
  sub?: string;
  alias?: string;
  embed: boolean;
  /** A [text](path) link rather than [[…]]. */
  md: boolean;
  /** Offsets of the whole link in the file, and its 1-based line; -1 for links in properties. */
  start: number;
  end: number;
  line: number;
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface ParsedNote {
  data: Record<string, unknown>;
  body: string;
  tags: string[];
  aliases: string[];
  links: VaultLink[];
  headings: Heading[];
}

const SCHEME = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;
const MD_LINK = /(!?)\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g;

/** Values of a property as a list of strings: "a, b", "a b" (for tags), [a, b]. */
function listOf(value: unknown, splitSpaces = false): string[] {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .flatMap((v) => String(v ?? "").split(splitSpaces ? /[,\s]+/ : /,/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const lineAt = (text: string, at: number) => {
  let line = 1;
  for (let i = 0; i < at; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
};

/** [text](path) links and ![alt](path) embeds to files (not web addresses), outside code. */
export function markdownLinks(text: string): VaultLink[] {
  const code = codeRanges(text);
  const out: VaultLink[] = [];
  for (const m of text.matchAll(MD_LINK)) {
    const at = m.index!;
    if (code.some(([a, b]) => at >= a && at < b)) continue;
    let href = m[3].replace(/^<|>$/g, "");
    if (SCHEME.test(href)) continue;
    try {
      href = decodeURIComponent(href);
    } catch {}
    const hash = href.indexOf("#");
    const target = (hash >= 0 ? href.slice(0, hash) : href).trim();
    if (!target) continue;
    out.push({
      target,
      sub: hash >= 0 ? href.slice(hash + 1).trim() || undefined : undefined,
      alias: m[2] || undefined,
      embed: m[1] === "!",
      md: true,
      start: at,
      end: at + m[0].length,
      line: lineAt(text, at),
    });
  }
  return out;
}

export function headingsOf(text: string): Heading[] {
  const code = codeRanges(text);
  const out: Heading[] = [];
  for (const m of text.matchAll(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)) {
    if (code.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
    out.push({ level: m[1].length, text: m[2].trim(), line: lineAt(text, m.index!) });
  }
  return out;
}

/** Everything the index keeps about a note. Offsets and lines count from the top of the file. */
export function parseNote(text: string): ParsedNote {
  const { data, body } = parseFrontmatter(text);
  const offset = text.length - body.length;
  const shift = (l: VaultLink): VaultLink => ({
    ...l,
    start: l.start + offset,
    end: l.end + offset,
    line: l.line + lineAt(text, offset) - 1,
  });
  const links: VaultLink[] = [
    ...parseWikiLinks(body).map((l) => shift({ ...l, md: false })),
    ...markdownLinks(body).map(shift),
    ...linksInValue(data).map((target) => ({ target, embed: false, md: false, start: -1, end: -1, line: -1 })),
  ];
  const tags = new Set([...listOf(data.tags ?? data.tag, true), ...inlineTags(body)].map((t) => t.replace(/^#/, "")));
  return {
    data,
    body,
    tags: [...tags].filter(Boolean),
    aliases: listOf(data.aliases ?? data.alias),
    links: links.sort((a, b) => a.start - b.start),
    headings: headingsOf(body).map((h) => ({ ...h, line: h.line + lineAt(text, offset) - 1 })),
  };
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The part of a note a link's "#…" names: a heading's section (to the next heading as big), or the
 * block that ends in "^id". The whole body when there's no such part (or no "#…"). */
export function sectionOf(body: string, sub?: string): string {
  if (!sub) return body;
  const lines = body.split("\n");
  if (sub.startsWith("^")) {
    const id = sub.slice(1).toLowerCase();
    const at = lines.findIndex((l) => new RegExp(`\\s\\^${id.replace(/[^a-z0-9-]/g, "")}\\s*$`, "i").test(l));
    if (at < 0) return body;
    let start = at;
    // a paragraph is the lines above it up to a blank line; a list item is just its line
    if (!/^\s*([-*+]|\d+\.)\s/.test(lines[at])) while (start > 0 && lines[start - 1].trim()) start--;
    return lines
      .slice(start, at + 1)
      .join("\n")
      .replace(/\s\^[\w-]+\s*$/, "");
  }
  // "A#B" (a heading inside a heading): the last one names the section
  const want = fold(sub.split("#").pop() || "");
  const heads = headingsOf(body);
  const head = heads.find((h) => fold(h.text) === want);
  if (!head) return body;
  const next = heads.find((h) => h.line > head.line && h.level <= head.level);
  return lines.slice(head.line - 1, next ? next.line - 1 : undefined).join("\n");
}
