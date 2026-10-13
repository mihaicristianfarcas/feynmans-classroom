/* Finding where a quoted passage sits in a book: the page and line height in a PDF, or the block in
 * a reflowable book. Quotes from models are often slightly off (hyphenation, Markdown marks,
 * paraphrased edges), so the match is on letters and digits only, with a fuzzy fallback. Also the
 * reading-order helpers every feature uses: a place's position, and the chapter it falls in.
 * (Annotations anchor to exact selections with shared/textmatch.ts; this is the coarser search for
 * quotes a model picked.) */
import type { Block, Book, Loc, PageText, TocEntry } from "./types.ts";

/** A place's position in reading order: page plus height for PDFs, block index (plus fraction) otherwise. */
export const positionOf = (loc: Loc) => (loc.page !== undefined ? loc.page + (loc.y ?? 0) : (loc.block ?? 0));

/** The chapter a place falls in: the last one that starts at or before it (null before the first). */
export function chapterAt(book: Book, loc: Loc): { entry: TocEntry; index: number } | null {
  const at = positionOf(loc);
  for (let i = book.toc.length - 1; i >= 0; i--)
    if (positionOf(book.toc[i].start) <= at + 1e-6) return { entry: book.toc[i], index: i };
  return null;
}

/** Lowercase letters and digits only, so quotes survive hyphenation, Markdown marks and odd spacing. */
export const squash = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

interface Hit {
  loc: Loc;
  score: number;
}

/** Finds where a quote sits in a PDF: the page and the top of the line it starts on. */
export function locateInPages(
  pages: PageText[],
  quote: string,
  range?: { from: number; to: number; fromY?: number; toY?: number },
  hintPage?: number,
): Hit | null {
  const needle = squash(quote);
  if (needle.length < 6) return null;
  const from = Math.max(1, range?.from ?? 1);
  const to = Math.min(pages.length, range?.to ?? pages.length);
  // one continuous squashed string over the range, remembering where each line starts
  let hay = "";
  const marks: { at: number; page: number; y: number }[] = [];
  for (let n = from; n <= to; n++) {
    for (const line of pages[n - 1].lines) {
      if (n === from && range?.fromY !== undefined && line.y < range.fromY - 0.02) continue;
      if (n === to && range?.toY !== undefined && line.y >= range.toY - 0.005) continue;
      marks.push({ at: hay.length, page: n, y: line.y });
      hay += squash(line.t);
    }
  }
  const locOf = (index: number): { page: number; y: number } => {
    let lo = 0,
      hi = marks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (marks[mid].at <= index) lo = mid;
      else hi = mid - 1;
    }
    const mark = marks[lo];
    return mark ? { page: mark.page, y: mark.y } : { page: from, y: 0 };
  };
  const exact = bestIndexOf(hay, needle, (i) => locOf(i).page, hintPage);
  if (exact >= 0) return { loc: locOf(exact), score: 1 };
  const fuzzy = fuzzyFind(hay, needle);
  if (fuzzy) return { loc: locOf(fuzzy.index), score: fuzzy.score };
  return null;
}

/** Same for reflowable books: the block a quote starts in. */
export function locateInBlocks(blocks: Block[], quote: string, range?: { from: number; to: number }): Hit | null {
  const needle = squash(quote);
  if (needle.length < 6) return null;
  const from = Math.max(0, range?.from ?? 0);
  const to = Math.min(blocks.length, range?.to ?? blocks.length);
  let hay = "";
  const marks: { at: number; block: number }[] = [];
  for (let i = from; i < to; i++) {
    marks.push({ at: hay.length, block: i });
    hay += squash(blocks[i].text);
  }
  const blockOf = (index: number) => {
    let found = marks[0]?.block ?? from;
    for (const mark of marks) {
      if (mark.at > index) break;
      found = mark.block;
    }
    return found;
  };
  const exact = hay.indexOf(needle);
  if (exact >= 0) return { loc: { block: blockOf(exact) }, score: 1 };
  const fuzzy = fuzzyFind(hay, needle);
  if (fuzzy) return { loc: { block: blockOf(fuzzy.index) }, score: fuzzy.score };
  return null;
}

function bestIndexOf(hay: string, needle: string, pageOf: (i: number) => number, hint?: number) {
  let best = -1,
    bestDistance = Infinity;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) {
    const distance = hint ? Math.abs(pageOf(i) - hint) : 0;
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
    if (!hint) break;
  }
  return best;
}

/**
 * Quotes from a model are sometimes paraphrased at the edges. Slide over the text with 12-character
 * shingles of the quote and pick the region where most of them land in order.
 */
function fuzzyFind(hay: string, needle: string): { index: number; score: number } | null {
  const size = 12;
  if (needle.length < size + 2) return null;
  const votes = new Map<number, number>();
  let shingles = 0;
  for (let i = 0; i + size <= needle.length; i += 4) {
    shingles++;
    const piece = needle.slice(i, i + size);
    for (let j = hay.indexOf(piece); j >= 0; j = hay.indexOf(piece, j + 1)) {
      const start = j - i;
      const bucket = Math.round(start / 40);
      votes.set(bucket, (votes.get(bucket) || 0) + 1);
    }
  }
  let bestBucket = -1,
    bestVotes = 0;
  for (const [bucket, count] of votes) if (count > bestVotes) [bestBucket, bestVotes] = [bucket, count];
  const score = shingles ? bestVotes / shingles : 0;
  if (score < 0.34) return null;
  return { index: Math.max(0, bestBucket * 40), score };
}

/** Where a chapter starts and ends, as page or block ranges. */
export function chapterRange(entry: TocEntry) {
  if (entry.start.page !== undefined)
    return {
      from: entry.start.page,
      to: Math.max(entry.start.page, entry.end.page ?? entry.start.page),
      fromY: entry.start.y,
      toY: entry.end.y,
    };
  return { from: entry.start.block ?? 0, to: entry.end.block ?? (entry.start.block ?? 0) + 1 };
}
