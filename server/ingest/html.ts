import { parseHTML } from "linkedom";
import type { Block } from "../types.ts";

const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
  "figure",
  "table",
  "dt",
  "dd",
  "hr",
]);
const CONTAINER_TAGS = new Set([
  "div",
  "section",
  "article",
  "body",
  "main",
  "header",
  "footer",
  "aside",
  "nav",
  "ul",
  "ol",
  "dl",
  "figure",
  "blockquote",
]);
const INLINE_OK = new Set([
  "em",
  "i",
  "b",
  "strong",
  "sub",
  "sup",
  "br",
  "span",
  "small",
  "a",
  "code",
  "img",
  "abbr",
  "cite",
  "q",
  "s",
  "u",
  "var",
  "kbd",
  "tt",
  "big",
]);
const TABLE_OK = new Set(["table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col"]);
const DROP = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "link",
  "meta",
  "svg",
  "math",
  "noscript",
  "template",
]);

const escapeHtml = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

interface Walk {
  blocks: Block[];
  ids: Map<string, number>;
  chapter: number;
  rewriteSrc: (src: string) => string | null;
}

/** Sanitized inner HTML of a block: only harmless inline tags survive, every attribute is dropped except img src/alt. */
function inner(node: Node, walk: Walk, table = false): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) out += escapeHtml(child.textContent || "");
    else if (child.nodeType === 1) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (el.id) walk.ids.set(el.id, walk.blocks.length);
      if (DROP.has(tag)) continue;
      if (tag === "img") {
        const src = walk.rewriteSrc(el.getAttribute("src") || el.getAttribute("xlink:href") || "");
        if (src) out += `<img src="${escapeHtml(src)}" alt="${escapeHtml(el.getAttribute("alt") || "")}">`;
        continue;
      }
      if (tag === "br") {
        out += "<br>";
        continue;
      }
      const body = inner(el, walk, table);
      if (INLINE_OK.has(tag) || (table && TABLE_OK.has(tag)))
        out += tag === "a" ? `<span class="ln">${body}</span>` : `<${tag}>${body}</${tag}>`;
      else out += body;
    }
  }
  return out;
}

function hasBlockChild(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    const tag = child.tagName.toLowerCase();
    if (
      BLOCK_TAGS.has(tag) ||
      (CONTAINER_TAGS.has(tag) && tag !== "figure" && tag !== "blockquote") ||
      hasBlockChild(child)
    )
      return true;
  }
  return false;
}

function pushBlock(walk: Walk, tag: string, html: string, text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean && !/<img/.test(html) && tag !== "hr") return;
  walk.blocks.push({ id: walk.blocks.length, chapter: walk.chapter, tag, html: html.trim(), text: clean });
}

function visit(el: Element, walk: Walk) {
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return;
  if (el.id) walk.ids.set(el.id, walk.blocks.length);
  if (tag === "img") {
    const src = walk.rewriteSrc(el.getAttribute("src") || "");
    if (src)
      pushBlock(
        walk,
        "figure",
        `<img src="${escapeHtml(src)}" alt="${escapeHtml(el.getAttribute("alt") || "")}">`,
        el.getAttribute("alt") || "",
      );
    return;
  }
  if (tag === "table") {
    pushBlock(walk, "table", inner(el, walk, true), el.textContent || "");
    return;
  }
  if (
    (BLOCK_TAGS.has(tag) && !hasBlockChild(el)) ||
    (!CONTAINER_TAGS.has(tag) && !hasBlockChild(el) && !BLOCK_TAGS.has(tag))
  ) {
    const blockTag = BLOCK_TAGS.has(tag) ? tag : "p";
    pushBlock(walk, blockTag, inner(el, walk), el.textContent || "");
    return;
  }
  // a container: loose text runs between child blocks become paragraphs of their own
  let loose = "";
  const flush = () => {
    if (loose.replace(/<[^>]+>/g, "").trim()) pushBlock(walk, "p", loose, loose.replace(/<[^>]+>/g, " "));
    loose = "";
  };
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) loose += escapeHtml(child.textContent || "");
    else if (child.nodeType === 1) {
      const c = child as Element;
      const ctag = c.tagName.toLowerCase();
      if (INLINE_OK.has(ctag) && !hasBlockChild(c) && ctag !== "img") {
        const wrapper = parseHTML("<div></div>").document.createElement("div");
        wrapper.appendChild(c.cloneNode(true));
        loose += inner(wrapper as unknown as Node, walk);
      } else {
        flush();
        visit(c, walk);
      }
    }
  }
  flush();
}

/** Walks a document body into sanitized blocks; returns element ids mapped to the index of the block they start. */
export function htmlToBlocks(
  html: string,
  start: { blocks: Block[]; chapter: number },
  rewriteSrc: (src: string) => string | null = () => null,
) {
  const { document } = parseHTML(html.replace(/<\?xml[^>]*>/, ""));
  const body = document.body || document.documentElement;
  const walk: Walk = { blocks: start.blocks, ids: new Map(), chapter: start.chapter, rewriteSrc };
  if (body) visit(body as unknown as Element, walk);
  return walk.ids;
}

export function textOfHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
