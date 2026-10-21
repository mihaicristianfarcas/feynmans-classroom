/* Moving around the app: hash routes, where each kind of document opens, opening what a [[link]] points
 * at, links into a book, and the page that shows a file of the vault. */
import { learn, vaults } from "../api";
import type { DocKind, SourceRef } from "../api/types";
import { activeVault } from "../vaults/active";

/** Navigates to a hash route. */
export const go = (route: string) => {
  location.hash = route.startsWith("#") ? route : `#${route}`;
};

/** Opens what a [[link]] points at; a link to nothing yet creates that note in the active vault (as
 * Obsidian does). */
export async function openLink(target: string, sub?: string) {
  try {
    const r = await learn.resolve(target, sub);
    if (r.vault && r.path)
      return go(
        `#/vaults/${r.vault}/note/${encodeURIComponent(r.path)}${sub ? `?sub=${encodeURIComponent(sub)}` : ""}`,
      );
    if (r.kind === "book") return go(`#/book/${r.id}${r.page ? `?at=${r.page}` : ""}`);
    if (r.kind === "attachment") {
      if (r.path) window.open(`/api/vault/attachment?path=${encodeURIComponent(r.path)}`, "_blank", "noopener");
      return;
    }
    return go(docRoute({ kind: r.kind, id: r.id, source: r.source, bookId: r.bookId }));
  } catch {
    if (!target.trim() || target.includes("/")) return;
    const vault = await activeVault();
    const made = await vaults.create(vault, { title: target.trim().replace(/[\\/:]/g, "-") });
    go(`#/vaults/${vault}/note/${encodeURIComponent(made.path)}`);
  }
}

/** The page a document opens on: a note in the vaults, a concept on its page, an annotation or a session in
 * its book (at its passage), a card in Review, a figure in the Figures gallery. */
export function docRoute(d: { kind: DocKind; id: string; source?: Partial<SourceRef>; bookId?: string }): string {
  const bookId = d.source?.bookId || d.bookId;
  if (d.kind === "note") return "#/vaults";
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
