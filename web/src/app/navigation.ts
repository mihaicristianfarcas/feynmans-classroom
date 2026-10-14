/* Moving around the app: hash routes, where each kind of document opens, opening what a [[link]] points
 * at, links into a book, and the page that shows a file of the vault. */
import { docs, learn } from "../api";
import type { DocKind, SourceRef } from "../api/types";

/** Navigates to a hash route. */
export const go = (route: string) => {
  location.hash = route.startsWith("#") ? route : `#${route}`;
};

/** Opens what a [[link]] points at; a link to nothing yet creates that note (as Obsidian does). */
export async function openLink(target: string, sub?: string) {
  try {
    const r = await learn.resolve(target, sub);
    if (r.kind === "book") return go(`#/book/${r.id}${r.page ? `?at=${r.page}` : ""}`);
    if (r.kind === "attachment") {
      if (r.path) window.open(`/api/vault/attachment?path=${encodeURIComponent(r.path)}`, "_blank", "noopener");
      return;
    }
    return go(docRoute({ kind: r.kind, id: r.id, source: r.source, bookId: r.bookId }));
  } catch {
    if (!target.trim() || target.includes("/")) return;
    const note = await docs.create({ title: target.trim(), body: "" });
    go(`#/notes/${note.id}`);
  }
}

/** The page a document opens on: a note in Notes, a concept on its page, an annotation or a session in
 * its book (at its passage), a card in Review, a figure in the Figures gallery. */
export function docRoute(d: { kind: DocKind; id: string; source?: Partial<SourceRef>; bookId?: string }): string {
  const bookId = d.source?.bookId || d.bookId;
  if (d.kind === "note") return `#/notes/${d.id}`;
  if (d.kind === "concept") return `#/brain/concept/${d.id}`;
  if ((d.kind === "annotation" || d.kind === "session") && bookId) {
    const link = bookLink({ ...d.source, bookId });
    return `${link}${link.includes("?") ? "&" : "?"}${d.kind === "session" ? "session" : "focus"}=${d.id}`;
  }
  if (d.kind === "card") return "#/review";
  if (d.kind === "figure") return "#/library/figures";
  return "#/library";
}

/** A book location as a reader link. */
export const bookLink = (ref: Partial<SourceRef> & { bookId?: string }) =>
  ref.bookId
    ? `#/book/${ref.bookId}${ref.page !== undefined ? `?at=${(ref.page + (ref.y ?? 0)).toFixed(3)}` : ref.block !== undefined ? `?at=${ref.block}` : ""}`
    : "#/library";

/** The page that shows a vault file (a document of any kind, a book), or null. */
export function vaultLink(path: string): string | null {
  if (
    /^(notes|concepts|cards|figures)\/.+\.md$/.test(path) ||
    /^library\/[^/]+\/(annotations|sessions)\/.+\.md$/.test(path)
  )
    return `#/open?target=${encodeURIComponent(path.replace(/\.md$/, ""))}`;
  const book = /^library\/([^/]+)\//.exec(path);
  if (book) return `#/open?target=${encodeURIComponent(`library/${book[1]}`)}`;
  return null;
}
