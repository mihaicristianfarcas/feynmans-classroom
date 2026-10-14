/* Where the reader is in a book: the reading line, positions (page + fraction for a PDF, block +
 * fraction otherwise), the chapter at a position, and the saved place per book. */
import { type Anchor, type Book, type Loc, posOf, type SourceRef, type TocEntry } from "../api";

/** The reading line sits this far down the book pane: where you are reading (and the margin's cards for
 * the passage there sit beside it). */
export const LINE = 0.36;

/** Where to open a book: `?at=` in the link, else where it was left (null for the start). */
export function savedPos(bookId: string): number | null {
  const fromHash = new URLSearchParams(location.hash.split("?")[1] || "").get("at");
  if (fromHash && Number.isFinite(Number(fromHash))) return Number(fromHash);
  try {
    const saved = localStorage.getItem(`classroom-pos-${bookId}`);
    return saved ? Number(saved) : null;
  } catch {
    return null;
  }
}

/** Remembers the place in the browser and in the address, so a reload or a shared link comes back to it. */
export function savePos(bookId: string, pos: number) {
  try {
    localStorage.setItem(`classroom-pos-${bookId}`, pos.toFixed(3));
  } catch {}
  history.replaceState(null, "", `#/book/${bookId}?at=${pos.toFixed(3)}`);
}

export const locOfPos = (book: Book, pos: number): Loc =>
  book.format === "pdf"
    ? { page: Math.floor(pos), y: pos - Math.floor(pos) }
    : { block: Math.floor(pos), y: pos - Math.floor(pos) };

export const locOfAnchor = (a: Anchor): Loc =>
  a.page !== undefined ? { page: a.page, y: a.y ?? 0 } : { block: a.block ?? 0 };

/** The chapter a position falls in (the first one before the book's first chapter starts). */
export const chapterAt = (book: Book, pos: number): TocEntry | null =>
  [...book.toc].reverse().find((entry) => posOf(entry.start) <= pos + 1e-6) || book.toc[0] || null;

/** A passage of the book as a vault source reference (for cards, notes and the tutor). */
export function sourceRef(
  book: Book,
  passage: { text: string; anchor: Anchor; at?: number; chapterId?: string },
  pos: number,
  chapterId: string | undefined,
): SourceRef {
  const at = passage.at ?? pos;
  const base = {
    bookId: book.id,
    chapterId: passage.chapterId || chapterId,
    quote: passage.text.split(/\s+/).slice(0, 24).join(" "),
  };
  return book.format === "pdf"
    ? {
        ...base,
        page: passage.anchor.page ?? Math.floor(at),
        y: Math.round((passage.anchor.y ?? at - Math.floor(at)) * 1000) / 1000,
      }
    : { ...base, block: passage.anchor.block ?? Math.floor(at) };
}
