/* The vault: the second brain as plain files.
 *
 *   vault/
 *     AGENTS.md            how the vault is laid out (for AI agents and people)
 *     profile.md           the learner: goals, background, how they like to learn
 *     notes/*.md           notes, highlights, explanations, connections, answers
 *     concepts/*.md        one page per concept, linked to its sources
 *     cards/*.md           flashcards (## Front / ## Back)
 *     figures/*.json       saved figures (scene specs)
 *     sources/*.md         one page per book: its chapters and what came from it
 *     library/<book>/*.md  each book's text by chapter (derived; not versioned)
 *     log/reviews.jsonl    every flashcard review (the FSRS state is replayed from it)
 *     log/activity.jsonl   the learning journey
 *
 * Markdown with YAML frontmatter is what agents read best and what people can open in any editor
 * (it is a valid Obsidian vault). The server keeps an index in memory, writes through, notices
 * edits made outside the app, and commits the vault to git a few seconds after changes. */
import { execFile, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { DATA_DIR } from "../config.ts";
import type { Activity, Card, Concept, Note, Profile, ReviewLog, SavedFigure } from "../../shared/vault-types.ts";

export const VAULT = join(DATA_DIR, "vault");
const DIRS = ["notes", "concepts", "cards", "figures", "sources", "library", "log"];

/* ---------------- files ---------------- */

export function slugify(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/, "") || "untitled"
  );
}
export const shortId = (prefix: string) => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 8)}`;

function atomicWrite(path: string, content: string) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  try {
    return { data: (parseYaml(m[1]) as Record<string, unknown>) || {}, body: m[2] };
  } catch {
    return { data: {}, body: text };
  }
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== null));
  return `---\n${stringifyYaml(clean, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);
const asString = (v: unknown, d = "") => (v === undefined || v === null ? d : String(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : asString(v, new Date().toISOString()));

/* ---------------- serializers ---------------- */

function noteFromFile(id: string, text: string): Note {
  const { data, body } = parseFrontmatter(text);
  return {
    id: asString(data.id, id),
    type: (asString(data.type, "note") as Note["type"]) || "note",
    title: asString(data.title, id),
    body: body.trim(),
    tags: asArray(data.tags),
    concepts: asArray(data.concepts),
    source: (data.source as Note["source"]) || undefined,
    score: typeof data.score === "number" ? data.score : undefined,
    created: iso(data.created),
    updated: iso(data.updated || data.created),
  };
}
const noteToFile = (n: Note) => stringifyFrontmatter({ id: n.id, type: n.type, title: n.title, tags: n.tags, concepts: n.concepts, source: n.source, score: n.score, created: n.created, updated: n.updated }, n.body);

function conceptFromFile(id: string, text: string): Concept {
  const { data, body } = parseFrontmatter(text);
  return {
    id: asString(data.id, id),
    name: asString(data.name, id),
    aliases: asArray(data.aliases),
    summary: asString(data.summary),
    body: body.trim(),
    related: asArray(data.related),
    sources: Array.isArray(data.sources) ? (data.sources as Concept["sources"]) : [],
    created: iso(data.created),
    updated: iso(data.updated || data.created),
  };
}
const conceptToFile = (c: Concept) => stringifyFrontmatter({ id: c.id, name: c.name, aliases: c.aliases, summary: c.summary, related: c.related, sources: c.sources, created: c.created, updated: c.updated }, c.body);

function cardFromFile(id: string, text: string): Card {
  const { data, body } = parseFrontmatter(text);
  const front = /##\s*Front\s*\n([\s\S]*?)(?=\n##\s*Back\b|$)/i.exec(body)?.[1]?.trim() || body.trim();
  const back = /##\s*Back\s*\n([\s\S]*)$/i.exec(body)?.[1]?.trim() || "";
  return {
    id: asString(data.id, id),
    front,
    back,
    kind: data.kind === "cloze" ? "cloze" : "basic",
    deck: asString(data.deck, "general"),
    concepts: asArray(data.concepts),
    tags: asArray(data.tags),
    source: (data.source as Card["source"]) || undefined,
    figure: data.figure ? asString(data.figure) : undefined,
    suspended: data.suspended === true,
    created: iso(data.created),
    updated: iso(data.updated || data.created),
  };
}
const cardToFile = (c: Card) => stringifyFrontmatter({ id: c.id, kind: c.kind, deck: c.deck, concepts: c.concepts, tags: c.tags, source: c.source, figure: c.figure, suspended: c.suspended || undefined, created: c.created, updated: c.updated }, `## Front\n\n${c.front}\n\n## Back\n\n${c.back}`);

/* ---------------- collections ---------------- */

class Collection<T extends { id: string }> {
  readonly items = new Map<string, T>();
  private files = new Map<string, string>();
  constructor(
    readonly dir: string,
    readonly ext: string,
    private read: (id: string, text: string) => T,
    private write: (item: T) => string,
  ) {}

  load() {
    this.items.clear();
    this.files.clear();
    const dir = join(VAULT, this.dir);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(this.ext)) continue;
      this.loadFile(file);
    }
  }

  loadFile(file: string) {
    const path = join(VAULT, this.dir, file);
    const base = file.slice(0, -this.ext.length);
    // forget whatever this file held before
    for (const [id, f] of this.files) if (f === file) {
      this.items.delete(id);
      this.files.delete(id);
    }
    if (!existsSync(path)) return;
    try {
      const item = this.read(base, readFileSync(path, "utf8"));
      this.items.set(item.id, item);
      this.files.set(item.id, file);
    } catch (error) {
      console.warn(`[vault] could not read ${this.dir}/${file}: ${(error as Error).message}`);
    }
  }

  list(): T[] {
    return [...this.items.values()];
  }
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  /** Writes an item; new items get a file named after `fileBase`. */
  save(item: T, fileBase = item.id): T {
    let file = this.files.get(item.id);
    if (!file) {
      let base = slugify(fileBase, 70);
      let n = 1;
      while (existsSync(join(VAULT, this.dir, `${base}${this.ext}`))) base = `${slugify(fileBase, 66)}-${++n}`;
      file = `${base}${this.ext}`;
    }
    selfWrites.add(`${this.dir}/${file}`);
    atomicWrite(join(VAULT, this.dir, file), this.write(item));
    this.items.set(item.id, item);
    this.files.set(item.id, file);
    return item;
  }

  remove(id: string): boolean {
    const file = this.files.get(id);
    if (!file) return false;
    selfWrites.add(`${this.dir}/${file}`);
    rmSync(join(VAULT, this.dir, file), { force: true });
    this.items.delete(id);
    this.files.delete(id);
    return true;
  }

  fileOf(id: string) {
    const file = this.files.get(id);
    return file ? `${this.dir}/${file}` : null;
  }
}

