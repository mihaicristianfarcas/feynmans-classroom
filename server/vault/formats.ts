/* How each kind of record is kept as a file, and read back: notes, concepts, cards and annotations
 * are Markdown with YAML frontmatter. Readers are forgiving (files are edited by hand, in Obsidian
 * and by agents): missing fields get defaults, unknown fields are kept in `props` and written back. */
import { basename } from "node:path";
import type { Annotation, Card, Concept, Note, TutorSession } from "../../shared/vault-types.ts";
import {
  asArray,
  asString,
  extraProps,
  iso,
  num,
  parseFrontmatter,
  pathId,
  slugify,
  stringifyFrontmatter,
} from "./files.ts";

/* ---------- notes: notes/**.md, named by their title ---------- */

const NOTE_KEYS = [
  "id",
  "type",
  "title",
  "tags",
  "aliases",
  "related",
  "about",
  "concepts",
  "source",
  "score",
  "created",
  "updated",
];
export function noteFromFile(rel: string, text: string, mtime: string): Note {
  const { data, body } = parseFrontmatter(text);
  return {
    id: asString(data.id) || pathId(rel),
    path: rel,
    type: (asString(data.type, "note") as Note["type"]) || "note",
    // the file name is the title, as in Obsidian (a renamed file is a renamed note)
    title: basename(rel, ".md"),
    body: body.replace(/^\s*\n/, "").trimEnd(),
    tags: asArray(data.tags),
    aliases: asArray(data.aliases),
    related: asArray(data.related),
    about: asArray(data.about),
    concepts: asArray(data.concepts),
    source: (data.source as Note["source"]) || undefined,
    score: typeof data.score === "number" ? data.score : undefined,
    props: extraProps(data, NOTE_KEYS),
    created: iso(data.created, mtime),
    updated: iso(data.updated || data.created, mtime),
  };
}
export const noteToFile = (n: Note) =>
  stringifyFrontmatter(
    {
      id: n.id,
      type: n.type === "note" ? undefined : n.type,
      tags: n.tags,
      aliases: n.aliases,
      related: n.related,
      about: n.about,
      concepts: n.concepts,
      source: n.source,
      score: n.score,
      ...(n.props || {}),
      created: n.created,
      updated: n.updated,
    },
    n.body,
  );

/* ---------- concepts: concepts/<Name>.md ---------- */

const CONCEPT_KEYS = ["id", "name", "aliases", "summary", "related", "sources", "created", "updated"];
export function conceptFromFile(
  rel: string,
  text: string,
  mtime: string,
): Concept & { path: string; props?: Record<string, unknown> } {
  const { data, body } = parseFrontmatter(text);
  const name = asString(data.name) || basename(rel, ".md");
  return {
    id: asString(data.id) || slugify(name),
    path: rel,
    name,
    aliases: asArray(data.aliases),
    summary: asString(data.summary),
    body: body.trim(),
    related: asArray(data.related),
    sources: Array.isArray(data.sources) ? (data.sources as Concept["sources"]) : [],
    props: extraProps(data, CONCEPT_KEYS),
    created: iso(data.created, mtime),
    updated: iso(data.updated || data.created, mtime),
  };
}
export const conceptToFile = (c: Concept & { props?: Record<string, unknown> }) =>
  stringifyFrontmatter(
    {
      id: c.id,
      name: c.name,
      aliases: c.aliases,
      summary: c.summary,
      related: c.related,
      sources: c.sources,
      ...(c.props || {}),
      created: c.created,
      updated: c.updated,
    },
    c.body,
  );

/* ---------- cards: cards/*.md with ## Front and ## Back ---------- */

