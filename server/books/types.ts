/* The shapes of books and their figures as the server stores them (book.json, demo.json): the book
 * (or an article saved from the web), its chapters and text (positioned PDF lines or sanitized
 * blocks), a figure's brief and record, the checks a hand-built demo passes, and queued jobs. */
export type BookFormat = "pdf" | "epub" | "text" | "web";

/** A place in the book: a PDF page (1-based) and a fraction of its height, or a block index. */
export interface Loc {
  page?: number;
  y?: number;
  block?: number;
}

export interface TocEntry {
  id: string;
  title: string;
  /** Heading found in the text (e.g. "On Relative Growings") when the outline title is generic. */
  subtitle?: string;
  start: Loc;
  end: Loc;
  sections: { id: string; title: string; start: Loc }[];
}

export interface Book {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  file: string;
  /** First 16 hex digits of the file's SHA-256: which edition annotations were made on. */
  sha256?: string;
  pageCount?: number;
  blockCount?: number;
  extractor?: string;
  /** How the chapters were found: the PDF outline, EPUB nav, type-size headings, fixed page chunks, or Codex. */
  tocSource?: "outline" | "nav" | "headings" | "chunks" | "codex";
  toc: TocEntry[];
  createdAt: string;
  status: "ingesting" | "ready" | "error";
  error?: string;
  /** Where an article (or a PDF from a link) was saved from. */
  source?: { url: string; site?: string; published?: string };
  /** A line saying what it is about (an article's standfirst), when it has one. */
  summary?: string;
  /** Its cover picture, relative to its folder ("assets/cover.jpg"): an EPUB's, an article's lead picture. */
  cover?: string;
  /** The shelf's topic (shared/topics.ts) and a few tags, sorted by a quick model call when it arrives. */
  topic?: string;
  tags?: string[];
  /** How long it is, in words: how thick its spine is drawn and how long it takes to read. */
  words?: number;
}

/** One extracted line of a PDF page; y is the top of the line as a fraction of the page height. */
export interface PageLine {
  y: number;
  x: number;
  s: number;
  t: string;
}
export interface PageText {
  n: number;
  w: number;
  h: number;
  lines: PageLine[];
}

/** One block of a reflowable book (EPUB, text, Markdown), already sanitized. */
export interface Block {
  id: number;
  chapter: number;
  tag: string;
  html: string;
  text: string;
}

export interface Predict {
  question: string;
  choices: string[];
  answer: number;
  explain: string;
}

/** What a figure should be: its idea, picture, motion and controls, and the passage it belongs to. */
export interface Brief {
  slug: string;
  eyebrow: string;
  title: string;
  caption: string;
  anchorQuote: string;
  page: number;
  idea: string;
  picture: string;
  motion: string;
  controls: string;
  readouts: string;
  truth: string;
  predict: Predict | null;
  /** The figure kind that fits: plot, sequence, graph, object3d, diagram. */
  kind?: string;
}

export type DemoStatus = "queued" | "planning" | "building" | "checking" | "ready" | "failed";

export interface Demo {
  id: string;
  bookId: string;
  chapterId: string;
  status: DemoStatus;
  brief: Brief;
  anchor: Loc & { quote: string; matched: boolean };
  fig: string;
  createdAt: string;
  updatedAt: string;
  /** Last line of Codex activity, for the progress UI. */
  activity?: string;
  error?: string;
  attempts: number;
  threadId?: string;
  checks?: { node?: CheckReport; browser?: BrowserReport };
  feedback?: string;
  source?: "chapter" | "selection";
  /** "scene": a declarative figure drawn by the platform (fast); "code": a hand-built demo.js. */
  type?: "scene" | "code";
  scene?: unknown;
  /** The reader's request, in their words. */
  request?: string;
  /** The kind asked for (or "auto"). */
  kind?: string;
  quality?: "quick" | "careful";
  /** Generation time in ms (scene figures). */
  ms?: number;
  /** When the current drawing started (ISO), for the progress clock. */
  startedAt?: string;
}

export interface CheckReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: Record<string, number | string | boolean>;
}

export interface BrowserReport {
  ok: boolean;
  errors: string[];
  frames: number;
  readout: string;
  shots: string[];
}

export interface Job {
  id: string;
  bookId: string;
  kind: "plan" | "build" | "figure";
  chapterId?: string;
  demoId?: string;
  status: "queued" | "running" | "done" | "failed";
  message?: string;
}