export const notes = new Collection<Note>("notes", ".md", noteFromFile, noteToFile);
export const concepts = new Collection<Concept>("concepts", ".md", conceptFromFile, conceptToFile);
export const cards = new Collection<Card>("cards", ".md", cardFromFile, cardToFile);
export const figures = new Collection<SavedFigure>(
  "figures",
  ".json",
  (id, text) => ({ id, ...JSON.parse(text) }),
  (f) => JSON.stringify(f, null, 1),
);

/* ---------------- logs ---------------- */

let reviewCache: ReviewLog[] | null = null;
let activityCache: Activity[] | null = null;

function readLog<T>(name: string): T[] {
  const path = join(VAULT, "log", name);
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {}
  }
  return out;
}
export function reviews(): ReviewLog[] {
  return (reviewCache ||= readLog<ReviewLog>("reviews.jsonl"));
}
export function activity(): Activity[] {
  return (activityCache ||= readLog<Activity>("activity.jsonl"));
}
export function logReview(entry: ReviewLog) {
  const log = reviews(); // load first: loading after the append would read the new line and then add it twice
  selfWrites.add("log/reviews.jsonl");
  appendFileSync(join(VAULT, "log", "reviews.jsonl"), `${JSON.stringify(entry)}\n`);
  log.push(entry);
  changed(`review ${entry.card}`);
}
export function logActivity(entry: Omit<Activity, "ts"> & { ts?: number }) {
  const full: Activity = { ts: Date.now(), ...entry };
  const log = activity();
  selfWrites.add("log/activity.jsonl");
  appendFileSync(join(VAULT, "log", "activity.jsonl"), `${JSON.stringify(full)}\n`);
  log.push(full);
  changed("activity");
  return full;
}

