/* The link graph of the vault: what every [[link]] points at, backlinks, unlinked mentions, and
 * renames that carry the links along (as Obsidian does). It works on documents of any kind.
 *
 * A link target resolves, in order, to: a path ("library/x/annotations/p12-…", "notes/Ideas/Plan"),
 * a file name or id (any document), a book (its title, folder, or "library/<folder>/source.pdf#page=12"),
 * an alias, a picture in attachments/, or figure:<id>. */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { linkKey, linksInValue, pageOf, parseWikiLinks, rewriteLinks, type WikiLink } from "../../shared/links.ts";
import type { Doc, DocKind, SourceRef } from "../../shared/vault-types.ts";
import { bookFolder, listBooks } from "../books/store.ts";
import type { Book } from "../books/types.ts";
import { getVault, listVaults } from "../vaults/index.ts";
import { listConnections } from "./connections.ts";
import { changed, docs, onVaultChange, VAULT } from "./index.ts";
import { withBody } from "./kinds.ts";

export type NodeKind = DocKind | "book" | "attachment";
export interface Resolved {
  /** Graph node id: "<kind>:<id>" ("note:n1a2b3c4", "book:b1…"). */
  node: string;
  kind: NodeKind;
  id: string;
  /** Vault-relative file, when it is one. */
  path?: string;
  vault?: string;
  title: string;
  page?: number;
  bookId?: string;
  /** Where in a book it is anchored (annotations, sessions, notes from a passage). */
  source?: SourceRef;
}

export interface Edge {
  from: string;
  fromPath: string;
  /** Null when the link points at nothing (yet). */
  to: string | null;
  toPath?: string;
  target: string;
  kind: "link" | "embed" | "related" | "about" | "ai" | "mentions" | "source" | "concept";
  line: number;
}

/* ---------------- names → things ---------------- */

interface Names {
  byKey: Map<string, Resolved[]>;
  books: Book[];
}
let names: Names | null = null;
let edgesCache: Edge[] | null = null;
let version = 0;
export const linkVersion = () => version;
export function invalidateLinks() {
  names = null;
  edgesCache = null;
  version++;
}
onVaultChange(() => invalidateLinks());

/** A document as a node of the graph. */
export const docNode = (d: Doc): Resolved => ({
  node: `${d.kind}:${d.id}`,
  kind: d.kind,
  id: d.id,
  path: d.path,
  title: d.title,
  bookId: d.source?.bookId,
  page: d.source?.page,
  source: d.source,
});
const bookNode = (b: Book): Resolved => ({
  node: `book:${b.id}`,
  kind: "book",
  id: b.id,
  path: `library/${bookFolder(b.id)}/README.md`,
  title: b.title,
  bookId: b.id,
});

function buildNames(): Names {
  const byKey = new Map<string, Resolved[]>();
  const add = (key: string | undefined, r: Resolved, front = false) => {
    if (!key) return;
    const k = linkKey(key);
    if (!k) return;
    const list = byKey.get(k) || [];
    if (list.some((x) => x.node === r.node)) return;
    if (front) list.unshift(r);
    else list.push(r);
    byKey.set(k, list);
  };
  // the more specific the name, the earlier it is added: paths, then file names and ids, then aliases
  const all = docs.list();
  for (const d of all) add(d.path, docNode(d), true);
  for (const d of all) {
    const r = docNode(d);
    add(basename(d.path), r);
    add(d.id, r);
  }
  const books = listBooks().filter((b) => b.status === "ready");
  for (const b of books) {
    const r = bookNode(b);
    const folder = bookFolder(b.id);
    if (folder) {
      add(`library/${folder}`, r, true);
      add(`library/${folder}/README`, r, true);
      add(`library/${folder}/${b.file}`, r, true);
      add(folder, r);
    }
    add(b.title, r);
    add(b.id, r);
  }
  // aliases last: a document's own name always wins over another's alias
  for (const d of all) for (const alias of d.aliases) add(alias, docNode(d));
  return { byKey, books };
}

