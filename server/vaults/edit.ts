/* Changing a vault, the way Obsidian would: saving a note (refused, with the text on disk,
 * if it changed there since it was opened), making a note or a folder where Obsidian's settings put
 * new ones, saving a pasted picture where its settings put attachments, renaming or moving a note,
 * a file or a folder (every link to it follows, as with Obsidian's "update links"), and deleting to
 * the vault's .trash folder. Each change is read straight into the index and returned, so the caller
 * can announce it. */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileNameOf } from "../../shared/links.ts";
import { atomicWrite, readJson } from "../fs.ts";
import { type Change, cleanRel, type Vault } from "./vault.ts";

export class Conflict extends Error {
  constructor(readonly text: string) {
    super("this note changed on disk since you opened it");
  }
}

const dirOf = (rel: string) => posix.dirname(rel).replace(/^\.$/, "");

/** Obsidian's own settings for where new notes and attachments go (.obsidian/app.json). */
function obsidianSettings(vault: Vault) {
  return readJson<{
    newFileLocation?: "root" | "current" | "folder";
    newFileFolderPath?: string;
    attachmentFolderPath?: string;
    useMarkdownLinks?: boolean;
  }>(join(vault.root, ".obsidian", "app.json"), {});
}

/** A path like `want` that no file has yet ("Untitled 2.md"). */
function free(vault: Vault, want: string): string {
  const ext = posix.extname(want);
  const stem = want.slice(0, want.length - ext.length);
  let path = want;
  for (let n = 2; vault.files.has(path) || existsSync(join(vault.root, path)); n++) path = `${stem} ${n}${ext}`;
  return path;
}

function must(vault: Vault, rel: string): string {
  const full = vault.abs(rel);
  if (!full) throw new Error("that path is outside the vault");
  return full;
}

/** Saves a note's text. With `base` (the text it was opened with), refuses if the file changed since. */
export function saveNote(vault: Vault, rel: string, text: string, base?: string): Change {
  const clean = cleanRel(rel);
  if (!clean?.toLowerCase().endsWith(".md")) throw new Error("only notes (.md files) can be edited");
  const full = must(vault, clean);
  const exists = existsSync(full);
  const now = exists ? readFileSync(full, "utf8") : undefined;
  if (base !== undefined && now !== undefined && now !== base && now !== text) throw new Conflict(now);
  // the same text again (an editor echoing a change from disk): the file, and Obsidian, are left alone
  if (now === text) return { path: clean, change: "changed" };
  atomicWrite(full, text);
  vault.load(clean);
  return { path: clean, change: exists ? "changed" : "added" };
}

/** The folder a new note goes in: beside `from` or in Obsidian's chosen folder, as its settings say. */
export function newNoteFolder(vault: Vault, from?: string): string {
  const s = obsidianSettings(vault);
  if (s.newFileLocation === "current" && from) return dirOf(from);
  if (s.newFileLocation === "folder" && s.newFileFolderPath) return cleanRel(s.newFileFolderPath) ?? "";
  return "";
}

/** Makes a note: `title` in `folder`, or (a link to a note that isn't there yet) at the path the link names. */
export function createNote(vault: Vault, opts: { title?: string; folder?: string; from?: string; text?: string }) {
  const title = (opts.title || "Untitled").trim();
  const parts = title.split("/").map((p) => fileNameOf(p));
  const folder = cleanRel(opts.folder ?? (parts.length > 1 ? "" : newNoteFolder(vault, opts.from)));
  if (folder === null) throw new Error("that folder is outside the vault");
  const path = free(vault, [folder, ...parts].filter(Boolean).join("/").concat(".md"));
  const full = must(vault, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, opts.text ?? "", { flag: "wx" });
  vault.load(path);
  return { path, change: "added" as const };
}

export function createFolder(vault: Vault, rel: string): Change {
  const clean = cleanRel(rel);
  if (!clean) throw new Error("name the folder");
  mkdirSync(must(vault, clean), { recursive: true });
  vault.reconcile(clean);
  vault.folders.add(clean);
  return { path: clean, change: "added" };
}

/** Where a picture pasted into `note` goes, by Obsidian's attachment setting ("./" is beside the note). */
export function attachmentFolder(vault: Vault, note?: string): string {
  const setting = (obsidianSettings(vault).attachmentFolderPath || "/").trim();
  if (setting === "/" || setting === "") return "";
  if (setting.startsWith("./")) return cleanRel(posix.join(dirOf(note || ""), setting.slice(2))) ?? "";
  return cleanRel(setting) ?? "";
}

const DATA_URL = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
const MAX_BYTES = 50 * 1024 * 1024;

/** Saves a pasted or dropped file (a data URL) as an attachment; returns its path and the embed to write
 * (![[name]], or ![](path) when Obsidian is set to write Markdown links). */
