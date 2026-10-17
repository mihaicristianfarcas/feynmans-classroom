/* Where things in a vault open: the hash routes of the vaults page (a vault, a note or file
 * in it at a heading, a link to open, the graph, a search), and opening a link the way Obsidian does
 * (to what it names, or, when nothing has that name yet, to a new note made for it). */
import { learn, vaults } from "../api";
import { go, openLink } from "../app/navigation";

export interface VaultRoute {
  /** The vault, or null for the page that lists them. */
  id: string | null;
  view: "home" | "note" | "open" | "graph";
  /** The note or file open (for "note"). */
  path?: string;
  /** A heading or "^block" in it to show. */
  sub?: string;
  /** A search (a "#tag" searches tags). */
  q?: string;
  params: URLSearchParams;
}

export function parseVaultRoute(hash: string): VaultRoute {
  const [route, query = ""] = hash.split("?");
  const params = new URLSearchParams(query);
  // #/notes (and the links to the app's own notes from before vaults held every note) open the active vault
  const parts = route.startsWith("#/vaults") ? route.replace(/^#\/vaults\/?/, "").split("/") : [];
  const id = parts[0] || null;
  const q = params.get("q") ?? undefined;
  const sub = params.get("sub") ?? undefined;
  if (parts[1] === "note" && parts[2]) {
    let path = parts.slice(2).join("/");
    try {
      path = decodeURIComponent(path);
    } catch {}
    return { id, view: "note", path, sub, q, params };
  }
  if (parts[1] === "open") return { id, view: "open", params };
  if (parts[1] === "graph") return { id, view: "graph", q, params };
  return { id, view: "home", q, params };
}

const query = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [string, string][],
  ).toString();
  return s ? `?${s}` : "";
};

export const vaultRoute = (id: string) => `#/vaults/${id}`;
export const noteRoute = (id: string, path: string, sub?: string) =>
  `#/vaults/${id}/note/${encodeURIComponent(path)}${query({ sub })}`;
export const searchRoute = (id: string, q: string) => `#/vaults/${id}${query({ q })}`;
export const graphRoute = (id: string) => `#/vaults/${id}/graph`;
/** A link to open (for a new tab, or to copy): resolved when it's opened. */
export const linkRoute = (id: string, target: string, opts: { sub?: string; from?: string; md?: boolean } = {}) =>
  `#/vaults/${id}/open${query({ target, sub: opts.sub, from: opts.from, md: opts.md ? "1" : undefined })}`;

/** Where a relative [text](path) link from `from` points, as a path from the vault's top. */
function besideNote(target: string, from?: string) {
  const parts = (from || "").split("/").slice(0, -1);
  for (const p of target.split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}

/** Opens what a link in note `from` points at; a link to nothing in the vault opens the app's concept, book
 * or note of that name, else makes that note (as Obsidian does). */
export async function openVaultLink(
  id: string,
  target: string,
  opts: { sub?: string; from?: string; md?: boolean; replace?: boolean } = {},
) {
  const open = (route: string) => {
    if (opts.replace) {
      history.replaceState(null, "", route);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } else go(route);
  };
  if (!target.trim()) {
    if (opts.from) open(noteRoute(id, opts.from, opts.sub));
    return;
  }
  try {
    const r = await vaults.resolve(id, target, opts);
    open(noteRoute(id, r.path, opts.sub));
  } catch {
    // a [[link]] to nothing in the vault may name a concept, a book or a note of the app
    if (!opts.md) {
      const app = await learn.resolve(target, opts.sub).catch(() => null);
      if (app && ["concept", "book", "note"].includes(app.kind)) return openLink(target, opts.sub);
    }
    // a Markdown link names a path beside the note; a [[link]] a name, put where new notes go
    const title = (opts.md ? besideNote(target, opts.from) : target.trim()).replace(/\.md$/i, "");
    if (!title || /\.[a-z0-9]{2,4}$/i.test(title)) return;
    const made = await vaults.create(id, { title, from: opts.from });
    open(noteRoute(id, made.path));
  }
}
