/* Sending a passage from the book to a note: as a link to it, as the quote (a callout that links
 * back to the passage), or as the whole annotation embedded. Every passage a note quotes is marked
 * in the book first, so the note and the book point at each other. The note can be one of an added
 * vault's (vaults/reading.ts). */
import type { Anchor, Annotation } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { NotFound } from "../errors.ts";
import { appendToDoc } from "../learn/docs.ts";
import { bookNote } from "../learn/notes.ts";
import { docs, whereOf } from "../vault/index.ts";
import { getVault } from "../vaults/index.ts";
import { appendToVaultNote, passageMarkdown } from "../vaults/reading.ts";
import { createAnnotation } from "./index.ts";

export type NoteMode = "reference" | "passage" | "embed";

/** The Markdown a passage becomes in a note. */
export function noteMarkdown(a: Annotation, mode: NoteMode): string {
  const book = getBook(a.source.bookId);
  const link = a.path.replace(/\.md$/, "");
  const where = a.source.page !== undefined ? whereOf(a.source) : `¶${a.source.block}`;
  const short = book ? (book.title.length > 40 ? `${book.title.slice(0, 38)}…` : book.title) : "the book";
  if (mode === "reference") {
    const words = a.source.quote.split(/\s+/).slice(0, 8).join(" ");
    return `[[${link}|${short}, ${where}: “${words.replace(/[[\]|]/g, "")}…”]]`;
  }
  if (mode === "embed") return `![[${link}]]`;
  return `> [!quote] [[${link}|${short} · ${where}]]\n${a.source.quote
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
  /** Or a note of an added vault. */
  vault?: string;
  path?: string;
  mode?: NoteMode;
  /** The learner's own words, added after the passage. */
  comment?: string;
}

/** Adds a passage to a note; returns the note, the annotation it links to, and the Markdown added. */
export function sendToNote(bookId: string, request: ToNoteRequest) {
  let a = request.annotationId ? docs.get(request.annotationId, "annotation") : undefined;
  if (!a) {
    if (!request.anchor?.quote?.trim()) throw new Error("select some text first");
    a = createAnnotation(bookId, { type: "highlight", anchor: request.anchor });
  }
  const comment = request.comment?.trim() ? `\n\n${request.comment.trim()}` : "";
  if (request.vault && request.path) {
    const markdown = `${passageMarkdown(a, request.mode || "passage")}${comment}`;
    const saved = appendToVaultNote(getVault(request.vault), request.path, markdown);
    return { vaultNote: { vault: request.vault, path: saved.path }, annotation: a, markdown };
  }
  const note = request.noteId ? docs.get(request.noteId) : bookNote(bookId);
  if (!note) throw new NotFound("note not found");
  const markdown = `${noteMarkdown(a, request.mode || "passage")}${comment}`;
  return { note: appendToDoc(note.id, markdown), annotation: a, markdown };
}