export function resolveLink(target: string, sub?: string): Resolved | null {
  const t = target.trim();
  if (!t) return null;
  if (/^figure:/i.test(t)) {
    const f = docs.get(t.slice(7).trim(), "figure");
    return f ? docNode(f) : null;
  }
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(t)) {
    const path = t.includes("/") ? t : `attachments/${t}`;
    return existsSync(join(VAULT, path))
      ? { node: `attachment:${path}`, kind: "attachment", id: path, path, title: basename(path) }
      : null;
  }
  names ||= buildNames();
  let found = names.byKey.get(linkKey(t))?.[0];
  // a file inside a book's folder (its text by chapter, its PDF): the book, at that chapter's first page
  if (!found) {
    const m = /^library\/([^/]+)\/(.+)$/.exec(t.replace(/\\/g, "/").replace(/^\.\//, ""));
    const book = m ? names.books.find((b) => bookFolder(b.id) === m[1]) : undefined;
    if (book) {
      const chapter = /^text\/(\d+)-/.exec(m![2]);
      const entry = chapter ? book.toc[Number(chapter[1]) - 1] : undefined;
      found = { ...bookNode(book), page: entry?.start.page };
    }
  }
  if (!found) {
    // Migrated notes keep old paths and IDs as aliases in their frontmatter.
    for (const info of listVaults()) {
      const vault = getVault(info.id);
      const path = vault.resolve(t);
      const entry = path ? vault.files.get(path) : undefined;
      if (entry?.kind !== "note") continue;
      found = {
        node: `vnote:${vault.id}:${entry.path}`,
        kind: "note",
        id: String(entry.data?.id || entry.path),
        path: entry.path,
        vault: vault.id,
        title: entry.name,
      };
      break;
    }
  }
  if (!found) return null;
  const page = pageOf(sub);
  return page !== undefined ? { ...found, page } : found;
}

/** Everything a [[ can complete to, for the editor: notes, concepts, kept figures and books. */
export function linkTargets(): { title: string; kind: NodeKind; path?: string; detail?: string }[] {
  const out: { title: string; kind: NodeKind; path?: string; detail?: string }[] = [];
  for (const d of docs.list()) {
    if (d.kind === "note")
      out.push({
        title: d.title,
        kind: "note",
        path: d.path,
        detail: d.path.split("/").slice(1, -1).join("/") || undefined,
      });
    else if (d.kind === "concept")
      out.push({ title: d.title, kind: "concept", path: d.path, detail: d.summary.slice(0, 80) });
    else if (d.kind === "figure")
      out.push({ title: d.path.replace(/\.md$/, ""), kind: "figure", path: d.path, detail: d.title });
  }
  for (const b of listBooks().filter((x) => x.status === "ready"))
    out.push({ title: b.title, kind: "book", path: `library/${bookFolder(b.id)}`, detail: b.author });
  return out;
}

/* ---------------- the edges ---------------- */

/** How many lines of its file come before a document's body (the frontmatter, a quote callout). */
function bodyOffset(d: Doc): number {
  try {
    const text = readFileSync(join(VAULT, d.path), "utf8");
    const head = d.body.trimStart().slice(0, 60);
    const at = head ? text.indexOf(head) : -1;
    return at > 0 ? text.slice(0, at).split("\n").length - 1 : 0;
  } catch {
    return 0;
  }
}

function linkEdges(from: string, fromPath: string, text: string, offset = 0): Edge[] {
  return parseWikiLinks(text).map((l: WikiLink): Edge => {
    const r = resolveLink(l.target, l.sub);
    return {
      from,
      fromPath,
      to: r?.node ?? null,
      toPath: r?.path,
      target: l.target,
      kind: l.embed ? "embed" : "link",
      line: l.line + offset,
    };
  });
}

/** The concept a document's `concepts` entry names (its id, or its name). */
function conceptOf(ref: string): Doc | undefined {
  const byId = docs.get(ref, "concept");
  if (byId) return byId;
  const r = resolveLink(ref);
  return r?.kind === "concept" ? docs.get(r.id) : undefined;
}

/** Every link in the vault: written in bodies, kept in frontmatter (related, about), to the concepts a
 * document is about, and to the books it comes from. */
export function allEdges(): Edge[] {
  if (edgesCache) return edgesCache;
  const edges: Edge[] = [];
  const accepted = new Set(
    listConnections()
      .filter((c) => c.status === "accepted")
      .map((c) => `${c.from}\u0000${linkKey(c.to)}`),
  );
  for (const d of docs.list()) {
    const from = `${d.kind}:${d.id}`;
    const fromPath = d.path;
    edges.push(...linkEdges(from, fromPath, d.body, d.body.includes("[[") ? bodyOffset(d) : 0));
    for (const target of linksInValue(d.related)) {
      const r = resolveLink(target);
      const kind: Edge["kind"] = accepted.has(`${fromPath}\u0000${linkKey(target)}`)
        ? "ai"
        : d.kind === "concept" && r?.kind === "concept"
          ? "concept"
          : "related";
      edges.push({ from, fromPath, to: r?.node ?? null, toPath: r?.path, target, kind, line: 1 });
    }
    for (const target of linksInValue(d.about)) {
      const r = resolveLink(target);
      edges.push({ from, fromPath, to: r?.node ?? null, toPath: r?.path, target, kind: "about", line: 1 });
    }
    for (const ref of d.concepts) {
      const concept = conceptOf(ref);
      if (concept && concept.id !== d.id)
        edges.push({
          from,
          fromPath,
          to: `concept:${concept.id}`,
          toPath: concept.path,
          target: ref,
          kind: "mentions",
          line: 1,
        });
    }
    const books = new Set([d.source?.bookId, ...(d.kind === "concept" ? d.sources.map((s) => s.bookId) : [])]);
    for (const book of books)
      if (book && !edges.some((e) => e.from === from && e.to === `book:${book}`))
        edges.push({ from, fromPath, to: `book:${book}`, target: book, kind: "source", line: 1 });
  }
  const seen = new Set<string>();
  edgesCache = edges.filter((e) => {
    const key = `${e.from}|${e.to ?? `?${e.target}`}|${e.kind}|${e.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return edgesCache;
}

/** Links into a node, each with the line it sits on (for the backlinks panel). */
export function backlinks(
  node: string,
): { from: string; path: string; title: string; kind: Edge["kind"]; line: number; context: string }[] {
  const out: { from: string; path: string; title: string; kind: Edge["kind"]; line: number; context: string }[] = [];
  const files = new Map<string, string[]>();
  for (const e of allEdges()) {
    if (e.to !== node || e.from === node || !e.fromPath) continue;
    if (!files.has(e.fromPath)) {
      try {
        files.set(e.fromPath, readFileSync(join(VAULT, e.fromPath), "utf8").split("\n"));
      } catch {
        files.set(e.fromPath, []);
      }
    }
    const lines = files.get(e.fromPath)!;
    // a link kept in the frontmatter has no line of text around it worth showing
    const inProperties = ["about", "related", "ai", "mentions", "source", "concept"].includes(e.kind);
    out.push({
      from: e.from,
      path: e.fromPath,
      title: titleOf(e.from, e.fromPath),
      kind: e.kind,
      line: e.line,
      context: e.kind === "about" ? "About this" : inProperties ? "" : (lines[e.line - 1] || "").trim().slice(0, 240),
    });
  }
  return out;
}

/** What a node is called: a document's title, a book's. */
export function titleOf(node: string, path?: string): string {
  const [kind, id] = [node.slice(0, node.indexOf(":")), node.slice(node.indexOf(":") + 1)];
  if (kind === "book") return listBooks().find((b) => b.id === id)?.title || id;
  return docs.get(id)?.title || basename(path || id, ".md");
}

/** Notes that name this document (by its title or aliases) in plain text without linking it. */
export function unlinkedMentions(doc: Doc): { path: string; title: string; context: string }[] {
  const names_ = [doc.title, ...doc.aliases].filter((n) => n.length >= 3);
  if (!names_.length) return [];
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}\\[|])(${names_.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\p{L}\\p{N}\\]|])`,
    "iu",
  );
  const node = `${doc.kind}:${doc.id}`;
  const linked = new Set(
    allEdges()
      .filter((e) => e.to === node)
      .map((e) => e.fromPath),
  );
  const out: { path: string; title: string; context: string }[] = [];
  for (const other of docs.list("note")) {
    if (other.id === doc.id || linked.has(other.path)) continue;
    const line = other.body.split("\n").find((l) => pattern.test(l) && !l.includes(`[[${doc.title}`));
    if (line) out.push({ path: other.path, title: other.title, context: line.trim().slice(0, 240) });
  }
  return out.slice(0, 50);
}

/* ---------------- renames ---------------- */

/**
 * After a document is renamed, links to its old name follow it, in every document (their bodies and
 * the links in their frontmatter). `oldKeys` are the names the old links could use (its old file name
 * and path); `next` is the new name (or path, for links that were written as paths). Returns how many
 * files changed.
 */
export function carryLinks(oldKeys: string[], next: { name: string; path: string }): number {
  const keys = new Set(oldKeys.map(linkKey));
  const rename = (target: string) =>
    keys.has(linkKey(target)) ? (target.includes("/") ? next.path.replace(/\.md$/, "") : next.name) : null;
  let count = 0;
  for (const d of docs.list()) {
    const body = rewriteLinks(d.body, rename);
    const related = d.related.map((r) => rewriteLinks(r, rename));
    const about = d.about.map((r) => rewriteLinks(r, rename));
    if (body !== d.body || related.some((r, i) => r !== d.related[i]) || about.some((r, i) => r !== d.about[i])) {
      docs.save(Object.assign(d, body !== d.body ? withBody(d, body) : {}, { related, about }));
      count++;
    }
  }
  if (count) changed(`links ${next.name}`);
  invalidateLinks();
  return count;
}