export function cardFromFile(rel: string, text: string, mtime: string): Card {
  const { data, body } = parseFrontmatter(text);
  const front = /##\s*Front\s*\n([\s\S]*?)(?=\n##\s*Back\b|$)/i.exec(body)?.[1]?.trim() || body.trim();
  const back = /##\s*Back\s*\n([\s\S]*)$/i.exec(body)?.[1]?.trim() || "";
  return {
    id: asString(data.id) || basename(rel, ".md"),
    front,
    back,
    kind: data.kind === "cloze" ? "cloze" : "basic",
    deck: asString(data.deck, "general"),
    concepts: asArray(data.concepts),
    tags: asArray(data.tags),
    source: (data.source as Card["source"]) || undefined,
    figure: data.figure ? asString(data.figure) : undefined,
    suspended: data.suspended === true,
    created: iso(data.created, mtime),
    updated: iso(data.updated || data.created, mtime),
  };
}
export const cardToFile = (c: Card) =>
  stringifyFrontmatter(
    {
      id: c.id,
      kind: c.kind,
      deck: c.deck,
      concepts: c.concepts,
      tags: c.tags,
      source: c.source,
      figure: c.figure,
      suspended: c.suspended || undefined,
      created: c.created,
      updated: c.updated,
    },
    `## Front\n\n${c.front}\n\n## Back\n\n${c.back}`,
  );

/* ---------- annotations: library/<book>/annotations/*.md ---------- */
const ANNOTATION_KEYS = [
  "id",
  "kind",
  "book",
  "book_id",
  "pdf",
  "chapter",
  "page",
  "block",
  "anchor",
  "color",
  "request",
  "status",
  "error",
  "model",
  "title",
  "tags",
  "created",
  "updated",
];
const QUOTE_CALLOUT = /^\s*> \[!quote\][^\n]*\n(?:>[^\n]*(?:\n|$))*/;

export function annotationFromFile(rel: string, text: string, mtime: string): Annotation {
  const { data, body } = parseFrontmatter(text);
  const a = (data.anchor || {}) as Record<string, unknown>;
  const rects = Array.isArray(a.rects)
    ? (a.rects as unknown[])
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
  const md = a.md as Annotation["anchor"]["md"] | undefined;
  return {
    id: asString(data.id) || pathId(rel),
    kind: (asString(data.kind, "highlight") as Annotation["kind"]) || "highlight",
    bookId: asString(data.book_id),
    path: rel,
    chapterId: data.chapter ? asString(data.chapter) : undefined,
    anchor: {
      page: num(data.page),
      block: num(data.block),
      blockEnd: num(a.blockEnd),
      quote: asString(a.quote),
      prefix: a.prefix ? asString(a.prefix) : undefined,
      suffix: a.suffix ? asString(a.suffix) : undefined,
      start: num(a.start),
      end: num(a.end),
      rects: rects?.length ? rects : undefined,
      y: num(a.y),
      md:
        md && typeof md === "object" && md.file
          ? { file: String(md.file), line: Number(md.line) || 1, score: num(md.score) }
          : undefined,
    },
    color: data.color ? asString(data.color) : undefined,
    request: data.request ? asString(data.request) : undefined,
    status: (["pending", "ready", "failed"].includes(asString(data.status))
      ? data.status
      : "ready") as Annotation["status"],
    error: data.error ? asString(data.error) : undefined,
    model: (data.model as Annotation["model"]) || undefined,
    title: data.title ? asString(data.title) : undefined,
    tags: asArray(data.tags),
    body: body.replace(QUOTE_CALLOUT, "").trim(),
    props: extraProps(data, ANNOTATION_KEYS),
    created: iso(data.created, mtime),
    updated: iso(data.updated || data.created, mtime),
  };
}

/** Book facts an annotation file records (set by the annotations module, which knows the books). */
export let annotationBookInfo: (bookId: string) => { folder?: string; pdf?: Record<string, unknown> } = () => ({});
export function setAnnotationBookInfo(fn: typeof annotationBookInfo) {
  annotationBookInfo = fn;
}
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function annotationToFile(x: Annotation): string {
  const info = annotationBookInfo(x.bookId);
  const a = x.anchor;
  const anchor = {
    quote: a.quote,
    prefix: a.prefix,
    suffix: a.suffix,
    start: a.start,
    end: a.end,
    blockEnd: a.blockEnd,
    y: a.y !== undefined ? r4(a.y) : undefined,
    rects: a.rects?.map((r) =>
      r.p !== undefined && r.p !== a.page
        ? [r4(r.x), r4(r.y), r4(r.w), r4(r.h), r.p]
        : [r4(r.x), r4(r.y), r4(r.w), r4(r.h)],
    ),
    md: a.md,
  };
  const where = a.page !== undefined ? `p. ${a.page}` : a.block !== undefined ? `block ${a.block}` : "";
  const quote = a.quote
    ? `> [!quote] ${where}\n${a.quote
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}\n\n`
    : "";
  return stringifyFrontmatter(
    {
      id: x.id,
      kind: x.kind,
      title: x.title,
      book: info.folder,
      book_id: x.bookId,
      pdf: info.pdf,
      chapter: x.chapterId,
      page: a.page,
      block: a.block,
      anchor,
      color: x.color,
      request: x.request,
      status: x.status === "ready" ? undefined : x.status,
      error: x.error,
      model: x.model,
      tags: x.tags,
      ...(x.props || {}),
      created: x.created,
      updated: x.updated,
    },
    `${quote}${x.body}`,
  );
}

