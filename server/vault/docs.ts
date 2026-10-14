/* The documents: every Markdown record in the vault (notes, concepts, cards, annotations, sessions with
 * the tutor, kept figures), in one store. It keeps an in-memory index (by id, by path and by kind),
 * writes through to disk atomically, finds free file names, renames and deletes (to .trash/, as
 * Obsidian does), and re-reads files edited outside the app. How each kind is kept as a file is in
 * kinds.ts; everything else (links, search, history) works on documents of any kind. */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Doc, DocKind, DocOf } from "../../shared/vault-types.ts";
import { touched, wroteItself } from "./changes.ts";
import { atomicWrite, pathId, VAULT } from "./files.ts";
import { docFromFile, docToFile, kindOfPath, placeOf } from "./kinds.ts";

/** Files the server writes from the others (indexes); never read as documents, never committed. */
export const GENERATED = ["INDEX.md", "notes/INDEX.md", "concepts/INDEX.md", "library/INDEX.md"];
/** Whether a path is one of the generated indexes. */
export const isGenerated = (rel: string) => GENERATED.includes(rel) || /^library\/[^/]+\/README\.md$/.test(rel);

/** The folders documents live in (a book's annotations and sessions are under library/<book>/). */
const ROOTS = ["notes", "concepts", "cards", "figures", "library"];

class DocStore {
  private items = new Map<string, Doc>();
  private files = new Map<string, string>();
  private kinds = new Map<DocKind, Set<string>>();

  /** Whether a vault-relative path is a document's file. */
  owns(rel: string) {
    if (!rel.endsWith(".md") || basename(rel).startsWith(".") || isGenerated(rel)) return false;
    return kindOfPath(rel) !== null;
  }

  /** Reads every document. */
  load() {
    this.items.clear();
    this.files.clear();
    this.kinds.clear();
    for (const root of ROOTS) this.loadDir(root);
  }

  /** (Re)reads the documents in a folder (one that appeared or moved), forgetting those no longer there. */
  loadDir(dir: string) {
    for (const [id, rel] of this.files) if (rel.startsWith(`${dir}/`) && !existsSync(join(VAULT, rel))) this.forget(id);
    const walk = (rel: string) => {
      const full = join(VAULT, rel);
      if (!existsSync(full) || !statSync(full).isDirectory()) return;
      for (const entry of readdirSync(full, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (this.owns(child)) this.loadFile(child);
      }
    };
    walk(dir);
  }

  /** (Re)reads one file, given its vault-relative path; a missing file is forgotten. */
  loadFile(rel: string): Doc | undefined {
    for (const [id, f] of this.files) if (f === rel) this.forget(id);
    const path = join(VAULT, rel);
    if (!existsSync(path)) return undefined;
    try {
      const doc = docFromFile(rel, readFileSync(path, "utf8"), statSync(path).mtime.toISOString());
      // two files claiming one id: the second one gets an id of its own
      if (this.files.has(doc.id) && this.files.get(doc.id) !== rel) doc.id = pathId(rel);
      this.remember(doc, rel);
      return doc;
    } catch (error) {
      console.warn(`[vault] could not read ${rel}: ${(error as Error).message}`);
      return undefined;
    }
  }

  private remember(doc: Doc, rel: string) {
    const old = this.items.get(doc.id);
    if (old && old.kind !== doc.kind) this.kinds.get(old.kind)?.delete(doc.id);
    this.items.set(doc.id, doc);
    this.files.set(doc.id, rel);
    const ids = this.kinds.get(doc.kind) || new Set<string>();
    this.kinds.set(doc.kind, ids);
    ids.add(doc.id);
  }

  private forget(id: string) {
    const doc = this.items.get(id);
    if (doc) this.kinds.get(doc.kind)?.delete(id);
    this.items.delete(id);
    this.files.delete(id);
  }

  /** Every document, or those of one kind. */
  list(): Doc[];
  list<K extends DocKind>(kind: K): DocOf<K>[];
  list(kind?: DocKind): Doc[] {
    if (!kind) return [...this.items.values()];
    return [...(this.kinds.get(kind) || [])].map((id) => this.items.get(id)!);
  }

  /** A document by id (of the kind asked for, if one is). */
  get(id: string): Doc | undefined;
  get<K extends DocKind>(id: string, kind: K): DocOf<K> | undefined;
  get(id: string, kind?: DocKind): Doc | undefined {
    const doc = this.items.get(id);
    return doc && (!kind || doc.kind === kind) ? doc : undefined;
  }

  /** The document kept in a file (of the kind asked for, if one is). */
  at(rel: string): Doc | undefined;
  at<K extends DocKind>(rel: string, kind: K): DocOf<K> | undefined;
  at(rel: string, kind?: DocKind): Doc | undefined {
    for (const [id, f] of this.files) if (f === rel) return this.get(id, kind as DocKind);
    return undefined;
  }

  count(kind?: DocKind) {
    return kind ? this.kinds.get(kind)?.size || 0 : this.items.size;
  }

  fileOf(id: string) {
    return this.files.get(id) || null;
  }

  /** A free vault-relative path for `base` (no extension): "Title", then "Title 2", … */
  freePath(base: string, except?: string) {
    let rel = `${base}.md`;
    for (let n = 2; existsSync(join(VAULT, rel)) && rel !== except; n++) rel = `${base} ${n}.md`;
    return rel;
  }

  /** Writes a document (a new one goes where its kind puts it, or `at`), and reads it back, so what is in
   * memory is what the file says (a card's body from its sides, a note's title from its file name). */
  save<D extends Doc>(doc: D, at?: string): D {
    let rel = this.files.get(doc.id);
    if (!rel) rel = this.freePath(at ?? placeOf(doc));
    mkdirSync(dirname(join(VAULT, rel)), { recursive: true });
    const text = docToFile(doc);
    wroteItself(rel);
    atomicWrite(join(VAULT, rel), text);
    Object.assign(doc, docFromFile(rel, text, doc.updated), { id: doc.id });
    this.remember(doc, rel);
    touched(rel);
    return doc;
  }

  /** Moves a document's file (a rename); returns the new path. A note's or concept's title follows its name. */
  move(id: string, toBase: string): string | null {
    const from = this.files.get(id);
    const doc = this.items.get(id);
    if (!from || !doc) return null;
    const to = this.freePath(toBase, from);
    if (to === from) return from;
    mkdirSync(dirname(join(VAULT, to)), { recursive: true });
    wroteItself(from);
    wroteItself(to);
    renameSync(join(VAULT, from), join(VAULT, to));
    this.files.set(id, to);
    const text = readFileSync(join(VAULT, to), "utf8");
    Object.assign(doc, docFromFile(to, text, doc.updated), { id });
    touched(from);
    touched(to);
    return to;
  }

  /** Deletes a document: its file goes to .trash/ (as in Obsidian), so nothing is lost by a slip. */
  remove(id: string): boolean {
    const rel = this.files.get(id);
    if (!rel) return false;
    // forgotten first, so whoever hears of the change finds it gone
    this.forget(id);
    trash(rel);
    return true;
  }
}

export const docs = new DocStore();

/** Moves a file to the vault's .trash/. */
export function trash(rel: string) {
  const from = join(VAULT, rel);
  if (!existsSync(from)) return;
  const to = join(VAULT, ".trash", `${new Date().toISOString().replace(/[:.]/g, "-")} ${basename(rel)}`);
  mkdirSync(dirname(to), { recursive: true });
  wroteItself(rel);
  renameSync(from, to);
  touched(rel);
}
