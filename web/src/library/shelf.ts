/* The bookcase's arithmetic, kept apart from React so it can be tested: how each book's spine looks
 * (its topic's pastel, one of a few shades and bindings, a thickness from its length and a height of
 * its own, all fixed by its id so a book always looks the same), how far you are through it, how the
 * shelf sorts and labels runs of books, and where every book stands (left to right along a plank, a
 * gap between runs, a new shelf when one is full). */
import { type Tone, topicOf, topicOrder } from "../../../shared/topics.ts";
import type { Book } from "../api";

export type Binding = "bands" | "label" | "plain" | "rule";

export interface Look {
  tone: Tone | "paper";
  /** 0–3: the pastel itself, lighter, deeper, inked. */
  shade: number;
  binding: Binding;
  /** Spine thickness and height, in px. */
  w: number;
  h: number;
}

/** FNV-1a: the same id always gives the same number. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator, so a book's look never changes between visits. */
function seeded(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minutes to read it (230 words a minute; a PDF without a word count, a page at a time). */
export function minutesOf(book: Pick<Book, "words" | "pageCount" | "blockCount">): number {
  const words = book.words ?? (book.pageCount ? book.pageCount * 320 : (book.blockCount ?? 20) * 60);
  return Math.max(1, Math.round(words / 230));
}

export function fmtMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 6) / 10;
  return hours < 10 ? `${hours} h` : `${Math.round(hours)} h`;
}

const BINDINGS: Binding[] = ["bands", "label", "plain", "rule"];

export function lookOf(book: Pick<Book, "id" | "topic" | "words" | "pageCount" | "blockCount">): Look {
  const r = seeded(hash(book.id));
  const pick = r();
  return {
    tone: book.topic ? topicOf(book.topic).tone : "paper",
    shade: pick < 0.4 ? 0 : pick < 0.65 ? 1 : pick < 0.85 ? 2 : 3,
    binding: BINDINGS[Math.floor(r() * BINDINGS.length)],
    w: Math.round(Math.min(68, Math.max(26, 18 + Math.sqrt(minutesOf(book)) * 4))),
    h: Math.round(196 + r() * 58),
  };
}

/** How far through it you are (0–1), from the place the reader keeps for it in this browser. */
export function progressOf(book: Pick<Book, "id" | "format" | "pageCount" | "blockCount">): number {
  let pos: number | null = null;
  try {
    const saved = localStorage.getItem(`classroom-pos-${book.id}`);
    pos = saved ? Number(saved) : null;
  } catch {}
  if (pos === null || !Number.isFinite(pos)) return 0;
  const pct =
    book.format === "pdf" ? (pos - 1) / Math.max(1, book.pageCount || 1) : pos / Math.max(1, book.blockCount || 1);
  return Math.min(1, Math.max(0, pct));
}

export type Sort = "topic" | "recent" | "title" | "length";

export const SORTS: { key: Sort; label: string }[] = [
  { key: "topic", label: "Topic" },
  { key: "recent", label: "Recent" },
  { key: "title", label: "Title" },
  { key: "length", label: "Length" },
];

const titleKey = (b: Book) => b.title.replace(/^(the|a|an)\s+/i, "").toLowerCase();

export function sortBooks(books: Book[], sort: Sort): Book[] {
  const out = [...books];
  if (sort === "topic")
    out.sort((a, b) => topicOrder(a.topic) - topicOrder(b.topic) || a.createdAt.localeCompare(b.createdAt));
  else if (sort === "recent") out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (sort === "title") out.sort((a, b) => titleKey(a).localeCompare(titleKey(b)));
  else out.sort((a, b) => minutesOf(a) - minutesOf(b));
  return out;
}

export interface Group {
  key: string;
  label: string;
  /** The topic it stands for, when it is one (the label then filters to it). */
  topic?: string;
}

