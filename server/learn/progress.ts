/* Progress through a book, and an honest pace: how far through it the learner's place is, and when
 * they'd reach the end at the pace of the last two weeks, said roughly ("about 5 weeks") and never as a
 * promise. Mathua's lesson: pace from recent real work, not from a plan. It comes from the reading
 * sittings in the activity log (reading.ts), each ending at a position in the book; with too little
 * recent reading to go on, there is no estimate. */

import { getBook } from "../books/store.ts";
import type { Book } from "../books/types.ts";
import { activity } from "../vault/index.ts";

const DAY = 86400000;
/** The pace is the progress made in this window, spread over all of it. */
const WINDOW = 14;
/** The reading line rarely reaches the very last line: from here on, the book is read. */
export const READ = 0.97;

export interface BookProgress {
  /** 0–1: how far through the book the learner's place is. */
  fraction: number;
  /** At the last two weeks' pace: "about 5 weeks". */
  finishIn?: string;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** How far a reading position is through the book, 0–1; null when the book doesn't say how long it is.
 * A PDF's position is its page (from 1) plus a fraction, another book's its block (from 0) plus one. */
export function fractionOf(book: Book, position: number): number | null {
  if (book.format === "pdf") return book.pageCount ? clamp((position - 1) / book.pageCount) : null;
  return book.blockCount ? clamp(position / book.blockCount) : null;
}

/** A number of days, roughly: "a few days", "about a week", "about 5 weeks", "about 3 months". */
export function roughly(days: number): string {
  if (days < 4) return "a few days";
  if (days < 11) return "about a week";
  if (days < 45) return `about ${Math.round(days / 7)} weeks`;
  if (days < 335) return `about ${Math.round(days / 30)} months`;
  return "more than a year";
}

/** A day starts at 4 am, as in the journey. */
const dayOf = (ts: number) => new Date(ts - 4 * 3600000).toDateString();

/** Where the learner is in a book, and when they'd finish it at their recent pace (null: never read). */
export function bookProgress(bookId: string, now = Date.now()): BookProgress | null {
  const book = getBook(bookId);
  if (!book) return null;
  const sittings = activity()
    .filter((a) => a.type === "read" && a.bookId === bookId && typeof a.data?.position === "number")
    .map((a) => ({ ts: a.ts, at: fractionOf(book, a.data!.position as number) }))
    .filter((s): s is { ts: number; at: number } => s.at !== null)
    .sort((a, b) => a.ts - b.ts);
  const last = sittings.at(-1);
  if (!last) return null;
  if (last.at >= READ) return { fraction: 1 };
  const since = now - WINDOW * DAY;
  const recent = sittings.filter((s) => s.ts > since);
  if (new Set(recent.map((s) => dayOf(s.ts))).size < 2) return { fraction: last.at };
  // from where the place was when the window opened (or, for a book begun since, where the first sitting
  // ended, which leaves that sitting out: slower, never flattering)
  const from = sittings.filter((s) => s.ts <= since).at(-1)?.at ?? recent[0].at;
  const gained = last.at - from;
  if (gained < 0.005) return { fraction: last.at }; // no headway to speak of: no estimate
  return { fraction: last.at, finishIn: roughly((1 - last.at) / (gained / WINDOW)) };
}
