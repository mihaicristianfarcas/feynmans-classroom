/* How a document is kept as a file, and read back. Every document is Markdown with YAML frontmatter in
 * one shape: the fields every kind has (id, kind, type, tags, aliases, about, related, concepts, source,
 * created, updated), then a few of its own, then whatever else the file had (kept as it was). What
 * differs by kind is small and lives in KINDS below: where a new one goes, where its title comes from,
 * its own fields, and what its body holds (a card's sides, a session's turns, a figure's spec).
 *
 * Readers are forgiving (files are written by hand, in Obsidian and by agents): a file without a kind
 * takes its folder's, a kind the app doesn't know is read as the folder's kind with that as its type,
 * and missing fields get defaults. */
import { basename } from "node:path";
import { fileNameOf } from "../../shared/links.ts";
import {
  type Anchor,
  type Annotation,
  type Card,
  type Concept,
  DOC_KINDS,
  type Doc,
  type DocBase,
  type DocKind,
  type Note,
  type SavedFigure,
  type SourceRef,
  type TutorSession,
} from "../../shared/vault-types.ts";
import { bookFolder } from "../books/store.ts";
import { asArray, asString, iso, num, parseFrontmatter, pathId, slugify, stringifyFrontmatter } from "./files.ts";

/* ---------------- the place in a book ---------------- */

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** A source as the frontmatter keeps it: `book` and `chapter` for the ids, the anchor's own fields. */
export function sourceToYaml(s: SourceRef | undefined): Record<string, unknown> | undefined {
  if (!s?.bookId) return undefined;
  return {
    book: s.bookId,
    chapter: s.chapterId,
    page: s.page,
    block: s.block,
    blockEnd: s.blockEnd,
    y: s.y !== undefined ? r4(s.y) : undefined,
    quote: s.quote,
    prefix: s.prefix,
    suffix: s.suffix,
    start: s.start,
    end: s.end,
    rects: s.rects?.map((r) =>
      r.p !== undefined && r.p !== s.page
        ? [r4(r.x), r4(r.y), r4(r.w), r4(r.h), r.p]
        : [r4(r.x), r4(r.y), r4(r.w), r4(r.h)],
    ),
    md: s.md,
  };
}

export function sourceFromYaml(v: unknown): SourceRef | undefined {
  if (!v || typeof v !== "object") return undefined;
  const s = v as Record<string, unknown>;
  const bookId = asString(s.book ?? s.bookId);
  if (!bookId) return undefined;
  const rects = Array.isArray(s.rects)
    ? (s.rects as unknown[])
        .map((r) =>
          Array.isArray(r) && r.length >= 4
            ? {
                x: Number(r[0]),
                y: Number(r[1]),
                w: Number(r[2]),
                h: Number(r[3]),
                ...(r[4] !== undefined ? { p: Number(r[4]) } : {}),
              }
            : null,
        )
        .filter((r): r is NonNullable<typeof r> => !!r && [r.x, r.y, r.w, r.h].every(Number.isFinite))
    : undefined;
  const md = s.md as Anchor["md"] | undefined;
  const out: SourceRef = {
    bookId,
    chapterId: (s.chapter ?? s.chapterId) ? asString(s.chapter ?? s.chapterId) : undefined,
    page: num(s.page),
    block: num(s.block),
    blockEnd: num(s.blockEnd),
    y: num(s.y),
    quote: s.quote ? asString(s.quote) : undefined,
    prefix: s.prefix ? asString(s.prefix) : undefined,
    suffix: s.suffix ? asString(s.suffix) : undefined,
    start: num(s.start),
    end: num(s.end),
    rects: rects?.length ? rects : undefined,
    md:
      md && typeof md === "object" && md.file
        ? { file: String(md.file), line: Number(md.line) || 1, score: num(md.score) }
        : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined)) as SourceRef;
}

/** "p. 12" or "block 40": where a source is, in a few characters. */
export const whereOf = (s?: Partial<Anchor>) =>
  s?.page !== undefined ? `p. ${s.page}` : s?.block !== undefined ? `block ${s.block}` : "";

