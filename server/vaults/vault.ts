/* One vault, indexed in memory: every note (its text, properties, tags, links, headings) and
 * every other file in it (pictures, PDFs, sound, video: its attachments), and its folders. Hidden
 * folders (.obsidian, .trash, .git) are left out. Links resolve the way Obsidian resolves them, and
 * from that come backlinks, mentions without a link, tags, search and the graph.
 *
 * The files stay the only source of truth: `reconcile()` brings the index up to date with the folder
 * (at start, after a watcher's event, and every so often in case one was missed), re-reading only
 * what changed. */
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, posix, sep } from "node:path";
import type { Heading, VaultLink } from "./parse.ts";
import { parseNote, sectionOf } from "./parse.ts";

export type FileKind = "note" | "image" | "pdf" | "audio" | "video" | "file";

const KINDS: Record<string, FileKind> = {
  md: "note",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
  avif: "image",
  pdf: "pdf",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  flac: "audio",
  webm: "video",
  mp4: "video",
  mov: "video",
  ogv: "video",
};

export const kindOf = (path: string): FileKind => KINDS[extname(path).slice(1).toLowerCase()] || "file";

/** Folders and files the index skips: hidden ones (.obsidian, .trash, .git), the app's temp files. */
export const skipped = (rel: string) =>
  rel.split("/").some((part) => part.startsWith(".") || part === "node_modules") || /\.\d+\.tmp$/.test(rel);

export interface Entry {
  path: string;
  kind: FileKind;
  /** The name links use: a note's file name without ".md", any other file's whole file name. */
  name: string;
  size: number;
  mtime: number;
  text?: string;
  /** Where the body starts, after the properties. */
  bodyStart?: number;
  data?: Record<string, unknown>;
  tags: string[];
  aliases: string[];
  links: VaultLink[];
  headings: Heading[];
}

export interface Change {
  path: string;
  change: "added" | "changed" | "removed";
}

const lower = (s: string) => s.toLowerCase();
const dirOf = (rel: string) => posix.dirname(rel).replace(/^\.$/, "");
const noteKey = (target: string) => lower(target.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.md$/i, ""));

/** Keeps `rel` inside the vault: no "..", nothing hidden. */
export function cleanRel(rel: string): string | null {
  const parts = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== ".");
  if (parts.some((p) => p === ".." || p.startsWith("."))) return null;
  return parts.join("/");
}

export class Vault {
  readonly files = new Map<string, Entry>();
  readonly folders = new Set<string>();
  /** Lowercased path → path, and lowercased name → paths, for resolving links. */
  private byPath = new Map<string, string>();
  private byName = new Map<string, Set<string>>();
  private byAlias = new Map<string, Set<string>>();
  /** Each note's links, resolved (cleared on any change: a new or renamed file can change where they go). */
  private resolvedCache: Map<string, (string | null)[]> | null = null;

  constructor(
    readonly id: string,
    readonly root: string,
  ) {}

  /** The absolute path of `rel`, if it stays inside the vault (symbolic links included). */
  abs(rel: string): string | null {
    const clean = cleanRel(rel);
    if (clean === null) return null;
    const full = join(this.root, clean);
    try {
      const real = realpathSync(full);
      const root = realpathSync(this.root);
      if (real !== root && !real.startsWith(root + sep)) return null;
    } catch {
      // doesn't exist yet: its folder must be inside the vault
      try {
        const parent = realpathSync(join(this.root, dirOf(clean)));
        const root = realpathSync(this.root);
        if (parent !== root && !parent.startsWith(root + sep)) return null;
      } catch {}
    }
    return full;
  }

  /* ---------------- keeping up with the folder ---------------- */

