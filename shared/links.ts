/* Links between files, the way Obsidian writes them, so a vault works the same in both:
 *
 *   [[Note]]  [[Note|shown text]]  [[Note#Heading]]  [[Note#^block]]   a link
 *   ![[Note]]  ![[picture.png]]  ![[figure:f1a2b3c4]]                   an embed
 *   [[library/calculus-made-easy/source.pdf#page=12]]                   a page of a book
 *
 * Parsing skips fenced code and inline code. Used by the server (the link index, renames) and the
 * browser (rendering), so both read a note the same way. */

export interface WikiLink {
  /** What the link points at, as written (no "#…" or "|…"). */
  target: string;
  /** After "#": a heading, "^block", or "page=12". */
  sub?: string;
  /** After "|": the text shown instead of the target. */
  alias?: string;
  embed: boolean;
  /** Offsets of the whole "[[…]]" (or "![[…]]") in the text. */
  start: number;
  end: number;
  /** 1-based line. */
  line: number;
}

const LINK = /(!?)\[\[([^\[\]\n|#]*)(?:#([^\[\]\n|]*))?(?:\|([^\[\]\n]*))?\]\]/g;

/** Character ranges of fenced code blocks and inline code, which never hold links. */
export function codeRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  const fence = /^(\s*)(```+|~~~+)[^\n]*\n[\s\S]*?(?:\n\1?\2[ \t]*(?:\n|$)|$)/gm;
  for (const m of text.matchAll(fence)) ranges.push([m.index!, m.index! + m[0].length]);
  const inline = /(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g;
  for (const m of text.matchAll(inline)) {
    const at = m.index!;
    if (!ranges.some(([a, b]) => at >= a && at < b)) ranges.push([at, at + m[0].length]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

const inside = (ranges: [number, number][], at: number) => ranges.some(([a, b]) => at >= a && at < b);

export function parseWikiLinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  const code = codeRanges(text);
  let line = 1;
  let scanned = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index!;
    if (inside(code, at)) continue;
    const target = m[2].trim();
    if (!target && !m[3]) continue;
    for (let i = scanned; i < at; i++) if (text.charCodeAt(i) === 10) line++;
    scanned = at;
    out.push({ target, sub: m[3]?.trim() || undefined, alias: m[4]?.trim() || undefined, embed: m[1] === "!", start: at, end: at + m[0].length, line });
  }
  return out;
}

/** Links written inside frontmatter values (Obsidian properties): related: ["[[A]]", "[[B]]"]. */
export function linksInValue(value: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string") for (const l of parseWikiLinks(v)) out.push(l.target);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(value);
  return out;
}

/** #tags in the body (not in code, not headings, not URLs' fragments). */
export function inlineTags(text: string): string[] {
  const code = codeRanges(text);
  const tags = new Set<string>();
  for (const m of text.matchAll(/(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)) {
    const at = m.index! + m[1].length;
    if (inside(code, at) || /^\d+$/.test(m[2])) continue;
    tags.add(m[2]);
  }
  return [...tags];
}

/** Rewrites link targets: `rename(target)` returns the new target, or null to leave the link alone. */
export function rewriteLinks(text: string, rename: (target: string, link: WikiLink) => string | null): string {
  const links = parseWikiLinks(text);
  if (!links.length) return text;
  let out = "";
  let last = 0;
  for (const link of links) {
    const next = rename(link.target, link);
    if (next === null || next === link.target) continue;
    out += text.slice(last, link.start);
    out += `${link.embed ? "!" : ""}[[${next}${link.sub ? `#${link.sub}` : ""}${link.alias ? `|${link.alias}` : ""}]]`;
    last = link.end;
  }
  return last ? out + text.slice(last) : text;
}

/** A name that is safe as a file name everywhere and still reads like the title. */
export function fileNameOf(title: string, max = 120): string {
  const clean = title
    .replace(/[\\/:*?"<>|#^[\]{}\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, max)
    .trim();
  return clean || "Untitled";
}

/** The page of a book in a link's sub-target ("page=12"), if any. */
export function pageOf(sub?: string): number | undefined {
  const m = sub && /(?:^|&)page=(\d+)/.exec(sub);
  return m ? Number(m[1]) : undefined;
}

/** The key a link target is matched by: no extension, case and spacing folded. */
export const linkKey = (target: string) =>
  target
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