export function saveAttachment(vault: Vault, dataUrl: string, name?: string, note?: string) {
  const m = DATA_URL.exec(dataUrl || "");
  const ext = m && EXT[m[1]];
  if (!m || !ext) throw new Error("send a picture, PDF, sound or video file");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) throw new Error("file too large (50 MB max)");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const base = fileNameOf((name || `Pasted image ${stamp}`).replace(/\.[a-z0-9]+$/i, ""), 90);
  const folder = attachmentFolder(vault, note);
  const path = free(vault, [folder, `${base}.${ext}`].filter(Boolean).join("/"));
  const full = must(vault, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
  vault.load(path);
  const embed = obsidianSettings(vault).useMarkdownLinks
    ? `![](${vault.linkTo(path, note || "", true)})`
    : `![[${vault.linkTo(path, note || "")}]]`;
  return { path, link: vault.linkTo(path, note || ""), embed, change: { path, change: "added" as const } };
}

/** Renames or moves a note, a file or a folder, and rewrites every link that pointed into it. */
export function move(vault: Vault, from: string, to: string): Change[] {
  const src = cleanRel(from);
  let dest = cleanRel(to);
  if (!src || !dest) throw new Error("that path is outside the vault");
  const isFolder = vault.folders.has(src) && !vault.files.has(src);
  if (!isFolder && src.toLowerCase().endsWith(".md") && !dest.toLowerCase().endsWith(".md")) dest += ".md";
  if (src === dest) return [];
  const srcFull = must(vault, src);
  const destFull = must(vault, dest);
  if (!existsSync(srcFull)) throw new Error("nothing at that path");
  if (existsSync(destFull) && src.toLowerCase() !== dest.toLowerCase()) throw new Error(`${dest} already exists`);
  if (isFolder && `${dest}/`.startsWith(`${src}/`)) throw new Error("a folder can't go inside itself");

  // where every link goes now, before anything moves
  const moved = (p: string) => (p === src ? dest : p.startsWith(`${src}/`) ? dest + p.slice(src.length) : null);
  const before = new Map<string, (string | null)[]>();
  for (const e of vault.files.values())
    if (e.kind === "note")
      before.set(
        e.path,
        vault.outgoing(e.path).map((o) => o.path),
      );

  mkdirSync(dirname(destFull), { recursive: true });
  renameSync(srcFull, destFull);
  const changes = [...vault.reconcile(src), ...vault.reconcile(dest)];
  if (isFolder) vault.folders.delete(src);

  // then every link that now goes somewhere else (or nowhere) is pointed at the moved file again
  for (const [oldPath, targets] of before) {
    const path = moved(oldPath) ?? oldPath;
    const entry = vault.files.get(path);
    if (!entry?.text) continue;
    const now = vault.outgoing(path);
    const edits: { start: number; end: number; text: string }[] = [];
    entry.links.forEach((link, i) => {
      const was = targets[i];
      const want = was ? (moved(was) ?? was) : null;
      if (!want || now[i]?.path === want) return;
      const target = vault.linkTo(want, path, link.md);
      if (link.start < 0) {
        edits.push({ start: -1, end: -1, text: `${link.target}\n${target}` });
        return;
      }
      const sub = link.sub ? `#${link.sub}` : "";
      const text = link.md
        ? `${link.embed ? "!" : ""}[${link.alias ?? ""}](${target}${sub ? sub.replace(/ /g, "%20") : ""})`
        : `${link.embed ? "!" : ""}[[${target}${sub}${link.alias ? `|${link.alias}` : ""}]]`;
      edits.push({ start: link.start, end: link.end, text });
    });
    if (!edits.length) continue;
    let text = entry.text;
    for (const e of edits.filter((e) => e.start >= 0).sort((a, b) => b.start - a.start))
      text = text.slice(0, e.start) + e.text + text.slice(e.end);
    // links in properties: "[[Old]]" written as a value
    for (const e of edits.filter((e) => e.start < 0)) {
      const [old, next] = e.text.split("\n");
      text = text.replace(`[[${old}]]`, `[[${next}]]`).replace(`[[${old}|`, `[[${next}|`);
    }
    atomicWrite(join(vault.root, path), text);
    vault.load(path);
    changes.push({ path, change: "changed" });
  }
  return changes;
}

/** Moves a note, file or folder to the vault's .trash folder (Obsidian's "move to Obsidian trash"). */
export function trash(vault: Vault, rel: string): Change[] {
  const clean = cleanRel(rel);
  if (!clean) throw new Error("that path is outside the vault");
  const full = must(vault, clean);
  if (!existsSync(full)) throw new Error("nothing at that path");
  const name = posix.basename(clean);
  let dest = join(vault.root, ".trash", name);
  for (let n = 2; existsSync(dest); n++) {
    const ext = statSync(full).isDirectory() ? "" : posix.extname(name);
    dest = join(vault.root, ".trash", `${name.slice(0, name.length - ext.length)} ${n}${ext}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(full, dest);
  const changes = vault.reconcile(clean);
  vault.folders.delete(clean);
  return changes.length ? changes : [{ path: clean, change: "removed" }];
}
