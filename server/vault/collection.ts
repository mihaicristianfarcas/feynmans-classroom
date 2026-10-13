/* A collection: the records of one kind (notes, cards…) as files in one vault folder. It keeps an
 * in-memory index by id, writes through to disk atomically, finds free file names, renames and
 * deletes (to .trash/, as Obsidian does), and re-reads single files after outside edits. */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { touched, wroteItself } from "./changes.ts";
import { atomicWrite, pathId, VAULT } from "./files.ts";

interface CollectionSpec<T> {
  /** Folder under the vault that is scanned. */
  root: string;
  ext: string;
  /** Scan sub-folders too. */
  recursive?: boolean;
  /** Which vault-relative paths belong to this collection. */
  match?: (rel: string) => boolean;
  read: (rel: string, text: string, mtime: string) => T;
  write: (item: T) => string;
  /** Vault-relative path for a new item, without the extension; made unique on save. */
  place: (item: T) => string;
}

/** One kind of record kept as files under one folder: an in-memory index, written through to disk. */
export class Collection<T extends { id: string }> {
  readonly items = new Map<string, T>();
  private files = new Map<string, string>();
  constructor(readonly spec: CollectionSpec<T>) {}

  get dir() {
    return this.spec.root;
  }

  owns(rel: string) {
    if (!rel.endsWith(this.spec.ext) || basename(rel).startsWith(".")) return false;
    if (!(rel === this.spec.root || rel.startsWith(`${this.spec.root}/`))) return false;
    if (!this.spec.recursive && dirname(rel) !== this.spec.root) return false;
    return this.spec.match ? this.spec.match(rel) : true;
  }

  load() {
    this.items.clear();
    this.files.clear();
    const walk = (dir: string) => {
      const full = join(VAULT, dir);
      if (!existsSync(full)) return;
      for (const entry of readdirSync(full, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (this.spec.recursive) walk(rel);
        } else if (this.owns(rel)) this.loadFile(rel);
      }
    };
    walk(this.spec.root);
  }

  /** (Re)reads one file, given its vault-relative path; a missing file is forgotten. */
  loadFile(rel: string): T | undefined {
    for (const [id, f] of this.files)
      if (f === rel) {
        this.items.delete(id);
        this.files.delete(id);
      }
    const path = join(VAULT, rel);
    if (!existsSync(path)) return undefined;
    try {
      const stat = statSync(path);
      const item = this.spec.read(rel, readFileSync(path, "utf8"), stat.mtime.toISOString());
      // two files claiming one id: the second one gets an id of its own
      if (this.files.has(item.id) && this.files.get(item.id) !== rel) item.id = pathId(rel);
      this.items.set(item.id, item);
      this.files.set(item.id, rel);
      return item;
    } catch (error) {
      console.warn(`[vault] could not read ${rel}: ${(error as Error).message}`);
      return undefined;
    }
  }

  list(): T[] {
    return [...this.items.values()];
  }
  get(id: string): T | undefined {
    return this.items.get(id);
  }
  byPath(rel: string): T | undefined {
    for (const [id, f] of this.files) if (f === rel) return this.items.get(id);
    return undefined;
  }

  /** A free vault-relative path for `base` (no extension): "Title", then "Title 2", … */
  freePath(base: string, except?: string) {
    let rel = `${base}${this.spec.ext}`;
    for (let n = 2; existsSync(join(VAULT, rel)) && rel !== except; n++) rel = `${base} ${n}${this.spec.ext}`;
    return rel;
  }

  /** Writes an item; a new one goes where `place` (or `at`) says. */
  save(item: T, at?: string): T {
    let rel = this.files.get(item.id);
    if (!rel) rel = this.freePath(at ?? this.spec.place(item));
    wroteItself(rel);
    atomicWrite(join(VAULT, rel), this.spec.write(item));
    this.items.set(item.id, item);
    this.files.set(item.id, rel);
    if ("path" in (item as object)) (item as unknown as { path: string }).path = rel;
    touched(rel);
    return item;
  }

  /** Moves an item's file (a rename); returns the new path. */
  move(id: string, toBase: string): string | null {
    const from = this.files.get(id);
    if (!from) return null;
    const to = this.freePath(toBase, from);
    if (to === from) return from;
    mkdirSync(dirname(join(VAULT, to)), { recursive: true });
    wroteItself(from);
    wroteItself(to);
    renameSync(join(VAULT, from), join(VAULT, to));
    this.files.set(id, to);
    const item = this.items.get(id);
    if (item && "path" in (item as object)) (item as unknown as { path: string }).path = to;
    if (item && "title" in (item as object) && this.spec.root === "notes")
      (item as unknown as { title: string }).title = basename(to, this.spec.ext);
    touched(from);
    touched(to);
    return to;
  }

  /** Deletes an item: its file goes to .trash/ (as in Obsidian), so nothing is lost by a slip. */
  remove(id: string): boolean {
    const rel = this.files.get(id);
    if (!rel) return false;
    trash(rel);
    this.items.delete(id);
    this.files.delete(id);
    return true;
  }

  fileOf(id: string) {
    return this.files.get(id) || null;
  }
}

export function trash(rel: string) {
  const from = join(VAULT, rel);
  if (!existsSync(from)) return;
  const to = join(VAULT, ".trash", `${new Date().toISOString().replace(/[:.]/g, "-")} ${basename(rel)}`);
  mkdirSync(dirname(to), { recursive: true });
  wroteItself(rel);
  renameSync(from, to);
  touched(rel);
}

/** Files the server writes from the others (indexes); never read as notes, never committed. */
export const GENERATED = ["INDEX.md", "notes/INDEX.md", "concepts/INDEX.md", "library/INDEX.md"];
/** Whether a path is one of the generated indexes (never read as a note, never committed). */
export const isGenerated = (rel: string) => GENERATED.includes(rel) || /^library\/[^/]+\/README\.md$/.test(rel);
