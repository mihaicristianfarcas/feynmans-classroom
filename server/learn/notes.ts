/* Notes: Markdown files in notes/ (folders allowed), named by their title as in Obsidian. Renaming
 * one moves the file and carries every link to it along; deleting one moves it to .trash/. */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileNameOf } from "../../shared/links.ts";
import type { Note, SourceRef } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { listConnections } from "../vault/connections.ts";
import { changed, logActivity, notes, now, shortId, VAULT } from "../vault/index.ts";
import { allEdges, backlinks, carryLinks, titleOf, unlinkedMentions } from "../vault/links.ts";

/** A folder under notes/ ("", "DDIA", "DDIA/Chapter 5"), cleaned so it can't leave notes/. */
export function cleanFolder(folder?: string) {
  return (folder || "")
    .split(/[\\/]+/)
    .map((part) => fileNameOf(part, 80))
    .filter((part) => part && part !== "Untitled" && part !== "." && part !== "..")
    .join("/");
}

export function createNote(input: Partial<Note> & { folder?: string }, options: { log?: boolean } = {}): Note {
  const title = fileNameOf((input.title || "").trim() || firstLine(input.body) || "Untitled");
  const folder = cleanFolder(input.folder);
  const note: Note = {
    id: shortId("n"),
    path: "",
    type: input.type || "note",
    title,
    body: input.body || "",
    tags: input.tags || [],
    aliases: input.aliases || [],
    related: input.related || [],
    concepts: input.concepts || [],
    source: input.source,
    score: input.score,
    created: now(),
    updated: now(),
  };
  notes.save(note, `notes/${folder ? `${folder}/` : ""}${title}`);
  changed(`note ${note.title}`);
  if (options.log !== false)
    logActivity({
      type: note.type === "connection" ? "connect" : "note",
      bookId: note.source?.bookId,
      concepts: note.concepts,
      text: `Wrote: ${note.title}`,
    });
  return note;
}

const firstLine = (body?: string) =>
  (body || "")
    .split("\n")
    .map((l) => l.replace(/^[#>\-*\s]+/, "").trim())
    .find((l) => l && !l.startsWith("![["))
    ?.slice(0, 80);

/** Saves changes to a note; a new title renames the file (and the links to it), a new folder moves it. */
export function updateNote(id: string, patch: Partial<Note> & { folder?: string }): Note {
  const note = notes.get(id);
  if (!note) throw new Error("note not found");
  const { title, folder, path: _path, id: _id, created: _created, ...rest } = patch;
  Object.assign(note, rest, { updated: now() });
  notes.save(note);
  const nextTitle = title !== undefined ? fileNameOf(title.trim() || note.title) : note.title;
  const nextFolder = folder !== undefined ? cleanFolder(folder) : dirname(note.path).replace(/^notes\/?/, "");
  const target = `notes/${nextFolder ? `${nextFolder}/` : ""}${nextTitle}`;
  if (`${target}.md` !== note.path) {
    const oldPath = note.path;
    const oldKeys = [basename(oldPath), oldPath];
    const moved = notes.move(note.id, target);
    if (moved && moved !== oldPath) carryLinks(oldKeys, { name: basename(moved, ".md"), path: moved });
  }
  changed(`note ${note.title}`);
  return notes.get(id)!;
}

/** Appends Markdown to a note (a passage, a reference, an explanation from the reader). */
export function appendToNote(id: string, markdown: string): Note {
  const note = notes.get(id);
  if (!note) throw new Error("note not found");
  note.body = `${note.body.trimEnd()}${note.body.trim() ? "\n\n" : ""}${markdown.trim()}\n`;
  note.updated = now();
  notes.save(note);
  changed(`note ${note.title}`);
  return note;
}

export function deleteNote(id: string) {
  const note = notes.get(id);
  if (!note) return false;
  notes.remove(id);
  changed(`delete note ${note.title}`);
  return true;
}

/** The note a book's reading session writes into by default: "<Book title>" in notes/, made on first use. */
export function bookNote(bookId: string): Note {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const existing = notes
    .list()
    .find((n) => n.props?.book === bookId || (n.source?.bookId === bookId && n.props?.reading === true));
  if (existing) return existing;
  const source: SourceRef = { bookId };
  const note = createNote({
    title: `${book.title} — notes`,
    body: `Notes while reading [[${book.title}]].\n`,
    source,
    tags: ["reading"],
  });
  note.props = { ...(note.props || {}), book: bookId };
  notes.save(note);
  return note;
}

/** Turns the first plain mention of a note's title (or alias) in another note into a link. */
export function linkMention(targetId: string, inPath: string): Note {
  const target = notes.get(targetId);
  const other = notes.byPath(inPath);
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
    return updateNote(other.id, { body: lines.join("\n") });
  }
  return other;
}

/** Notes matching every filter given, most recently updated first. */
export function listNotes(filter: { type?: string; book?: string; concept?: string; folder?: string }): Note[] {
  const { type, book, concept, folder } = filter;
  return notes
    .list()
    .filter(
      (n) =>
        (!type || n.type === type) &&
        (!book || n.source?.bookId === book) &&
        (!concept || n.concepts.includes(concept)) &&
        (!folder || n.path.startsWith(`notes/${folder}/`)),
    )
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

/** A note with what the page shows beside it: backlinks, unlinked mentions, links out, suggested connections. */
export function noteDetail(note: Note) {
  const node = `note:${note.id}`;
  const outgoing = allEdges()
    .filter((e) => e.from === node && e.kind !== "source")
    .map((e) => ({
      target: e.target,
      kind: e.kind,
      to: e.to,
      path: e.toPath,
      title: e.to ? titleOf(e.to, e.toPath) : e.target,
    }));
  const connections = listConnections().filter((x) => x.from === note.path && x.status !== "removed");
  return { ...note, backlinks: backlinks(node), mentions: unlinkedMentions(note), outgoing, connections };
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
    notes: notes
      .list()
      .map((n) => ({ id: n.id, path: n.path, title: n.title, type: n.type, updated: n.updated }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    folders: folders.sort(),
  };
}
