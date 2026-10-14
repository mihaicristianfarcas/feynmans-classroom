/* Finding words in a book, for the reader's find bar: every place a phrase occurs, in reading order,
 * with where it is (page and height, or block), the text around it and its chapter. Matching ignores
 * case, accents, ligatures and line breaks (a word hyphenated across lines is found whole), so it
 * finds what a reader sees, on every page (the reader only renders the pages near the screen). */
import { chapterAt } from "./locate.ts";
import { getBlocks, getBook, getPages } from "./store.ts";
import type { Block, Book, PageText } from "./types.ts";

export interface FindHit {
  page?: number;
  /** Top of the line the match starts on, as a fraction of the page. */
  y?: number;
  block?: number;
  /** The matched text as the book has it, and the text around it (for finding it on the page). */
  quote: string;
  prefix: string;
  suffix: string;
  chapterId?: string;
}

/** Text normalized for matching, with each normalized character's place in the original. */
function fold(text: string): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!space && folded) {
        folded += " ";
        at.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    for (const c of ch.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()) {
      folded += c;
      at.push(i);
    }
  }
  return { folded, at };
}

/** A page's lines as one text (hyphenated words joined), with where each line starts in it. */
function pageText(lines: { t: string; y: number }[]) {
  let text = "";
  const starts: number[] = [];
  for (const [i, line] of lines.entries()) {
    starts.push(text.length);
    const next = lines[i + 1]?.t || "";
    if (/[\p{L}]-$/u.test(line.t) && /^\p{Ll}/u.test(next)) text += line.t.slice(0, -1);
    else text += `${line.t} `;
  }
  return { text, starts };
}

const CONTEXT = 32;

type Hit = Omit<FindHit, "chapterId"> & { pos: number };

/** Every occurrence of `needle` (already folded) in `text`; `where` places one by its start offset. */
function scan(
  text: string,
  needle: string,
  where: (start: number) => { page?: number; y?: number; block?: number; pos: number },
  hits: Hit[],
  limit: number,
) {
  const { folded, at } = fold(text);
  for (let i = folded.indexOf(needle); i >= 0 && hits.length < limit; i = folded.indexOf(needle, i + needle.length)) {
    const start = at[i];
    const end = at[i + needle.length - 1] + 1;
    hits.push({
      ...where(start),
      quote: text.slice(start, end).replace(/\s+/g, " "),
      prefix: text.slice(Math.max(0, start - CONTEXT), start).replace(/\s+/g, " "),
      suffix: text.slice(end, end + CONTEXT).replace(/\s+/g, " "),
    });
  }
}

/** Every occurrence in a PDF's pages (their lines of text). */
export function findInPages(pages: PageText[], query: string, limit = 500): Hit[] {
  const needle = fold(query.trim()).folded;
  const hits: Hit[] = [];
  if (needle.length < 2) return hits;
  for (const page of pages) {
    const { text, starts } = pageText(page.lines);
    const lineAt = (offset: number) => {
      let line = 0;
      while (line + 1 < starts.length && starts[line + 1] <= offset) line++;
      return page.lines[line];
    };
    scan(
      text,
      needle,
      (start) => {
        const y = lineAt(start)?.y ?? 0;
        return { page: page.n, y: Math.max(0, y - 0.02), pos: page.n + y };
      },
      hits,
      limit,
    );
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Every occurrence in a reflowable book's blocks. */
export function findInBlocks(blocks: Block[], query: string, limit = 500): Hit[] {
  const needle = fold(query.trim()).folded;
  const hits: Hit[] = [];
  if (needle.length < 2) return hits;
  for (const block of blocks) {
    scan(block.text, needle, () => ({ block: block.id, pos: block.id }), hits, limit);
    if (hits.length >= limit) break;
  }
  return hits;
}

/** Every occurrence of `query` in the book (at most `limit`), with the chapter each falls in. */
export function findInBook(bookId: string, query: string, limit = 500): FindHit[] {
  const book = getBook(bookId);
  if (!book) return [];
  const hits =
    book.format === "pdf" ? findInPages(getPages(bookId), query, limit) : findInBlocks(getBlocks(bookId), query, limit);
  return hits.map(({ pos, ...hit }) => ({ ...hit, chapterId: chapterOf(book, pos) }));
}

function chapterOf(book: Book, pos: number) {
  const loc = book.format === "pdf" ? { page: Math.floor(pos), y: pos - Math.floor(pos) } : { block: pos };
  return chapterAt(book, loc)?.entry.id;
}
