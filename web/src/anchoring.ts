/* From a selection in the book to an anchor the server keeps (page, boxes, quote, context, offsets),
 * and back: the boxes of an anchor on a rendered page, for highlights and the margin's lines.
 *
 * PDF pages are Lector pages: a positioned box holding the canvas, pdf.js's text layer
 * (.textLayer, transparent spans over the glyphs) and our marker span [data-cr-page]. Boxes are
 * stored as fractions of the page, so they hold at any zoom. */
import { findQuote } from "../../shared/textmatch";
import type { Anchor, Rect } from "./api";

const CONTEXT = 32;

/** Text of a node in reading order, with "\n" for line breaks (pdf.js marks line ends with <br>). */
function textOf(root: Node, until?: { node: Node; offset: number }): string {
  let out = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (until && n === until.node) {
      if (n.nodeType === Node.TEXT_NODE) out += (n as Text).data.slice(0, until.offset);
      else for (let i = 0; i < until.offset && i < n.childNodes.length; i++) out += textOf(n.childNodes[i]);
      return out;
    }
    if (n.nodeType === Node.TEXT_NODE) out += (n as Text).data;
    else if ((n as Element).tagName === "BR") out += "\n";
  }
  return out;
}

/** The node and offset at a character offset of textOf(root). */
function pointAt(root: Node, offset: number): { node: Node; offset: number } | null {
  let seen = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let last: Text | null = null;
  for (let n: Node | null = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = (n as Text).data.length;
      if (seen + len >= offset) return { node: n, offset: offset - seen };
      seen += len;
      last = n as Text;
    } else if ((n as Element).tagName === "BR") seen += 1;
  }
  return last ? { node: last, offset: last.data.length } : null;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export interface PageEl {
  page: number;
  el: HTMLElement;
}
export function pageEls(root: ParentNode): PageEl[] {
  return [...root.querySelectorAll<HTMLElement>("[data-cr-page]")].map((m) => ({ page: Number(m.dataset.crPage), el: m.parentElement as HTMLElement }));
}

