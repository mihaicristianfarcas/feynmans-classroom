/* Where an annotation's passage is, in every form the platform needs:
 *
 *   - the chapter it belongs to (from its page and height),
 *   - its height on the page (from the selection's boxes, or by finding the quote in the page's
 *     positioned lines: that's how an annotation an agent wrote with only a page and a quote gets a
 *     place in the margin),
 *   - the same passage in the book's Markdown text (library/<book>/text/NN-*.md, file and line), so an
 *     agent can go straight to it with `sed -n`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findQuote, lineAt } from "../../shared/textmatch.ts";
import type { Anchor } from "../../shared/vault-types.ts";
import { getBlocks, getPages } from "../store.ts";
import type { Book, TocEntry } from "../types.ts";
import { VAULT } from "../vault/index.ts";
import { chapterFile } from "../vault/library.ts";

const posOf = (l: { page?: number; y?: number; block?: number }) => (l.page !== undefined ? l.page + (l.y ?? 0) : (l.block ?? 0));

export function chapterAt(book: Book, anchor: Pick<Anchor, "page" | "y" | "block">): { entry: TocEntry; index: number } | null {
  const at = posOf(anchor);
  for (let i = book.toc.length - 1; i >= 0; i--) if (posOf(book.toc[i].start) <= at + 1e-6) return { entry: book.toc[i], index: i };
  return book.toc[0] ? { entry: book.toc[0], index: 0 } : null;
}

/** The top of the quote on its PDF page (0–1), found in the page's extracted lines. */
export function locateOnPage(book: Book, page: number, anchor: Pick<Anchor, "quote" | "prefix" | "suffix">): number | undefined {
  const lines = getPages(book.id)[page - 1]?.lines;
  if (!lines?.length) return undefined;
  let text = "";
  const starts: number[] = [];
  for (const line of lines) {
    starts.push(text.length);
    text += `${line.t}\n`;
  }
  const m = findQuote(text, anchor.quote, { prefix: anchor.prefix, suffix: anchor.suffix });
  if (!m || m.score < 0.6) return undefined;
  let i = 0;
  while (i + 1 < starts.length && starts[i + 1] <= m.start) i++;
  return lines[i].y;
}

/** The quote in the book's chapter text file: { file, line, score }. */
export function locateInText(book: Book, anchor: Anchor): Anchor["md"] | undefined {
  const chapter = chapterAt(book, anchor);
  if (!chapter) return undefined;
  // the passage's own chapter first, then its neighbours (a selection near a chapter edge)
  for (const index of [chapter.index, chapter.index + 1, chapter.index - 1]) {
    if (index < 0 || index >= book.toc.length) continue;
    const file = chapterFile(book, index);
    const path = join(VAULT, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const marker = anchor.page !== undefined ? `[[page ${anchor.page}]]` : `[[block ${anchor.block}]]`;
    const hint = text.indexOf(marker);
    const m = findQuote(text, anchor.quote, { prefix: anchor.prefix, suffix: anchor.suffix, hint: hint >= 0 ? hint : undefined, markdown: true });
    if (m && m.score >= 0.7) return { file, line: lineAt(text, m.start), score: Math.round(m.score * 100) / 100 };
  }
  return undefined;
}

/** Offsets of the quote in a reflowable book's block text, when the browser didn't send them. */
export function locateInBlock(book: Book, anchor: Anchor): { start: number; end: number } | undefined {
  if (anchor.block === undefined) return undefined;
  const block = getBlocks(book.id).find((b) => b.id === anchor.block);
  if (!block) return undefined;
  const m = findQuote(block.text, anchor.quote, { prefix: anchor.prefix, suffix: anchor.suffix });
  return m && m.score >= 0.7 ? { start: m.start, end: m.end } : undefined;
}

/** Fills in what an anchor is missing (height, chapter text location), cleaning what was sent. */
export function completeAnchor(book: Book, raw: Anchor): Anchor {
  const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : undefined);
  const anchor: Anchor = {
    quote: clip(raw.quote, 6000) || "",
    prefix: clip(raw.prefix, 64),
    suffix: clip(raw.suffix, 64),
    start: Number.isFinite(raw.start) ? raw.start : undefined,
    end: Number.isFinite(raw.end) ? raw.end : undefined,
  };
  if (book.format === "pdf") {
    anchor.page = Math.max(1, Math.min(book.pageCount || 1, Math.round(Number(raw.page) || 1)));
    anchor.rects = (raw.rects || [])
      .filter((r) => [r.x, r.y, r.w, r.h].every((v) => Number.isFinite(v)) && r.w > 0 && r.h > 0)
      .slice(0, 400)
      .map((r) => ({ x: clamp01(r.x), y: clamp01(r.y), w: clamp01(r.w), h: clamp01(r.h), ...(r.p !== undefined && r.p !== anchor.page ? { p: Math.round(r.p) } : {}) }));
    if (!anchor.rects.length) delete anchor.rects;
    const onPage = anchor.rects?.filter((r) => r.p === undefined);
    anchor.y = onPage?.length ? Math.min(...onPage.map((r) => r.y)) : Number.isFinite(raw.y) ? clamp01(raw.y!) : locateOnPage(book, anchor.page, anchor);
    // a page that's off by one (an agent counting printed pages, a passage that starts on the page before)
    if (anchor.y === undefined && !anchor.rects)
      for (const page of [anchor.page - 1, anchor.page + 1]) {
        if (page < 1 || page > (book.pageCount || 1)) continue;
        const y = locateOnPage(book, page, anchor);
        if (y !== undefined) {
          anchor.page = page;
          anchor.y = y;
          break;
        }
      }
  } else {
    anchor.block = Math.max(0, Math.round(Number(raw.block) || 0));
    if (Number.isFinite(raw.blockEnd)) anchor.blockEnd = Math.max(anchor.block, Math.round(raw.blockEnd!));
    if (anchor.start === undefined) Object.assign(anchor, locateInBlock(book, anchor) || {});
  }
  anchor.md = locateInText(book, anchor);
  return anchor;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
