/* Moving around the app: hash routes, opening what a [[link]] points at, and links into a book. */
import { learn } from "../api";
import type { SourceRef } from "../api/types";

/** Navigates to a hash route. */
export const go = (route: string) => {
  location.hash = route.startsWith("#") ? route : `#${route}`;
};

/** Opens what a [[link]] points at; a link to nothing yet creates that note (as Obsidian does). */
export async function openLink(target: string, sub?: string) {
  try {
    const r = await learn.resolve(target, sub);
    if (r.kind === "note") return go(`#/notes/${r.id}`);
    if (r.kind === "concept") return go(`#/brain/concept/${r.id}`);
    if (r.kind === "book") return go(`#/book/${r.id}${r.page ? `?at=${r.page}` : ""}`);
    if (r.kind === "annotation" && r.bookId && r.anchor) {
      const at = r.anchor.page !== undefined ? r.anchor.page + (r.anchor.y ?? 0) : (r.anchor.block ?? 0);
      return go(`#/book/${r.bookId}?at=${at.toFixed(3)}&focus=${r.id}`);
    }
    if (r.kind === "figure") return go("#/library/figures");
    if (r.kind === "attachment" && r.path)
      return window.open(`/api/vault/attachment?path=${encodeURIComponent(r.path)}`, "_blank", "noopener");
  } catch {
    if (!target.trim() || target.includes("/")) return;
    const note = await learn.createNote({ title: target.trim(), body: "" });
    go(`#/notes/${note.id}`);
  }
}

/** A book location as a reader link. */
export const bookLink = (ref: Partial<SourceRef> & { bookId?: string }) =>
  ref.bookId
    ? `#/book/${ref.bookId}${ref.page !== undefined ? `?at=${(ref.page + (ref.y ?? 0)).toFixed(3)}` : ref.block !== undefined ? `?at=${ref.block}` : ""}`
    : "#/library";
