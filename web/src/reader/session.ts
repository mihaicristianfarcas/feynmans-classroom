/* The reading session's hooks: the note it writes into, remembering the place, and logging reading
 * time while the reader is actually reading. */
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type Book, learn, type Note, type TocEntry } from "../api";
import { savePos } from "./position";

/** The note this session writes into: remembered per book, else the book's own note (made on first use). */
export function useWorkingNote(bookId: string) {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    try {
      const id = localStorage.getItem(`classroom-note-${bookId}`);
      if (id)
        learn.note(id).then(
          (n) => setNote(n),
          () => {},
        );
    } catch {}
  }, [bookId]);
  const choose = useCallback(
    (n: Note | null) => {
      setNote(n);
      try {
        if (n) localStorage.setItem(`classroom-note-${bookId}`, n.id);
        else localStorage.removeItem(`classroom-note-${bookId}`);
      } catch {}
    },
    [bookId],
  );
  /** The working note, making the book's note the working one if none is chosen yet. */
  const ensure = useCallback(async () => {
    if (note) return note;
    const n = await learn.bookNote(bookId);
    choose(n);
    return n;
  }, [note, bookId, choose]);
  return { note, choose, ensure };
}

/** Saves the place a moment after scrolling stops (once the book is back where it was left). */
export function useSavedPosition(book: Book | null, pos: number, restored: RefObject<boolean>) {
  useEffect(() => {
    if (!book || !restored.current) return;
    const timer = setTimeout(() => savePos(book.id, pos), 400);
    return () => clearTimeout(timer);
  }, [book, pos, restored]);
}

/** Reading time: a ping a minute while the page is visible and the book was scrolled lately. */
export function useReadingTime(
  book: Book | null,
  chapter: TocEntry | null,
  pos: number,
  lastScroll: RefObject<number>,
) {
  const state = useRef({ chapter, pos });
  state.current = { chapter, pos };
  useEffect(() => {
    if (!book) return;
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastScroll.current > 3 * 60000) return;
      const { chapter: ch, pos: p } = state.current;
      learn
        .readPing({
          bookId: book.id,
          chapter: ch?.title,
          chapterId: ch?.id,
          position: p,
          page: book.format === "pdf" ? Math.floor(p) : undefined,
        })
        .catch(() => {});
    };
    const first = setTimeout(ping, 15000);
    const timer = setInterval(ping, 60000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [book, lastScroll]);
}
