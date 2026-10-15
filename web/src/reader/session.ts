/* The reading session's hooks: the note it writes into, remembering the place and the zoom, and
 * logging reading time while the reader is actually reading. */
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type Book, docs, learn, type Note, type TocEntry } from "../api";
import { savePos } from "./position";

/** A note of an added vault, as the note a reading session writes into. */
export interface VaultTarget {
  vault: string;
  path: string;
  title: string;
}

const VAULT_KEY = /^vault:([^:]+):(.+)$/;
const titleOf = (path: string) => (path.split("/").pop() || path).replace(/\.md$/i, "");

/** The note this session writes into: remembered per book (one of the app's notes, or a vault's),
 * else the book's own note (made on first use). */
export function useWorkingNote(bookId: string) {
  const [note, setNote] = useState<Note | null>(null);
  const [vaultNote, setVaultNote] = useState<VaultTarget | null>(null);
  useEffect(() => {
    setNote(null);
    setVaultNote(null);
    try {
      const id = localStorage.getItem(`classroom-note-${bookId}`);
      const v = id?.match(VAULT_KEY);
      if (v) setVaultNote({ vault: v[1], path: v[2], title: titleOf(v[2]) });
      else if (id)
        docs.get<Note>(id).then(
          (n) => setNote(n),
          () => {},
        );
    } catch {}
  }, [bookId]);
  const remember = useCallback(
    (key: string | null) => {
      try {
        if (key) localStorage.setItem(`classroom-note-${bookId}`, key);
        else localStorage.removeItem(`classroom-note-${bookId}`);
      } catch {}
    },
    [bookId],
  );
  const choose = useCallback(
    (n: Note | null) => {
      setNote(n);
      setVaultNote(null);
      remember(n ? n.id : null);
    },
    [remember],
  );
  const chooseVault = useCallback(
    (v: { vault: string; path: string } | null) => {
      setNote(null);
      setVaultNote(v ? { ...v, title: titleOf(v.path) } : null);
      remember(v ? `vault:${v.vault}:${v.path}` : null);
    },
    [remember],
  );
  /** The working note, making the book's note the working one if none is chosen yet. */
  const ensure = useCallback(async (): Promise<Note | VaultTarget> => {
    if (vaultNote) return vaultNote;
    if (note) return note;
    const n = await learn.bookNote(bookId);
    choose(n);
    return n;
  }, [note, vaultNote, bookId, choose]);
  return { note, vaultNote, choose, chooseVault, ensure };
}

export const isVaultTarget = (n: Note | VaultTarget): n is VaultTarget => "vault" in n && "path" in n && !("id" in n);

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

/* ---------------- zoom ---------------- */

const ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** How big this book was last drawn ("fit": to the pane). */
export function savedZoom(bookId: string): number | "fit" {
  try {
    const saved = localStorage.getItem(`classroom-zoom-${bookId}`);
    return saved && Number.isFinite(Number(saved)) ? Number(saved) : "fit";
  } catch {
    return "fit";
  }
}
export function saveZoom(bookId: string, zoom: number | "fit") {
  try {
    localStorage.setItem(`classroom-zoom-${bookId}`, String(zoom));
  } catch {}
}
/** The next scale up or down from the one shown. */
export function stepZoom(scale: number, direction: 1 | -1): number {
  return direction > 0
    ? (ZOOMS.find((z) => z > scale * 1.02) ?? ZOOMS[ZOOMS.length - 1])
    : ([...ZOOMS].reverse().find((z) => z < scale * 0.98) ?? ZOOMS[0]);
}