/** The run of books a book belongs to on a sorted shelf, labelled under the plank. */
export function groupOf(book: Book, sort: Sort): Group | null {
  if (sort === "topic") {
    if (!book.topic) return { key: "unsorted", label: "Being sorted" };
    const topic = topicOf(book.topic);
    return { key: topic.key, label: topic.name, topic: topic.key };
  }
  if (sort === "recent") {
    const label = new Date(book.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { key: label, label };
  }
  if (sort === "length") {
    const m = minutesOf(book);
    if (m < 15) return { key: "short", label: "A sitting" };
    if (m < 90) return { key: "evening", label: "An evening" };
    if (m < 600) return { key: "week", label: "A week" };
    return { key: "long", label: "A long read" };
  }
  return null;
}

/* ---------- where each book stands ---------- */

export const PAD = 24;
const GAP = 3;
const RUN_GAP = 34;
/** The room a book stands in, the plank under it, and the space for the labels below. */
export const AREA = 262;
export const PLANK = 14;
export const PITCH = AREA + PLANK + 48;

export interface Spot {
  x: number;
  y: number;
  row: number;
}
export interface Label extends Group {
  /** Its left edge and its shelf. */
  x: number;
  row: number;
  count: number;
}

/** About how wide a label is drawn (its icon, its words and its count), so labels never meet. */
export const labelWidth = (label: { label: string; topic?: string; count: number }) =>
  (label.topic ? 20 : 0) + label.label.length * 6.8 + String(label.count).length * 7 + 26;

/** Every book's place, the labels under the runs, how many shelves, and where each shelf's books end. */
export function arrange(books: Book[], width: number, sort: Sort) {
  const spots = new Map<string, Spot>();
  const labels: Label[] = [];
  const ends: number[] = [];
  const inner = Math.max(200, width);
  const right = inner - PAD;
  const runs: { group: Group | null; books: Book[] }[] = [];
  for (const book of books) {
    const group = groupOf(book, sort);
    const last = runs[runs.length - 1];
    if (last && (last.group?.key ?? null) === (group?.key ?? null)) last.books.push(book);
    else runs.push({ group, books: [book] });
  }
  let row = 0;
  let edge = PAD;
  let labelEdge = Number.NEGATIVE_INFINITY;
  let used = false;
  const wrap = () => {
    ends[row] = edge;
    row++;
    edge = PAD;
    labelEdge = Number.NEGATIVE_INFINITY;
    used = false;
  };
  for (const run of runs) {
    const widths = run.books.map((b) => lookOf(b).w);
    const runWidth = widths.reduce((n, w) => n + w + GAP, -GAP);
    const lw = run.group ? labelWidth({ ...run.group, count: run.books.length }) : 0;
    let x = PAD;
    if (used) {
      // far enough along for this run's label to clear the last one
      x = Math.max(edge + RUN_GAP, labelEdge + 14 + lw / 2 - Math.min(runWidth, right - edge) / 2);
      if (x + widths[0] > right) {
        wrap();
        x = PAD;
      }
    }
    const startRow = row;
    const startX = x;
    let endX = -1;
    run.books.forEach((book, i) => {
      if (used && x + widths[i] > right) {
        if (endX < 0) endX = edge;
        wrap();
        x = PAD;
      }
      spots.set(book.id, { x, y: row * PITCH + AREA - lookOf(book).h, row });
      edge = x + widths[i];
      x = edge + GAP;
      used = true;
    });
    if (endX < 0) endX = edge;
    if (run.group) {
      const before = labels.at(-1);
      let left = (startX + endX) / 2 - lw / 2;
      if (before && before.row === startRow) left = Math.max(left, before.x + labelWidth(before) + 14);
      left = Math.max(2, Math.min(inner - lw, left));
      labels.push({ ...run.group, x: left, row: startRow, count: run.books.length });
      if (row === startRow) labelEdge = left + lw;
    }
  }
  ends[row] = edge;
  return { spots, labels, rows: books.length ? row + 1 : 1, ends };
}
