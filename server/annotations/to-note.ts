/* Sending a passage from the book to a note: as a link to it, as the quote (a callout that links
 * back to the passage), or as the whole annotation embedded. Every passage a note quotes is marked
 * in the book first, so the note and the book point at each other. The note is a vault's: the one
 * named, else the book's note in the first vault (vaults/reading.ts). */
import type { Anchor, Annotation } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { docs, whereOf } from "../vault/index.ts";
import { defaultVault, getVault } from "../vaults/index.ts";
import { appendToVaultNote, passageMarkdown, vaultBookNote } from "../vaults/reading.ts";
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
  /** The vault note to add to; the book's reading note in the first vault by default. */
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
  const target =
    request.vault && request.path
      ? { vault: request.vault, path: request.path }
      : vaultBookNote(request.vault || defaultVault(), bookId);
  const markdown = `${passageMarkdown(a, request.mode || "passage")}${comment}`;
  const saved = appendToVaultNote(getVault(target.vault), target.path, markdown);
  return { vaultNote: { vault: target.vault, path: saved.path }, annotation: a, markdown };
}
