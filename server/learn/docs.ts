/* Documents as the app edits them, whatever their kind: making one, changing it (a new title renames its
 * file when the title is its file name, and the links to it follow), adding to it, deleting it, its page
 * (with the links in and out), its saved versions, and lists by kind, book, concept, folder or tag.
 * What a kind does beyond this (an annotation's answer, a card's schedule, a concept's sources) lives
 * in its own service; they all keep their documents through here or through the store. */
import { basename, dirname } from "node:path";
import { fileNameOf } from "../../shared/links.ts";
import type { Doc, DocKind, DocOf } from "../../shared/vault-types.ts";
import { NotFound } from "../errors.ts";
import { listConnections } from "../vault/connections.ts";
import {
  blankDoc,
  changed,
  diffOf,
  docFromFile,
  docs,
  fileAt,
  fileHistory,
  logActivity,
  now,
  shortId,
  slugify,
} from "../vault/index.ts";
import { withBody } from "../vault/kinds.ts";
import { allEdges, backlinks, carryLinks, titleOf, unlinkedMentions } from "../vault/links.ts";

/** A folder under notes/ ("", "DDIA", "DDIA/Chapter 5"), cleaned so it can't leave notes/. */
export function cleanFolder(folder?: string) {
  return (folder || "")
    .split(/[\\/]+/)
    .map((part) => fileNameOf(part, 80))
    .filter((part) => part && part !== "Untitled" && part !== "." && part !== "..")
    .join("/");
}

const PREFIX: Record<DocKind, string> = {
  note: "n",
  concept: "",
  card: "c",
  annotation: "a",
  session: "s",
  figure: "f",
};

/** Fields a document's file and identity own: never set by a patch. */
const FIXED = new Set(["id", "kind", "path", "created", "updated", "folder", "props"]);

/** A document by id, or a 404. */
export function getDoc(id: string): Doc;
export function getDoc<K extends DocKind>(id: string, kind: K): DocOf<K>;
export function getDoc(id: string, kind?: DocKind): Doc {
  const doc = kind ? docs.get(id, kind) : docs.get(id);
  if (!doc) throw new NotFound(`${kind || "document"} not found`);
  return doc;
}