  /** Re-reads what changed on disk under `under` (the whole vault by default). Returns the changes. */
  reconcile(under = ""): Change[] {
    const changes: Change[] = [];
    const seen = new Set<string>();
    const seenDirs = new Set<string>();
    const walk = (rel: string) => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = readdirSync(join(this.root, rel), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const child = rel ? `${rel}/${e.name}` : e.name;
        if (skipped(child)) continue;
        let dir = e.isDirectory();
        let file = e.isFile();
        if (e.isSymbolicLink()) {
          // followed only when they stay in the vault
          if (!this.abs(child)) continue;
          try {
            const s = statSync(join(this.root, child));
            dir = s.isDirectory();
            file = s.isFile();
          } catch {
            continue;
          }
        }
        if (dir) {
          seenDirs.add(child);
          walk(child);
        } else if (file) {
          seen.add(child);
          const change = this.refresh(child);
          if (change) changes.push(change);
        }
      }
    };
    const start = cleanRel(under) ?? "";
    let isDir = true;
    try {
      isDir = statSync(join(this.root, start)).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir) walk(start);
    else if (start) {
      const change = this.refresh(start);
      if (change) changes.push(change);
      if (this.files.has(start)) seen.add(start);
    }
    const inside = (p: string) => !start || p === start || p.startsWith(`${start}/`);
    for (const path of [...this.files.keys()])
      if (inside(path) && !seen.has(path)) {
        this.drop(path);
        changes.push({ path, change: "removed" });
      }
    for (const folder of [...this.folders]) if (inside(folder) && !seenDirs.has(folder)) this.folders.delete(folder);
    for (const folder of seenDirs) this.folders.add(folder);
    if (changes.length) this.resolvedCache = null;
    return changes;
  }

  /** Reads one file again if it changed (by size and time) since the index read it. */
  private refresh(rel: string): Change | null {
    let stat: import("node:fs").Stats;
    try {
      stat = statSync(join(this.root, rel));
    } catch {
      if (!this.files.has(rel)) return null;
      this.drop(rel);
      return { path: rel, change: "removed" };
    }
    if (!stat.isFile()) return null;
    const old = this.files.get(rel);
    if (old && old.mtime === stat.mtimeMs && old.size === stat.size) return null;
    this.load(rel, stat.size, stat.mtimeMs);
    return { path: rel, change: old ? "changed" : "added" };
  }

  /** Reads `rel` into the index now (after the app wrote it, so the watcher's echo changes nothing). */
  load(rel: string, size?: number, mtime?: number) {
    if (size === undefined || mtime === undefined) {
      const s = statSync(join(this.root, rel));
      size = s.size;
      mtime = s.mtimeMs;
    }
    this.drop(rel);
    const kind = kindOf(rel);
    const base = posix.basename(rel);
    const entry: Entry = {
      path: rel,
      kind,
      name: kind === "note" ? base.replace(/\.md$/i, "") : base,
      size,
      mtime,
      tags: [],
      aliases: [],
      links: [],
      headings: [],
    };
    if (kind === "note") {
      const text = readFileSync(join(this.root, rel), "utf8");
      const parsed = parseNote(text);
      Object.assign(entry, {
        text,
        bodyStart: text.length - parsed.body.length,
        data: parsed.data,
        tags: parsed.tags,
        aliases: parsed.aliases,
        links: parsed.links,
        headings: parsed.headings,
      });
    }
    this.files.set(rel, entry);
    this.byPath.set(lower(rel), rel);
    const add = (map: Map<string, Set<string>>, key: string) => {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(rel);
    };
    add(this.byName, lower(entry.name));
    for (const alias of entry.aliases) add(this.byAlias, lower(alias));
    for (let dir = dirOf(rel); dir; dir = dirOf(dir)) this.folders.add(dir);
    this.resolvedCache = null;
  }

  private drop(rel: string) {
    const old = this.files.get(rel);
    if (!old) return;
    this.files.delete(rel);
    this.byPath.delete(lower(rel));
    this.byName.get(lower(old.name))?.delete(rel);
    for (const alias of old.aliases) this.byAlias.get(lower(alias))?.delete(rel);
    this.resolvedCache = null;
  }

  /* ---------------- links ---------------- */

  /** Of several files a link could mean, Obsidian's pick: the one beside the linking note, else the
   * shortest path. */
  private pick(paths: Iterable<string>, from: string): string | null {
    const list = [...paths];
    if (list.length <= 1) return list[0] ?? null;
    const here = dirOf(from);
    return list.sort(
      (a, b) =>
        Number(dirOf(b) === here) - Number(dirOf(a) === here) ||
        a.split("/").length - b.split("/").length ||
        a.length - b.length ||
        a.localeCompare(b),
    )[0];
  }

  /** The path a link in `from` points at, or null if nothing in the vault has that name yet. */
  resolve(target: string, from = "", md = false): string | null {
    const t = target.replace(/\\/g, "/").trim();
    if (!t) return from || null; // [[#Heading]]: a place in the same note
    const relative = posix.normalize(posix.join(dirOf(from), t)).replace(/^\.\/?/, "");
    const exact = (path: string) => this.byPath.get(lower(path.replace(/^\/+/, ""))) ?? null;
    // a path: from the note's folder (Markdown links, "./" and "../"), then from the vault's top
    for (const path of md || t.startsWith(".") ? [relative, t] : [t, relative]) {
      const hit = exact(path) || (/\.md$/i.test(path) ? null : exact(`${path}.md`));
      if (hit) return hit;
    }
    if (md) return null;
    // a name: notes first ([[Note.v2]] is a note), then other files ([[picture.png]])
    const key = noteKey(t);
    const name = key.split("/").pop()!;
    const matches = (paths: Set<string> | undefined, suffix: string) =>
      [...(paths || [])].filter((p) => !key.includes("/") || lower(p).endsWith(suffix));
    const notes = matches(this.byName.get(name), `/${key}.md`).filter((p) => this.files.get(p)?.kind === "note");
    if (notes.length) return this.pick(notes, from);
    const files = matches(this.byName.get(lower(t.split("/").pop()!)), `/${lower(t)}`).filter(
      (p) => this.files.get(p)?.kind !== "note",
    );
    if (files.length) return this.pick(files, from);
    const aliased = [...(this.byAlias.get(lower(t)) || [])];
    return aliased.length ? this.pick(aliased, from) : null;
  }

  /** Every note's links, resolved (cached until something changes). */
  private resolved(): Map<string, (string | null)[]> {
    if (this.resolvedCache) return this.resolvedCache;
    const out = new Map<string, (string | null)[]>();
    for (const e of this.files.values())
      if (e.kind === "note")
        out.set(
          e.path,
          e.links.map((l) => this.resolve(l.target, e.path, l.md)),
        );
    this.resolvedCache = out;
    return out;
  }

  /** The link target that reaches `to` from `from`, as Obsidian writes it: the name alone when it is
   * unique, else the path. Markdown links get a path relative to the note. */
  linkTo(to: string, from: string, md = false): string {
    const entry = this.files.get(to);
    if (md) return posix.relative(dirOf(from) || ".", to).replace(/ /g, "%20");
    const name = entry?.name ?? posix.basename(to).replace(/\.md$/i, "");
    const short = to.endsWith(".md") ? name : posix.basename(to);
    const shortest = this.resolve(short, from) === to && (this.byName.get(lower(name))?.size ?? 0) <= 1;
    return shortest ? short : to.replace(/\.md$/i, "");
  }

  /** What links to `path`, with the line around each link. */
  backlinks(path: string) {
    const out: { path: string; title: string; line: number; context: string; embed: boolean }[] = [];
    for (const [from, targets] of this.resolved()) {
      if (from === path) continue;
      const entry = this.files.get(from)!;
      targets.forEach((to, i) => {
        if (to !== path) return;
        const link = entry.links[i];
        out.push({
          path: from,
          title: entry.name,
          line: link.line,
          context: link.line > 0 ? lineText(entry.text!, link.line) : "(in its properties)",
          embed: link.embed,
        });
      });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title) || a.line - b.line);
  }

  /** `path`'s own links: where each goes (null: to a note not written yet). */
  outgoing(path: string) {
    const entry = this.files.get(path);
    const targets = this.resolved().get(path) || [];
    return (entry?.links || []).map((l, i) => ({
      target: l.target,
      sub: l.sub,
      embed: l.embed,
      md: l.md,
      path: targets[i] ?? null,
      kind: targets[i] ? this.files.get(targets[i]!)!.kind : null,
    }));
  }

  /** Notes that name `path`'s note (or an alias) in plain text, without linking it. */
  mentions(path: string, limit = 30) {
    const entry = this.files.get(path);
    if (entry?.kind !== "note") return [];
    const names = [entry.name, ...entry.aliases].filter((n) => n.length >= 3);
    if (!names.length) return [];
    const quote = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const find = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(quote).join("|")})(?![\\p{L}\\p{N}])`, "giu");
    const out: { path: string; title: string; line: number; context: string }[] = [];
    for (const other of this.files.values()) {
      if (other.kind !== "note" || other.path === path || !other.text) continue;
      const links = other.links.filter((l) => l.start >= 0);
      for (const m of other.text.matchAll(find)) {
        const at = m.index!;
        if (links.some((l) => at >= l.start && at < l.end)) continue;
        if (at < (other.bodyStart ?? 0)) continue;
        const line = other.text.slice(0, at).split("\n").length;
        out.push({ path: other.path, title: other.name, line, context: lineText(other.text, line) });
        break;
      }
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Every tag, with how many notes have it (nested tags count for their parents too, as in Obsidian). */
  tags() {
    const counts = new Map<string, number>();
    for (const e of this.files.values()) {
      const all = new Set<string>();
      for (const tag of e.tags) {
        const parts = tag.split("/");
        for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join("/"));
      }
      for (const t of all) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag));
  }

  /** Notes that match `query`: by name first, then by text; "#tag" finds a tag (and the tags inside it). */
  search(query: string, limit = 50) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { path: string; title: string; kind: FileKind; snippet: string; score: number }[] = [];
    if (q.startsWith("#") || q.startsWith("tag:")) {
      const tag = q.replace(/^(tag:)?#?/, "");
      for (const e of this.files.values())
        if (e.tags.some((t) => lower(t) === tag || lower(t).startsWith(`${tag}/`)))
          out.push({
            path: e.path,
            title: e.name,
            kind: e.kind,
            snippet: e.tags.map((t) => `#${t}`).join(" "),
            score: 1,
          });
      return out.sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
    }
    const words = q.split(/\s+/).filter(Boolean);
    for (const e of this.files.values()) {
      const name = lower(e.name);
      const text = e.text ? lower(e.text) : "";
      if (!words.every((w) => name.includes(w) || text.includes(w) || lower(e.path).includes(w))) continue;
      let score = words.reduce((s, w) => s + (name.includes(w) ? 10 : 0) + (text.includes(w) ? 1 : 0), 0);
      if (name === q) score += 50;
      let snippet = "";
      const at = text.indexOf(words[0]);
      if (at >= 0 && e.text) {
        const a = Math.max(0, at - 60);
        snippet = `${a ? "…" : ""}${e.text
          .slice(a, at + 100)
          .replace(/\s+/g, " ")
          .trim()}…`;
      }
      out.push({ path: e.path, title: e.name, kind: e.kind, snippet, score });
    }
    return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }

  /** Notes (and the attachments they embed, if asked) as a graph, joined by their links. */
  graph(withFiles = false) {
    const nodes = new Map<string, { id: string; label: string; kind: FileKind; links: number; mtime: number }>();
    const edges = new Set<string>();
    const node = (path: string) => {
      const e = this.files.get(path)!;
      if (!nodes.has(path)) nodes.set(path, { id: path, label: e.name, kind: e.kind, links: 0, mtime: e.mtime });
      return nodes.get(path)!;
    };
    for (const e of this.files.values()) if (e.kind === "note") node(e.path);
    for (const [from, targets] of this.resolved())
      for (const to of targets) {
        if (!to || to === from) continue;
        if (this.files.get(to)!.kind !== "note" && !withFiles) continue;
        const key = from < to ? `${from}\n${to}` : `${to}\n${from}`;
        if (edges.has(key)) continue;
        edges.add(key);
        node(from).links++;
        node(to).links++;
      }
    return {
      nodes: [...nodes.values()],
      edges: [...edges].map((k) => {
        const [from, to] = k.split("\n");
        return { from, to };
      }),
    };
  }

  /** A note's text for an embed: the part the "#…" names. */
  section(path: string, sub?: string): string {
    const e = this.files.get(path);
    if (!e?.text) return "";
    return sectionOf(e.text.slice(e.bodyStart ?? 0), sub);
  }

  counts() {
    let notes = 0;
    for (const e of this.files.values()) if (e.kind === "note") notes++;
    return { notes, files: this.files.size - notes, folders: this.folders.size };
  }
}

const lineText = (text: string, line: number) =>
  (text.split("\n")[line - 1] || "")
    .trim()
    .replace(/^[-*+>#\s]+/, "")
    .slice(0, 240);