/* ---------- tutoring sessions: library/<book>/sessions/*.md ---------- */

const SESSION_KEYS = [
  "id",
  "kind",
  "title",
  "book",
  "book_id",
  "chapter",
  "mode",
  "passage",
  "note",
  "note_id",
  "created",
  "updated",
];
/** A turn begins with a line "## You" or "## Tutor"; everything until the next one is its text. */
const TURN = /^## (You|Tutor)[ \t]*$/m;

export function sessionFromFile(rel: string, text: string, mtime: string): TutorSession {
  const { data, body } = parseFrontmatter(text);
  const quoted = QUOTE_CALLOUT.exec(body);
  const passageText = quoted
    ? quoted[0]
        .trim()
        .split("\n")
        .slice(1)
        .map((l) => l.replace(/^> ?/, ""))
        .join("\n")
        .trim()
    : "";
  const parts = body.replace(QUOTE_CALLOUT, "").split(TURN);
  const messages: TutorSession["messages"] = [];
  for (let i = 1; i < parts.length; i += 2)
    messages.push({ role: parts[i] === "You" ? "user" : "tutor", text: (parts[i + 1] || "").trim() });
  const where = (data.passage || {}) as Record<string, unknown>;
  const bookId = asString(data.book_id);
  return {
    id: asString(data.id) || pathId(rel),
    bookId,
    path: rel,
    title: asString(data.title) || messages.find((m) => m.role === "user")?.text.slice(0, 80) || basename(rel, ".md"),
    chapterId: data.chapter ? asString(data.chapter) : undefined,
    passage: passageText
      ? {
          text: passageText,
          source: {
            bookId,
            chapterId: data.chapter ? asString(data.chapter) : undefined,
            page: num(where.page),
            y: num(where.y),
            block: num(where.block),
            quote: where.quote ? asString(where.quote) : undefined,
          },
        }
      : undefined,
    mode: data.mode === "socratic" ? "socratic" : "answer",
    messages,
    note: data.note_id
      ? { id: asString(data.note_id), title: asString(data.note).replace(/^\[\[|\]\]$/g, "") }
      : undefined,
    props: extraProps(data, SESSION_KEYS),
    created: iso(data.created, mtime),
    updated: iso(data.updated || data.created, mtime),
  };
}

export function sessionToFile(x: TutorSession): string {
  const info = annotationBookInfo(x.bookId);
  const src = x.passage?.source;
  const where = src?.page !== undefined ? `p. ${src.page}` : src?.block !== undefined ? `block ${src.block}` : "";
  const quote = x.passage?.text
    ? `> [!quote] ${where}\n${x.passage.text
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n")}\n\n`
    : "";
  const turns = x.messages.map((m) => `## ${m.role === "user" ? "You" : "Tutor"}\n\n${m.text.trim()}`).join("\n\n");
  return stringifyFrontmatter(
    {
      id: x.id,
      kind: "tutor",
      title: x.title,
      book: info.folder,
      book_id: x.bookId,
      chapter: x.chapterId,
      mode: x.mode,
      passage: src ? { page: src.page, y: src.y, block: src.block, quote: src.quote } : undefined,
      note: x.note ? `[[${x.note.title}]]` : undefined,
      note_id: x.note?.id,
      ...(x.props || {}),
      created: x.created,
      updated: x.updated,
    },
    `${quote}${turns}`,
  );
}