/* ---------------- profile ---------------- */

export const DEFAULT_PROFILE: Profile = {
  name: "",
  role: "curious",
  goals: "",
  background: "",
  level: "intermediate",
  styles: { visual: 0.6, reader: 0.5, doer: 0.6 },
  interests: [],
  dailyNew: 20,
  retention: 0.9,
  notes: "",
  onboarded: false,
};

export function getProfile(): Profile {
  const path = join(VAULT, "profile.md");
  if (!existsSync(path)) return { ...DEFAULT_PROFILE };
  const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
  const styles = (data.styles || {}) as Partial<Profile["styles"]>;
  return {
    ...DEFAULT_PROFILE,
    ...(data as Partial<Profile>),
    styles: { ...DEFAULT_PROFILE.styles, ...styles },
    interests: asArray(data.interests),
    notes: body.trim(),
  };
}

export function saveProfile(patch: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...patch };
  next.styles = { ...getProfile().styles, ...(patch.styles || {}) };
  next.retention = Math.min(0.97, Math.max(0.7, Number(next.retention) || 0.9));
  next.dailyNew = Math.max(0, Math.min(200, Math.round(Number(next.dailyNew) || 20)));
  const { notes: body, ...data } = next;
  selfWrites.add("profile.md");
  atomicWrite(join(VAULT, "profile.md"), stringifyFrontmatter(data as unknown as Record<string, unknown>, body || "_Anything about how you learn best: write it here, and the tutor will read it._"));
  changed("profile");
  return next;
}

/* ---------------- git ---------------- */

const hasGit = spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
let pending: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let committing = false;

/** Something in the vault changed: commit it a few seconds from now, with everything else that changes meanwhile. */
export function changed(what: string) {
  pending.push(what);
  if (!hasGit) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(commit, 4000);
}

function commit() {
  timer = null;
  if (committing || !pending.length) return;
  committing = true;
  let items = pending.splice(0).filter(Boolean);
  // the activity log changes with almost everything; name it only when nothing else changed
  if (items.some((i) => i !== "activity")) items = items.filter((i) => i !== "activity");
  const counts = new Map<string, number>();
  for (const item of items) {
    const kind = item.split(" ")[0];
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const subject = items.length === 1 ? items[0] : [...counts].map(([k, n]) => (n > 1 ? `${n}× ${k}` : k)).join(", ") || "update";
  execFile("git", ["add", "-A"], { cwd: VAULT }, (error) => {
    if (error) {
      committing = false;
      return;
    }
    execFile("git", ["-c", "user.name=Feynman's Classroom", "-c", "user.email=classroom@localhost", "commit", "-q", "-m", subject.slice(0, 120)], { cwd: VAULT }, () => {
      committing = false;
      if (pending.length) changed("");
    });
  });
}

export function vaultHistory(limit = 30): { hash: string; when: string; subject: string }[] {
  if (!hasGit || !existsSync(join(VAULT, ".git"))) return [];
  const run = spawnSync("git", ["log", `-${limit}`, "--pretty=format:%h%x09%cI%x09%s"], { cwd: VAULT, encoding: "utf8" });
  return (run.stdout || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, when, subject] = line.split("\t");
      return { hash, when, subject };
    });
}

/* ---------------- outside edits ---------------- */