/** Boxes of a range as fractions of the pages they fall on, merged into one box per line. */
function rectsOf(range: Range, pages: PageEl[], firstPage: number): Rect[] {
  const raw: Rect[] = [];
  const boxes = pages.map((p) => ({ ...p, box: p.el.getBoundingClientRect() }));
  for (const r of range.getClientRects()) {
    if (r.width < 0.5 || r.height < 0.5) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const p = boxes.find((b) => cx >= b.box.left && cx <= b.box.right && cy >= b.box.top && cy <= b.box.bottom);
    if (!p) continue;
    raw.push({ ...(p.page !== firstPage ? { p: p.page } : {}), x: (r.left - p.box.left) / p.box.width, y: (r.top - p.box.top) / p.box.height, w: r.width / p.box.width, h: r.height / p.box.height });
  }
  raw.sort((a, b) => (a.p ?? firstPage) - (b.p ?? firstPage) || a.y - b.y || a.x - b.x);
  const out: Rect[] = [];
  for (const r of raw) {
    const prev = out[out.length - 1];
    if (prev && prev.p === r.p && Math.abs(prev.y + prev.h / 2 - (r.y + r.h / 2)) < Math.min(prev.h, r.h) * 0.6 && r.x <= prev.x + prev.w + 0.02) {
      const x1 = Math.min(prev.x, r.x);
      const x2 = Math.max(prev.x + prev.w, r.x + r.w);
      const y1 = Math.min(prev.y, r.y);
      const y2 = Math.max(prev.y + prev.h, r.y + r.h);
      Object.assign(prev, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    } else out.push({ ...r });
  }
  return out.map((r) => ({ ...r, x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }));
}
const round = (v: number) => Math.round(v * 10000) / 10000;

/** The anchor of a selection in a PDF view. */
export function pdfAnchor(selection: Selection, root: HTMLElement): Anchor | null {
  if (!selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const pages = pageEls(root);
  const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE ? (range.startContainer as Element) : range.startContainer.parentElement;
  const start = pages.find((p) => startEl && p.el.contains(startEl));
  if (!start) return null;
  const layer = start.el.querySelector<HTMLElement>(".textLayer");
  const quote = clean(selection.toString());
  if (!quote) return null;
  const anchor: Anchor = { page: start.page, quote, rects: rectsOf(range, pages, start.page) };
  if (layer && layer.contains(range.startContainer)) {
    const pageText = textOf(layer);
    const before = textOf(layer, { node: range.startContainer, offset: range.startOffset });
    const startAt = before.length;
    const sameLayer = layer.contains(range.endContainer);
    const endAt = sameLayer ? textOf(layer, { node: range.endContainer, offset: range.endOffset }).length : pageText.length;
    Object.assign(anchor, { start: startAt, end: endAt, prefix: clean(pageText.slice(Math.max(0, startAt - CONTEXT), startAt)) || undefined, suffix: clean(pageText.slice(endAt, endAt + CONTEXT)) || undefined });
  }
  const onPage = anchor.rects!.filter((r) => r.p === undefined);
  if (onPage.length) anchor.y = Math.min(...onPage.map((r) => r.y));
  return anchor;
}

/** The anchor of a selection in a reflowable book (blocks marked [data-block]). */
export function blockAnchor(selection: Selection): Anchor | null {
  if (!selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const blockOf = (n: Node) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement)?.closest<HTMLElement>("[data-block]") || null;
  // a selection that starts or ends between blocks (or spans the whole book) starts at the first block it touches
  const touched = () => [...(range.commonAncestorContainer as Element).querySelectorAll?.<HTMLElement>("[data-block]") || []].filter((el) => range.intersectsNode(el));
  let blocks: HTMLElement[] | null = null;
  const first = blockOf(range.startContainer) || (blocks ||= touched())[0] || null;
  const last = blockOf(range.endContainer) || (blocks ||= touched()).at(-1) || first;
  if (!first) return null;
  const quote = clean(selection.toString());
  if (!quote) return null;
  const text = textOf(first);
  const startAt = first.contains(range.startContainer) ? textOf(first, { node: range.startContainer, offset: range.startOffset }).length : 0;
  const endAt = last === first && first.contains(range.endContainer) ? textOf(first, { node: range.endContainer, offset: range.endOffset }).length : text.length;
  const anchor: Anchor = { block: Number(first.dataset.block), quote, start: startAt, end: endAt, prefix: clean(text.slice(Math.max(0, startAt - CONTEXT), startAt)) || undefined, suffix: clean(text.slice(endAt, endAt + CONTEXT)) || undefined };
  if (last && last !== first) anchor.blockEnd = Number(last.dataset.block);
  return anchor;
}

/* ---------------- back from an anchor ---------------- */

const found = new Map<string, Rect[] | null>();

/**
 * Boxes for an anchor on its (rendered) PDF page: the saved ones, or, for an anchor with only a quote
 * (an agent wrote it, or it came from an older vault), found by matching the quote in the text layer.
 */
export function pdfRects(anchor: Anchor, key: string, page: PageEl | undefined): Rect[] | null {
  if (anchor.rects?.length) return anchor.rects;
  if (found.has(key)) return found.get(key)!;
  const layer = page?.el.querySelector<HTMLElement>(".textLayer");
  if (!page || !layer || !layer.childNodes.length) return null;
  const text = textOf(layer);
  const m = findQuote(text, anchor.quote, { prefix: anchor.prefix, suffix: anchor.suffix, hint: anchor.start });
  let rects: Rect[] | null = null;
  if (m && m.score > 0.7) {
    const a = pointAt(layer, m.start);
    const b = pointAt(layer, m.end);
    if (a && b) {
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      rects = rectsOf(range, [page], page.page);
    }
  }
  found.set(key, rects);
  return rects;
}

/** A DOM range for an anchor in a reflowable book, by its offsets (checked against the quote) or by the quote. */
export function blockRange(anchor: Anchor, root: ParentNode): Range | null {
  if (anchor.block === undefined) return null;
  const first = root.querySelector<HTMLElement>(`[data-block="${anchor.block}"]`);
  if (!first) return null;
  const last = anchor.blockEnd !== undefined ? root.querySelector<HTMLElement>(`[data-block="${anchor.blockEnd}"]`) || first : first;
  const text = textOf(first);
  let start = anchor.start;
  let end = last === first ? anchor.end : undefined;
  const fits = start !== undefined && clean(text.slice(start, end ?? text.length)).slice(0, 24) === anchor.quote.slice(0, 24);
  if (!fits) {
    const m = findQuote(text, anchor.quote, { prefix: anchor.prefix, suffix: anchor.suffix });
    if (!m) return null;
    start = m.start;
    end = last === first ? m.end : undefined;
  }
  const a = pointAt(first, start!);
  const b = last === first ? pointAt(first, end ?? text.length) : pointAt(last, Math.max(0, (anchor.end ?? textOf(last).length)));
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}
