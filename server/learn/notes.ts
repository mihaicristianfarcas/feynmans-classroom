/* What only notes have: the folders of notes/ (made, renamed or moved with every link to the notes in
 * them, and deleted), the file tree, the note a book's reading writes into, and turning a plain mention
 * into a link. Everything else a note does (made, changed, renamed, versions) is what every document
 * does: learn/docs.ts. */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Note, SourceRef } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { changed, docs, touched, trash, VAULT } from "../vault/index.ts";
import { cleanFolder, createDoc, updateDoc } from "./docs.ts";

/** The note a book's reading session writes into by default: "<Book title>" in notes/, made on first use. */
export function bookNote(bookId: string): Note {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const existing = docs.list("note").find((n) => n.source?.bookId === bookId && n.tags.includes("reading"));
  if (existing) return existing;
  const source: SourceRef = { bookId };
  return createDoc({
    kind: "note",
    title: `${book.title} — notes`,
    body: `Notes while reading [[${book.title}]].\n`,
    source,
    tags: ["reading"],
  }) as Note;
}

/** Turns the first plain mention of a document's title (or alias) in a note into a link. */
export function linkMention(targetId: string, inPath: string) {
  const target = docs.get(targetId);
  const other = docs.at(inPath, "note");
  if (!target || !other) throw new Error("note not found");
  const names = [target.title, ...target.aliases].filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}\\[|])(${escaped})(?=$|[^\\p{L}\\p{N}\\]|])`, "iu");
  const lines = other.body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/\[\[[^\]]*\]\]/.test(lines[i]) && lines[i].toLowerCase().includes(`[[${target.title.toLowerCase()}`)) continue;
    const m = pattern.exec(lines[i]);
    if (!m) continue;
    const found = m[2];
    const link = found === target.title ? `[[${target.title}]]` : `[[${target.title}|${found}]]`;
    lines[i] = lines[i].slice(0, m.index + m[1].length) + link + lines[i].slice(m.index + m[1].length + found.length);
    return updateDoc(other.id, { body: lines.join("\n") });
  }
  return other;
}

/** The file tree: every note (path and title) and every folder under notes/, empty ones too. */
export function noteTree() {
  const folders: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(VAULT, rel), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      folders.push(`${rel}/${entry.name}`.replace(/^notes\//, ""));
      walk(`${rel}/${entry.name}`);
    }
  };
  if (existsSync(join(VAULT, "notes")) && statSync(join(VAULT, "notes")).isDirectory()) walk("notes");
  return {
    notes: docs
      .list("note")
      .map((n) => ({ id: n.id, path: n.path, title: n.title, type: n.type, updated: n.updated }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    folders: folders.sort(),
  };
}

/* ---------------- folders ---------------- */

const folderDir = (folder: string) => join(VAULT, "notes", folder);
const notesIn = (folder: string) => docs.list("note").filter((n) => n.path.startsWith(`notes/${folder}/`));

/** Makes a folder under notes/ (an empty one shows in the tree until something is put in it). */
export function createFolder(path: string): string {
  const folder = cleanFolder(path);
  if (!folder) throw new Error("name the folder");
  mkdirSync(folderDir(folder), { recursive: true });
  touched(`notes/${folder}`);
  return folder;
}

/** Renames or moves a folder with everything in it; links to its notes follow them. */
export function moveFolder(from: string, to: string): string {
  const source = cleanFolder(from);
  const target = cleanFolder(to);
  if (!source || !target) throw new Error("name both folders");
  if (!existsSync(folderDir(source))) throw new Error("folder not found");
  if (target === source) return target;
  if (target.startsWith(`${source}/`)) throw new Error("a folder can't move into itself");
  for (const note of notesIn(source)) {
    const inside = dirname(note.path.slice(`notes/${source}/`.length));
    updateDoc(note.id, { folder: inside === "." ? target : `${target}/${inside}` });
  }
  // whatever else was in it (pictures, files the app doesn't read), and the empty folders
  const walk = (rel: string) => {
    for (const entry of readdirSync(folderDir(rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else {
        const dest = folderDir(`${target}${child.slice(source.length)}`);
        mkdirSync(dirname(dest), { recursive: true });
        if (!existsSync(dest)) renameSync(folderDir(child), dest);
      }
    }
  };
  walk(source);
  mkdirSync(folderDir(target), { recursive: true });
  rmSync(folderDir(source), { recursive: true, force: true });
  touched(`notes/${source}`);
  changed(`folder ${target}`);
  return target;
}

/** Deletes a folder: its notes (and anything else in it) go to the vault's trash. */
export function deleteFolder(path: string): number {
  const folder = cleanFolder(path);
  if (!folder || !existsSync(folderDir(folder))) throw new Error("folder not found");
  const inside = notesIn(folder);
  for (const note of inside) docs.remove(note.id);
  const walk = (rel: string) => {
    for (const entry of readdirSync(folderDir(rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else trash(`notes/${child}`);
    }
  };
  walk(folder);
  rmSync(folderDir(folder), { recursive: true, force: true });
  touched(`notes/${folder}`);
  changed(`delete folder ${folder}`);
  return inside.length;
}