const firstLine = (body?: string) =>
  (body || "")
    .split("\n")
    .map((l) => l.replace(/^[#>\-*\s]+/, "").trim())
    .find((l) => l && !l.startsWith("![["))
    ?.slice(0, 80);

export type NewDoc = Partial<Omit<Doc, "kind">> & { kind?: DocKind; folder?: string; [key: string]: unknown };

/** Makes a document (a note unless `kind` says otherwise). A note goes in `folder` under notes/; a
 * concept's id is its name's slug. */
export function createDoc(input: NewDoc, options: { log?: boolean } = {}): Doc {
  const kind = input.kind || "note";
  const at = now();
  const titleGiven = String(input.title || "").trim();
  const title =
    kind === "note" || kind === "concept" ? fileNameOf(titleGiven || firstLine(input.body) || "Untitled") : titleGiven;
  const id = kind === "concept" ? slugify(title) : shortId(PREFIX[kind]);
  if (docs.get(id)) throw new Error(`“${title}” is already in the vault`);
  const doc = blankDoc(kind, id, at);
  const fields = Object.fromEntries(Object.entries(input).filter(([k, v]) => !FIXED.has(k) && v !== undefined));
  Object.assign(doc, fields, { title });
  if (input.body !== undefined) Object.assign(doc, withBody(doc, String(input.body)));
  const folder = kind === "note" ? cleanFolder(input.folder) : "";
  docs.save(doc, kind === "note" ? `notes/${folder ? `${folder}/` : ""}${title}` : undefined);
  changed(`${kind} ${doc.title.slice(0, 40)}`);
  if (kind === "note" && options.log !== false)
    logActivity({
      type: (doc as DocOf<"note">).type === "connection" ? "connect" : "note",
      bookId: doc.source?.bookId,
      concepts: doc.concepts,
      text: `Wrote: ${doc.title}`,
    });
  return doc;
}

/** Changes a document. A new title renames the file of a note or concept (and links to it follow); a new
 * `folder` moves a note; a new body re-reads what a kind keeps in it (a card's sides, a session's turns). */
export function updateDoc(id: string, patch: NewDoc): Doc {
  const doc = getDoc(id);
  const fields = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => !FIXED.has(k) && k !== "title" && v !== undefined),
  );
  // an annotation's type is what was asked of the model; only a highlight and a comment trade places
  if (doc.kind === "annotation" && "type" in fields) {
    const pair = ["highlight", "comment"];
    if (!(pair.includes(String(fields.type)) && pair.includes(doc.type))) delete fields.type;
  }
  Object.assign(doc, fields, { updated: now() });
  if (patch.body !== undefined) Object.assign(doc, withBody(doc, String(patch.body)));
  const renames = doc.kind === "note" || doc.kind === "concept";
  if (patch.title !== undefined && !renames) doc.title = String(patch.title).trim() || doc.title;
  docs.save(doc);
  if (renames && (patch.title !== undefined || (doc.kind === "note" && patch.folder !== undefined))) {
    const nextTitle = patch.title !== undefined ? fileNameOf(String(patch.title).trim() || doc.title) : doc.title;
    const root = doc.kind === "note" ? "notes" : "concepts";
    const folder =
      doc.kind === "note"
        ? patch.folder !== undefined
          ? cleanFolder(patch.folder)
          : dirname(doc.path).replace(/^notes\/?/, "")
        : "";
    const target = `${root}/${folder ? `${folder}/` : ""}${nextTitle}`;
    if (`${target}.md` !== doc.path) {
      const oldPath = doc.path;
      const oldKeys = [basename(oldPath), oldPath];
      const moved = docs.move(doc.id, target);
      if (moved && moved !== oldPath) carryLinks(oldKeys, { name: basename(moved, ".md"), path: moved });
    }
  }
  changed(`${doc.kind} ${doc.title.slice(0, 40)}`);
  return docs.get(id)!;
}

/** Appends Markdown to a document (a passage, a reference, an explanation from the reader). */
export function appendToDoc(id: string, markdown: string): Doc {
  const doc = getDoc(id);
  return updateDoc(id, { body: `${doc.body.trimEnd()}${doc.body.trim() ? "\n\n" : ""}${markdown.trim()}\n` });
}

/** Deletes a document (its file goes to .trash/). */
export function deleteDoc(id: string): boolean {
  const doc = docs.get(id);
  if (!doc) return false;
  docs.remove(id);
  changed(`delete ${doc.kind} ${doc.title.slice(0, 40)}`);
  return true;
}

export interface DocFilter {
  kind?: DocKind;
  /** A subtype (a note's type, an annotation's). */
  type?: string;
  /** From this book (its source) or about it. */
  book?: string;
  /** About this concept (by id). */
  concept?: string;
  /** Under this folder of notes/. */
  folder?: string;
  tag?: string;
}

/** Documents matching every filter given, most recently updated first. */
export function listDocs(filter: DocFilter = {}): Doc[] {
  const { kind, type, book, concept, folder, tag } = filter;
  const aboutBook = book
    ? new Set(
        allEdges()
          .filter((e) => e.kind === "about" && e.to === `book:${book}`)
          .map((e) => e.fromPath),
      )
    : null;
  return (kind ? docs.list(kind) : docs.list())
    .filter(
      (d) =>
        (!type || (d as { type?: string }).type === type) &&
        (!book || d.source?.bookId === book || aboutBook?.has(d.path)) &&
        (!concept || d.concepts.includes(concept)) &&
        (!folder || d.path.startsWith(`notes/${folder}/`)) &&
        (!tag || d.tags.includes(tag)),
    )
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

/** A document with what its page shows beside it: links in and out, unlinked mentions, suggested connections. */
export function docDetail(doc: Doc) {
  const node = `${doc.kind}:${doc.id}`;
  const outgoing = allEdges()
    .filter((e) => e.from === node && e.kind !== "source")
    .map((e) => ({
      target: e.target,
      kind: e.kind,
      to: e.to,
      path: e.toPath,
      title: e.to ? titleOf(e.to, e.toPath) : e.target,
    }));
  const connections = listConnections().filter((x) => x.from === doc.path && x.status !== "removed");
  return {
    ...doc,
    backlinks: backlinks(node),
    mentions: doc.kind === "note" || doc.kind === "concept" ? unlinkedMentions(doc) : [],
    outgoing,
    connections,
  };
}

/* ---------------- versions ---------------- */

/** The saved versions of a document, newest first. */
export function docVersions(id: string) {
  return fileHistory(getDoc(id).path);
}

/** A document as it was in a version: its body, and what that version changed. */
export function docVersion(id: string, commit: string) {
  const doc = getDoc(id);
  const text = fileAt(commit, doc.path);
  if (text === null) throw new Error("that version isn't in the history");
  return { body: docFromFile(doc.path, text, doc.updated).body, diff: diffOf(commit, doc.path) };
}

/** Brings a document back to an earlier version (as a new change: the current one stays in the history). */
export function restoreDoc(id: string, commit: string): Doc {
  const doc = getDoc(id);
  const text = fileAt(commit, doc.path);
  if (text === null) throw new Error("that version isn't in the history");
  const old = docFromFile(doc.path, text, doc.updated);
  const { id: _id, path: _path, title: _title, created: _created, updated: _updated, ...rest } = old;
  Object.assign(doc, rest, { updated: now() });
  docs.save(doc);
  changed(`restore ${doc.kind} ${doc.title.slice(0, 40)}`);
  return doc;
}