/** The passage as a callout at the top of a file (for whoever opens it), and the body without it. */
const QUOTE_CALLOUT = /^\s*> \[!quote\][^\n]*\n(?:>[^\n]*(?:\n|$))*/;
const quoteCallout = (s?: Partial<Anchor>) =>
  s?.quote
    ? `> [!quote] ${whereOf(s)}\n${s.quote
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}\n\n`
    : "";

/** The first words of a text, for a title. */
const firstWords = (text: string, n: number) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length > n ? `${words.slice(0, n).join(" ")}…` : words.join(" ");
};
/** A line of Markdown as plain text, for a title. */
const plainLine = (text: string) =>
  (text.split("\n").find((l) => l.trim()) || "")
    .replace(/[#>*_`[\]{}$]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

/* ---------------- the kinds ---------------- */

interface KindSpec<D extends Doc> {
  /** The folder a file without a `kind` in its frontmatter takes its kind from. */
  folder: RegExp;
  /** Where its title comes from: the file name (as in Obsidian), or the frontmatter (else made from the content). */
  titleIsFileName: boolean;
  /** Its subtypes (the `type` field), the first one the default. */
  types?: readonly string[];
  /** Its own frontmatter fields. */
  keys: string[];
  /** Fills in its own fields from the frontmatter and body (`doc` has the common ones). */
  read: (doc: DocBase, data: Record<string, unknown>, body: string) => D;
  /** Its own frontmatter fields, and the body as the file keeps it. */
  write: (doc: D) => { data: Record<string, unknown>; body: string };
  /** A title for one whose frontmatter has none. */
  title?: (doc: D) => string;
  /** Where a new one goes: a vault-relative path without the extension (made unique on save). */
  place: (doc: D) => string;
}

const folderOfBook = (bookId?: string) => (bookId && bookFolder(bookId)) || "unsorted";

const NOTE: KindSpec<Note> = {
  folder: /^notes\//,
  titleIsFileName: true,
  types: ["note", "explanation", "connection", "answer", "summary", "quiz", "exercises", "session"],
  keys: ["score"],
  read: (doc, data) => ({ ...doc, kind: "note", type: (doc as Note).type, score: num(data.score) }),
  write: (n) => ({ data: { score: n.score }, body: n.body }),
  place: (n) => `notes/${fileNameOf(n.title)}`,
};

const CONCEPT: KindSpec<Concept> = {
  folder: /^concepts\//,
  titleIsFileName: true,
  keys: ["summary", "builds-on", "sources"],
  read: (doc, data) => ({
    ...doc,
    kind: "concept",
    summary: asString(data.summary),
    buildsOn: asArray(data["builds-on"]),
    sources: Array.isArray(data.sources)
      ? (data.sources as unknown[]).map(sourceFromYaml).filter((s): s is SourceRef => !!s)
      : [],
  }),
  write: (c) => ({
    data: { summary: c.summary, "builds-on": c.buildsOn, sources: c.sources.map(sourceToYaml) },
    body: c.body,
  }),
  place: (c) => `concepts/${fileNameOf(c.title)}`,
};

const SIDES = /##\s*Front\s*\n([\s\S]*?)(?=\n##\s*Back\b|$)/i;
const CARD: KindSpec<Card> = {
  folder: /^cards\//,
  titleIsFileName: false,
  types: ["basic", "cloze"],
  keys: ["deck", "figure", "suspended"],
  read: (doc, data, body) => {
    const front = SIDES.exec(body)?.[1]?.trim() || body.trim();
    const back = /##\s*Back\s*\n([\s\S]*)$/i.exec(body)?.[1]?.trim() || "";
    return {
      ...doc,
      kind: "card",
      type: (doc as Card).type,
      front,
      back,
      deck: asString(data.deck, "general"),
      figure: data.figure ? asString(data.figure) : undefined,
      suspended: data.suspended === true,
    };
  },
  write: (c) => ({
    data: { deck: c.deck, figure: c.figure, suspended: c.suspended || undefined },
    body: `## Front\n\n${c.front.trim()}\n\n## Back\n\n${c.back.trim()}`,
  }),
  title: (c) => plainLine(c.front) || "Card",
  place: (c) => `cards/${slugify(`${c.deck}-${c.front.slice(0, 40)}`, 70)}`,
};

const ANNOTATION: KindSpec<Annotation> = {
  folder: /^library\/[^/]+\/annotations\//,
  titleIsFileName: false,
  types: ["highlight", "explain", "define", "ask", "visualize", "resources", "comment"],
  keys: ["color", "request", "status", "error", "model"],
  read: (doc, data, body) => ({
    ...doc,
    kind: "annotation",
    type: (doc as Annotation).type,
    source: { ...(doc.source || { bookId: "" }), quote: doc.source?.quote || "" },
    color: data.color ? asString(data.color) : undefined,
    request: data.request ? asString(data.request) : undefined,
    status: (["pending", "ready", "failed"].includes(asString(data.status))
      ? data.status
      : "ready") as Annotation["status"],
    error: data.error ? asString(data.error) : undefined,
    model: (data.model as Annotation["model"]) || undefined,
    body: body.replace(QUOTE_CALLOUT, "").trim(),
  }),
  write: (a) => ({
    data: {
      color: a.color,
      request: a.request,
      status: a.status === "ready" ? undefined : a.status,
      error: a.error,
      model: a.model,
    },
    body: `${quoteCallout(a.source)}${a.body}`,
  }),
  title: (a) => `${a.type}: ${firstWords(a.source.quote, 8)}`,
  place: (a) => {
    const where =
      a.source.page !== undefined ? `p${a.source.page}` : a.source.block !== undefined ? `b${a.source.block}` : "x";
    const words = slugify(a.source.quote.split(/\s+/).slice(0, 5).join(" "), 40);
    return `library/${folderOfBook(a.source.bookId)}/annotations/${where}-${a.type}-${words}-${a.id.slice(-4)}`;
  },
};

/** A turn begins with a line "## You" or "## Tutor"; everything until the next one is its text. */
const TURN = /^## (You|Tutor)[ \t]*$/m;
const SESSION: KindSpec<TutorSession> = {
  folder: /^library\/[^/]+\/sessions\//,
  titleIsFileName: false,
  keys: ["mode"],
  read: (doc, data, body) => {
    const parts = body.replace(QUOTE_CALLOUT, "").split(TURN);
    const messages: TutorSession["messages"] = [];
    for (let i = 1; i < parts.length; i += 2)
      messages.push({ role: parts[i] === "You" ? "user" : "tutor", text: (parts[i + 1] || "").trim() });
    return {
      ...doc,
      kind: "session",
      source: doc.source || { bookId: "" },
      mode: data.mode === "socratic" ? "socratic" : "answer",
      messages,
    };
  },
  write: (x) => ({
    data: { mode: x.mode },
    body: `${quoteCallout(x.source)}${x.messages
      .map((m) => `## ${m.role === "user" ? "You" : "Tutor"}\n\n${m.text.trim()}`)
      .join("\n\n")}`,
  }),
  title: (x) => plainLine(x.messages.find((m) => m.role === "user")?.text || "") || "A session",
  place: (x) =>
    `library/${folderOfBook(x.source.bookId)}/sessions/${x.created.slice(0, 10)} ${fileNameOf(x.title).slice(0, 60).trim() || "session"}`,
};

/** A ```figure block: the spec of a figure, as JSON. */
const FIGURE_BLOCK = /```figure\s*\n([\s\S]*?)\n```/;
const FIGURE: KindSpec<SavedFigure> = {
  folder: /^figures\//,
  titleIsFileName: false,
  keys: ["request"],
  read: (doc, data, body) => {
    let scene: unknown = null;
    try {
      scene = JSON.parse(FIGURE_BLOCK.exec(body)?.[1] || "null");
    } catch {}
    return { ...doc, kind: "figure", scene, request: data.request ? asString(data.request) : undefined };
  },
  write: (f) => {
    const rest = f.body.replace(FIGURE_BLOCK, "").trim();
    return {
      data: { request: f.request },
      body: `\`\`\`figure\n${JSON.stringify(f.scene, null, 1)}\n\`\`\`${rest ? `\n\n${rest}` : ""}`,
    };
  },
  title: (f) => asString((f.scene as { title?: string } | null)?.title) || "Figure",
  place: (f) => `figures/${slugify(f.title, 70)}`,
};

// biome-ignore lint/suspicious/noExplicitAny: each spec is typed by its own kind
export const KINDS: Record<DocKind, KindSpec<any>> = {
  note: NOTE,
  concept: CONCEPT,
  card: CARD,
  annotation: ANNOTATION,
  session: SESSION,
  figure: FIGURE,
};

/** Where new documents of a kind go. */
export const placeOf = (doc: Doc) => KINDS[doc.kind].place(doc);
/** Whether a kind's title is its file name (renaming the one renames the other). */
export const titleIsFileName = (kind: DocKind) => KINDS[kind].titleIsFileName;

/** The kind a file in this folder has when its frontmatter doesn't say. */
export function kindOfPath(rel: string): DocKind | null {
  for (const kind of DOC_KINDS) if (KINDS[kind].folder.test(rel)) return kind;
  return null;
}

/* ---------------- files ---------------- */

const COMMON = [
  "id",
  "kind",
  "type",
  "title",
  "tags",
  "aliases",
  "about",
  "related",
  "concepts",
  "source",
  "created",
  "updated",
];

/** Reads a document from its file. */
export function docFromFile(rel: string, text: string, mtime: string): Doc {
  const { data, body } = parseFrontmatter(text);
  const said = asString(data.kind);
  const kind: DocKind = (DOC_KINDS as string[]).includes(said) ? (said as DocKind) : kindOfPath(rel) || "note";
  const spec = KINDS[kind];
  // a kind the app doesn't know names the folder kind's type ("kind: explain" in annotations/)
  const typed = asString(data.type) || (said && !(DOC_KINDS as string[]).includes(said) ? said : "");
  const base = {
    id: asString(data.id) || pathId(rel),
    kind,
    path: rel,
    title: spec.titleIsFileName ? basename(rel, ".md") : asString(data.title),
    body: body.replace(/^\s*\n/, "").trimEnd(),
    tags: asArray(data.tags),
    aliases: asArray(data.aliases),
    about: asArray(data.about),
    related: asArray(data.related),
    concepts: asArray(data.concepts),
    source: sourceFromYaml(data.source),
    created: iso(data.created, mtime),
    updated: iso(data.updated || data.created, mtime),
    ...(spec.types ? { type: spec.types.includes(typed) ? typed : spec.types[0] } : {}),
  } as DocBase;
  const doc = spec.read(base, data, base.body);
  if (!doc.title) doc.title = spec.title?.(doc) || basename(rel, ".md");
  const known = [...COMMON, ...spec.keys];
  const extra = Object.fromEntries(Object.entries(data).filter(([k]) => !known.includes(k)));
  if (Object.keys(extra).length) doc.props = extra;
  return doc;
}

/** Writes a document as its file. */
export function docToFile(doc: Doc): string {
  const spec = KINDS[doc.kind];
  const own = spec.write(doc);
  const type = (doc as { type?: string }).type;
  // a title worth keeping: one that isn't the file name, and isn't simply made from the content
  const title = spec.titleIsFileName || !doc.title || doc.title === spec.title?.(doc) ? undefined : doc.title;
  return stringifyFrontmatter(
    {
      id: doc.id,
      kind: doc.kind,
      // a note's type is said only when it is something else; every other kind always says its type
      type: spec.types && !(doc.kind === "note" && type === "note") ? type : undefined,
      title,
      tags: doc.tags,
      aliases: doc.aliases,
      about: doc.about,
      related: doc.related,
      concepts: doc.concepts,
      source: sourceToYaml(doc.source),
      ...own.data,
      ...(doc.props || {}),
      created: doc.created,
      updated: doc.updated,
    },
    own.body,
  );
}

/** A new document's fields, filled in: what every kind has, then the kind's own defaults. */
export function blankDoc<K extends DocKind>(kind: K, id: string, at: string): Doc {
  const base: DocBase = {
    id,
    kind,
    path: "",
    title: "",
    body: "",
    tags: [],
    aliases: [],
    about: [],
    related: [],
    concepts: [],
    created: at,
    updated: at,
  };
  const spec = KINDS[kind];
  return spec.read({ ...base, ...(spec.types ? { type: spec.types[0] } : {}) } as DocBase, {}, "");
}

/** A document with a new body, and the fields kept in the body read from it (a card's sides, a
 * session's turns, a figure's spec). */
export function withBody<D extends Doc>(doc: D, body: string): D {
  const spec = KINDS[doc.kind];
  return spec.read({ ...doc, body } as DocBase, spec.write(doc).data, body) as D;
}
