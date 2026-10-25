/* Reading sessions: while a book is open the reader pings every so often, and each sitting becomes
 * one entry in the learning journey ("Read 24 min of Calculus Made Easy (Chapter III)"). A sitting
 * ends after six quiet minutes, when the chapter changes, when the vault is closed or when the server
 * stops. */
import { getBook } from "../books/store.ts";
import { logActivity, vaultState } from "../vault/index.ts";

/** What the reader reports while open. */
export interface ReadingPing {
  bookId: string;
  chapter?: string;
  chapterId?: string;
  position?: number;
  page?: number;
}

interface Session {
  start: number;
  last: number;
  minutes: number;
  chapter?: string;
  chapterId?: string;
  position?: number;
  pages: Set<number>;
  timer?: ReturnType<typeof setTimeout>;
}

const QUIET = 6 * 60000;
const sittings = vaultState(() => new Map<string, Session>());

/** Ends a book's sitting and logs it, if it lasted a minute or more. */
function flush(bookId: string) {
  const s = sittings().get(bookId);
  if (!s) return;
  sittings().delete(bookId);
  clearTimeout(s.timer);
  if (s.minutes < 1) return;
  const book = getBook(bookId);
  logActivity({
    type: "read",
    bookId,
    ts: s.last,
    text: `Read ${Math.round(s.minutes)} min of ${book?.title || "a book"}${s.chapter ? ` (${s.chapter})` : ""}`,
    data: {
      minutes: Math.round(s.minutes),
      chapter: s.chapter,
      chapterId: s.chapterId,
      position: s.position,
      pages: s.pages.size,
    },
  });
}
/** Ends every sitting (the vault is being closed, or the server stops). */
export function endReading() {
  for (const bookId of [...sittings().keys()]) flush(bookId);
}
process.on("exit", endReading);

/** Counts a ping toward the current sitting (at most 1.5 minutes per ping); returns its minutes so far. */
export function recordReading(ping: ReadingPing): number {
  const at = Date.now();
  let s = sittings().get(ping.bookId);
  if (s && (ping.chapterId !== s.chapterId || at - s.last > QUIET)) {
    flush(ping.bookId);
    s = undefined;
  }
  if (!s) {
    s = { start: at, last: at, minutes: 0, pages: new Set() };
    sittings().set(ping.bookId, s);
  } else s.minutes += Math.min(1.5, (at - s.last) / 60000);
  Object.assign(s, { last: at, chapter: ping.chapter, chapterId: ping.chapterId, position: ping.position });
  if (ping.page) s.pages.add(ping.page);
  clearTimeout(s.timer);
  s.timer = setTimeout(() => flush(ping.bookId), QUIET);
  return Math.round(s.minutes);
}
