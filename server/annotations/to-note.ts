/* Sending a passage from the book to a note: as a link to it, as the quote (a callout that links
 * back to the passage), or as the whole annotation embedded. Every passage a note quotes is marked
 * in the book first, so the note and the book point at each other. */
import type { Anchor, Annotation } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { NotFound } from "../errors.ts";
import { appendToNote, bookNote } from "../learn/notes.ts";
import { annotations, notes } from "../vault/index.ts";
import { createAnnotation } from "./index.ts";

export type NoteMode = "reference" | "passage" | "embed";

/** The Markdown a passage becomes in a note. */
export function noteMarkdown(a: Annotation, mode: NoteMode): string {
  const book = getBook(a.bookId);
  const link = a.path.replace(/\.md$/, "");
  const where = a.anchor.page !== undefined ? `p. ${a.anchor.page}` : `¶${a.anchor.block}`;
  const short = book ? (book.title.length > 40 ? `${book.title.slice(0, 38)}…` : book.title) : "the book";
  if (mode === "reference") {
    const words = a.anchor.quote.split(/\s+/).slice(0, 8).join(" ");
    return `[[${link}|${short}, ${where}: “${words.replace(/[[\]|]/g, "")}…”]]`;
  }
  if (mode === "embed") return `![[${link}]]`;
  return `> [!quote] [[${link}|${short} · ${where}]]\n${a.anchor.quote
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}`;
}

export interface ToNoteRequest {
  /** An existing annotation to send; without one, `anchor` is highlighted first. */
  annotationId?: string;
  anchor?: Anchor;
  /** The note to add to; the book's reading note by default. */
  noteId?: string;
  mode?: NoteMode;
  /** The learner's own words, added after the passage. */
  comment?: string;
}

/** Adds a passage to a note; returns the note, the annotation it links to, and the Markdown added. */
export function sendToNote(bookId: string, request: ToNoteRequest) {
  let a = request.annotationId ? annotations.get(request.annotationId) : undefined;
  if (!a) {
    if (!request.anchor?.quote?.trim()) throw new Error("select some text first");
    a = createAnnotation(bookId, { kind: "highlight", anchor: request.anchor });
  }
  const note = request.noteId ? notes.get(request.noteId) : bookNote(bookId);
  if (!note) throw new NotFound("note not found");
  const markdown = `${noteMarkdown(a, request.mode || "passage")}${request.comment?.trim() ? `\n\n${request.comment.trim()}` : ""}`;
  return { note: appendToNote(note.id, markdown), annotation: a, markdown };
}
