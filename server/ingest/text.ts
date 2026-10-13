import { readFileSync } from "node:fs";
import type { Block, TocEntry } from "../types.ts";
import { finishBlockToc, headingToc, type ReflowIngest } from "./epub.ts";
import { textOfHtml } from "./html.ts";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Minimal inline Markdown: emphasis, strong, code. Everything else stays text. */
function inline(text: string) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
}

const CHAPTER_LINE = /^(chapter|lecture|part|book|section)\s+([0-9]+|[ivxlcdm]+)\b.*$/i;

export function ingestText(path: string, markdown: boolean): ReflowIngest {
  let source = readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
  // Project Gutenberg plain text: keep only the book between the START/END markers
  const start = source.match(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const end = source.match(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (start && start.index !== undefined) source = source.slice(start.index + start[0].length, end?.index ?? undefined);

  const blocks: Block[] = [];
  // block text is what anchors match and what the planner reads: the rendered words, without Markdown marks
  const push = (tag: string, html: string, _source?: string) => blocks.push({ id: blocks.length, chapter: 0, tag, html, text: textOfHtml(html) });
  let title: string | undefined;
  for (const chunk of source.split(/\n\s*\n/)) {
    const raw = chunk.trim();
    if (!raw) continue;
    const md = markdown ? raw.match(/^(#{1,4})\s+(.+)$/) : null;
    if (md && !raw.includes("\n")) {
      const level = md[1].length;
      if (level === 1 && !title) title = md[2].trim();
      push(`h${Math.min(level + (level === 1 ? 0 : 0), 4)}`, inline(md[2]), md[2]);
      continue;
    }
    const oneLine = !raw.includes("\n");
    if (oneLine && (CHAPTER_LINE.test(raw) || (raw.length < 70 && raw === raw.toUpperCase() && /[A-Z]{3}/.test(raw)))) {
      push("h2", esc(raw), raw);
      continue;
    }
    if (markdown && /^(\s*[-*+]|\s*\d+\.)\s+/.test(raw)) {
      for (const item of raw.split(/\n(?=\s*([-*+]|\d+\.)\s+)/)) if (item && !/^([-*+]|\d+\.)$/.test(item.trim())) push("li", inline(item.replace(/^\s*([-*+]|\d+\.)\s+/, "")), item);
      continue;
    }
    if (markdown && /^```/.test(raw)) {
      push("pre", esc(raw.replace(/^```\w*\n?|```$/g, "")), raw);
      continue;
    }
    if (markdown && /^>/.test(raw)) {
      const body = raw.replace(/^>\s?/gm, "");
      push("blockquote", inline(body), body);
      continue;
    }
    const text = raw.replace(/\s*\n\s*/g, " ");
    push("p", markdown ? inline(text) : esc(text), text);
  }
  let toc: TocEntry[] = headingToc(blocks);
  if (!toc.length) toc = [{ id: "", title: title || "Text", start: { block: 0 }, end: { block: blocks.length }, sections: [] }];
  finishBlockToc(toc, blocks);
  return { title, blocks, toc };
}
