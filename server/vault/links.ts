/* The link graph of the vault: what every [[link]] points at, backlinks, unlinked mentions, and
 * renames that carry the links along (as Obsidian does).
 *
 * A link target resolves, in order, to: a path ("library/x/annotations/p12-…", "notes/Ideas/Plan"),
 * a file name anywhere (notes, concepts, annotations), a note or concept alias, a concept id or name,
 * a book (its title, folder, or "library/<folder>/source.pdf#page=12"), or figure:<id>. */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { linksInValue, linkKey, pageOf, parseWikiLinks, rewriteLinks, type WikiLink } from "../../shared/links.ts";
import type { Annotation, Concept, Note } from "../../shared/vault-types.ts";
import { bookFolder, listBooks } from "../store.ts";
import type { Book } from "../types.ts";
import { listConnections } from "./connections.ts";
import { annotations, changed, concepts, figures, notes, onVaultChange, VAULT } from "./index.ts";

export type NodeKind = "note" | "concept" | "book" | "annotation" | "figure" | "attachment";
export interface Resolved {
  /** Graph node id: "note:<id>", "concept:<id>", "book:<id>", "annotation:<id>", "figure:<id>". */
  node: string;
  kind: NodeKind;
  id: string;
  /** Vault-relative file, when it is one. */
  path?: string;
  title: string;
  page?: number;
  bookId?: string;
}

export interface Edge {
  from: string;
  fromPath: string;
  /** Null when the link points at nothing (yet). */
  to: string | null;
  toPath?: string;
  target: string;
  kind: "link" | "embed" | "related" | "ai" | "mentions" | "source" | "concept";
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

const noteNode = (n: Note): Resolved => ({ node: `note:${n.id}`, kind: "note", id: n.id, path: n.path, title: n.title });
const conceptNode = (c: Concept & { path?: string }): Resolved => ({ node: `concept:${c.id}`, kind: "concept", id: c.id, path: c.path || concepts.fileOf(c.id) || undefined, title: c.name });
const bookNode = (b: Book): Resolved => ({ node: `book:${b.id}`, kind: "book", id: b.id, path: `library/${bookFolder(b.id)}/README.md`, title: b.title, bookId: b.id });
const annotationNode = (a: Annotation): Resolved => ({ node: `annotation:${a.id}`, kind: "annotation", id: a.id, path: a.path, title: a.title || `${a.kind}: ${a.anchor.quote.split(/\s+/).slice(0, 8).join(" ")}…`, bookId: a.bookId, page: a.anchor.page });

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
  // the more specific the name, the earlier it is added: paths, then file names, then aliases
  for (const n of notes.list()) {
    const r = noteNode(n);
    add(n.path, r, true);
    add(basename(n.path), r);
    add(n.id, r);
  }
  for (const c of concepts.list()) {
    const r = conceptNode(c);
    if (r.path) add(r.path, r, true);
    add(c.name, r);
    add(c.id, r);
  }
  for (const a of annotations.list()) {
    const r = annotationNode(a);
    add(a.path, r, true);
    add(basename(a.path), r);
    add(a.id, r);
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
  // aliases last: a note's own name always wins over another's alias
  for (const n of notes.list()) for (const alias of n.aliases) add(alias, noteNode(n));
  for (const c of concepts.list()) for (const alias of c.aliases) add(alias, conceptNode(c));
  return { byKey, books };
}

export function resolveLink(target: string, sub?: string): Resolved | null {
  const t = target.trim();
  if (!t) return null;
  if (/^figure:/i.test(t)) {
    const id = t.slice(7).trim();
    const f = figures.get(id);
    return f ? { node: `figure:${id}`, kind: "figure", id, path: figures.fileOf(id) || undefined, title: f.title } : null;
  }
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(t)) {
    const path = t.includes("/") ? t : `attachments/${t}`;
    return existsSync(join(VAULT, path)) ? { node: `attachment:${path}`, kind: "attachment", id: path, path, title: basename(path) } : null;
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
  if (!found) return null;
  const page = pageOf(sub);
  return page !== undefined ? { ...found, page } : found;
}

/** Everything a [[ can complete to, for the editor. */
export function linkTargets(): { title: string; kind: NodeKind; path?: string; detail?: string }[] {
  const out: { title: string; kind: NodeKind; path?: string; detail?: string }[] = [];
  for (const n of notes.list()) out.push({ title: n.title, kind: "note", path: n.path, detail: n.path.split("/").slice(1, -1).join("/") || undefined });
  for (const c of concepts.list()) out.push({ title: c.name, kind: "concept", path: concepts.fileOf(c.id) || undefined, detail: c.summary.slice(0, 80) });
  for (const b of listBooks().filter((x) => x.status === "ready")) out.push({ title: b.title, kind: "book", path: `library/${bookFolder(b.id)}`, detail: b.author });
  return out;
}

/* ---------------- the edges ---------------- */

function linkEdges(from: string, fromPath: string, text: string, kindOf: (l: WikiLink) => Edge["kind"] = (l) => (l.embed ? "embed" : "link")): Edge[] {
  return parseWikiLinks(text).map((l) => {
    const r = resolveLink(l.target, l.sub);
    return { from, fromPath, to: r?.node ?? null, toPath: r?.path, target: l.target, kind: kindOf(l), line: l.line };
  });
}

export function allEdges(): Edge[] {
  if (edgesCache) return edgesCache;
  const edges: Edge[] = [];
  const accepted = new Set(listConnections().filter((c) => c.status === "accepted").map((c) => `${c.from}\u0000${linkKey(c.to)}`));
  for (const n of notes.list()) {
    const from = `note:${n.id}`;
    // the body starts after the frontmatter: count its lines so line numbers point into the file
    const offset = frontmatterLines(n.path);
    for (const e of linkEdges(from, n.path, n.body)) edges.push({ ...e, line: e.line + offset });
    for (const target of linksInValue(n.related)) {
      const r = resolveLink(target);
      edges.push({ from, fromPath: n.path, to: r?.node ?? null, toPath: r?.path, target, kind: accepted.has(`${n.path}\u0000${linkKey(target)}`) ? "ai" : "related", line: 1 });
    }
    for (const c of n.concepts) {
      const concept = concepts.get(c);
      if (concept) edges.push({ from, fromPath: n.path, to: `concept:${concept.id}`, toPath: concepts.fileOf(concept.id) || undefined, target: c, kind: "mentions", line: 1 });
    }
    if (n.source?.bookId && !edges.some((e) => e.from === from && e.to === `book:${n.source!.bookId}`)) edges.push({ from, fromPath: n.path, to: `book:${n.source.bookId}`, target: n.source.bookId, kind: "source", line: 1 });
  }
  for (const c of concepts.list()) {
    const from = `concept:${c.id}`;
    const path = concepts.fileOf(c.id) || "";
    edges.push(...linkEdges(from, path, c.body));
    for (const id of c.related) {
      const r = concepts.get(id) ? conceptNode(concepts.get(id)!) : resolveLink(id);
      if (r && r.node !== from) edges.push({ from, fromPath: path, to: r.node, toPath: r.path, target: id, kind: "concept", line: 1 });
    }
    for (const book of new Set(c.sources.map((s) => s.bookId))) edges.push({ from, fromPath: path, to: `book:${book}`, target: book, kind: "source", line: 1 });
  }
  for (const a of annotations.list()) {
    const from = `annotation:${a.id}`;
    edges.push(...linkEdges(from, a.path, a.body));
    if (a.bookId) edges.push({ from, fromPath: a.path, to: `book:${a.bookId}`, target: a.bookId, kind: "source", line: 1 });
  }
  const seen = new Set<string>();
  return (edgesCache = edges.filter((e) => {
    const key = `${e.from}|${e.to ?? `?${e.target}`}|${e.kind}|${e.line}`;
    return seen.has(key) ? false : (seen.add(key), true);
  }));
}

/** Lines taken by a file's frontmatter (and the blank lines after it), so body lines map to file lines. */
function frontmatterLines(rel: string): number {
  try {
    const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n(\s*\n)?/.exec(readFileSync(join(VAULT, rel), "utf8"));
    return m ? m[0].split("\n").length - 1 : 0;
  } catch {
    return 0;
  }
}

/** Links into a node, each with the line it sits on (for the backlinks panel). */
export function backlinks(node: string): { from: string; path: string; title: string; kind: Edge["kind"]; line: number; context: string }[] {
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
    out.push({ from: e.from, path: e.fromPath, title: titleOf(e.from, e.fromPath), kind: e.kind, line: e.line, context: (lines[e.line - 1] || "").trim().slice(0, 240) });
  }
  return out;
}

