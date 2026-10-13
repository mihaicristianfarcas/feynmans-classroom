/* A passage selected in the book: its text, where it is anchored, and where its menu goes. */
import type { Anchor, Book } from "../api";
import { blockAnchor, pdfAnchor } from "./anchoring";
import type { ReaderHandle } from "./readers";

export interface Selection {
  text: string;
  /** Centre of the selection, and the menu's top, in the book pane. */
  x: number;
  y: number;
  side: "top" | "bottom";
  anchor: Anchor;
  chapterId?: string;
  /** Reading position where the selection starts (page + fraction, or block). */
  at?: number;
  /** Made from the keyboard: the menu takes focus. */
  byKeyboard?: boolean;
}

/** Reads what is selected in the book pane: a Selection, false if nothing is selected there, null if
 * the selection can't be anchored to the book. */
export function readSelection(
  book: Book,
  pane: HTMLElement,
  reader: ReaderHandle | null,
  chapterIdAt: (pos: number) => string | undefined,
  byKeyboard: boolean,
): Selection | false | null {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
  if (!sel || sel.rangeCount === 0 || text.length < 2 || !pane.contains(sel.anchorNode)) return false;
  const anchor = book.format === "pdf" ? pdfAnchor(sel, pane) : blockAnchor(sel);
  if (!anchor) return null;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  const box = pane.getBoundingClientRect();
  // above the selection when there's room (as in most readers), else below; always inside the pane
  const above = rect.top - box.top > 70;
  const y = above ? rect.top - box.top - 48 : Math.min(box.height - 60, rect.bottom - box.top + 10);
  const at = reader?.positionAt(Math.max(box.top + 1, rect.top + 2));
  return {
    text,
    anchor,
    x: rect.left - box.left + rect.width / 2,
    y: Math.max(8, y),
    side: above ? "top" : "bottom",
    chapterId: at != null ? chapterIdAt(at) : undefined,
    at: at ?? undefined,
    byKeyboard,
  };
}