/** Files the server itself just wrote; the watcher skips them. */
const selfWrites = new Set<string>();
const listeners = new Set<(what: string) => void>();
export function onVaultChange(fn: (what: string) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function startWatching() {
  try {
    const debounce = new Map<string, ReturnType<typeof setTimeout>>();
    watch(VAULT, { recursive: true }, (_event, file) => {
      if (!file) return;
      const rel = String(file).replace(/\\/g, "/");
      if (rel.startsWith(".git") || rel.endsWith(".tmp")) return;
      clearTimeout(debounce.get(rel));
      debounce.set(
        rel,
        setTimeout(() => {
          debounce.delete(rel);
          if (selfWrites.delete(rel)) return;
          const [dir, name] = rel.split("/");
          const collection = { notes, concepts, cards, figures }[dir as "notes"];
          if (collection && name) collection.loadFile(name);
          else if (rel === "log/reviews.jsonl") reviewCache = null;
          else if (rel === "log/activity.jsonl") activityCache = null;
          else return;
          changed(`edit ${rel}`);
          for (const fn of listeners) fn(rel);
        }, 300),
      );
    });
  } catch (error) {
    console.warn("[vault] not watching for outside edits:", (error as Error).message);
  }
}

/* ---------------- setup ---------------- */

const AGENTS_MD = `# This is a Feynman's Classroom vault

A learner's second brain, kept as plain files so people and AI agents can read and edit it.

| path | what |
|---|---|
| \`profile.md\` | who the learner is: goals, background, level, how they like to learn (frontmatter) and their own notes |
| \`notes/*.md\` | notes. Frontmatter: \`id\`, \`type\` (note, highlight, explanation, connection, answer, summary), \`title\`, \`tags\`, \`concepts\` (concept ids), \`source\` (\`bookId\`, \`chapterId\`, \`page\`/\`block\`, \`quote\`) |
| \`concepts/*.md\` | one page per concept: \`name\`, \`aliases\`, \`summary\`, \`related\` concept ids, \`sources\`; the body explains it |
| \`cards/*.md\` | flashcards: frontmatter (\`deck\`, \`concepts\`, \`source\`) and a body with \`## Front\` and \`## Back\` |
| \`figures/*.json\` | saved interactive figures (scene specs) |
| \`sources/*.md\` | one page per book: title, author, chapters |
| \`library/<book>/*.md\` | the text of each book, one file per chapter, with \`[[page N]]\` or \`[[block N]]\` markers |
| \`log/reviews.jsonl\` | every flashcard review: \`{card, ts, rating 1–4}\` (spaced repetition is replayed from it) |
| \`log/activity.jsonl\` | the learning journey: \`{ts, type, text, bookId?, concepts?}\` |

Links: \`[[concept-id]]\` or \`[[note title]]\` inside Markdown; \`![[figure:id]]\` embeds a figure.
When you answer a question from this vault, cite the files you used by path, and book passages by
book and page or block.
`;

let ready = false;
export function initVault() {
  if (ready) return;
  ready = true;
  for (const dir of DIRS) mkdirSync(join(VAULT, dir), { recursive: true });
  writeFileSync(join(VAULT, "AGENTS.md"), AGENTS_MD);
  if (!existsSync(join(VAULT, ".gitignore"))) writeFileSync(join(VAULT, ".gitignore"), "library/\n*.tmp\n.DS_Store\n");
  if (hasGit && !existsSync(join(VAULT, ".git"))) {
    spawnSync("git", ["init", "-q"], { cwd: VAULT });
    changed("vault created");
  }
  for (const c of [notes, concepts, cards, figures]) c.load();
  startWatching();
}

export function vaultStats() {
  return { notes: notes.items.size, concepts: concepts.items.size, cards: cards.items.size, figures: figures.items.size, reviews: reviews().length, git: hasGit && existsSync(join(VAULT, ".git")), path: VAULT };
}

export function now() {
  return new Date().toISOString();
}