export function titleOf(node: string, path?: string): string {
  const [kind, id] = [node.slice(0, node.indexOf(":")), node.slice(node.indexOf(":") + 1)];
  if (kind === "note") return notes.get(id)?.title || basename(path || id, ".md");
  if (kind === "concept") return concepts.get(id)?.name || id;
  if (kind === "annotation") {
    const a = annotations.get(id);
    return a ? annotationNode(a).title : id;
  }
  if (kind === "book") return listBooks().find((b) => b.id === id)?.title || id;
  return id;
}

/** Notes that name this note (or its aliases) in plain text without linking it. */
export function unlinkedMentions(note: Note): { path: string; title: string; context: string }[] {
  const names_ = [note.title, ...note.aliases].filter((n) => n.length >= 3);
  if (!names_.length) return [];
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}\\[|])(${names_.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\p{L}\\p{N}\\]|])`, "iu");
  const linked = new Set(allEdges().filter((e) => e.to === `note:${note.id}`).map((e) => e.fromPath));
  const out: { path: string; title: string; context: string }[] = [];
  for (const other of notes.list()) {
    if (other.id === note.id || linked.has(other.path)) continue;
    const line = other.body.split("\n").find((l) => pattern.test(l) && !l.includes(`[[${note.title}`));
    if (line) out.push({ path: other.path, title: other.title, context: line.trim().slice(0, 240) });
  }
  return out.slice(0, 50);
}

/* ---------------- renames ---------------- */

/**
 * After a note or concept is renamed, links to its old name follow it. `oldKeys` are the names the
 * old links could use (its old file name and path); `next` is the new name (or path, for links that
 * were written as paths). Returns how many files changed.
 */
export function carryLinks(oldKeys: string[], next: { name: string; path: string }): number {
  const keys = new Set(oldKeys.map(linkKey));
  const rename = (target: string) => (keys.has(linkKey(target)) ? (target.includes("/") ? next.path.replace(/\.md$/, "") : next.name) : null);
  let count = 0;
  for (const n of notes.list()) {
    const body = rewriteLinks(n.body, rename);
    const related = n.related.map((r) => rewriteLinks(r, rename));
    if (body !== n.body || related.some((r, i) => r !== n.related[i])) {
      notes.save({ ...n, body, related });
      count++;
    }
  }
  for (const c of concepts.list()) {
    const body = rewriteLinks(c.body, rename);
    if (body !== c.body) {
      concepts.save({ ...c, body });
      count++;
    }
  }
  for (const a of annotations.list()) {
    const body = rewriteLinks(a.body, rename);
    if (body !== a.body) {
      annotations.save({ ...a, body });
      count++;
    }
  }
  if (count) changed(`links ${next.name}`);
  invalidateLinks();
  return count;
}
