/* The shapes the API answers with. The documents kept in the vault (notes, concepts, cards, annotations,
 * sessions, figures) share their definitions with the server (shared/vault-types.ts); the rest are
 * views the routes build (a card with its memory state, a concept with its mastery, a document's page). */

import type {
  Activity,
  AgentContext,
  AgentRun,
  Anchor,
  Annotation,
  AnnotationType,
  Card,
  Concept,
  Connection,
  Doc,
  DocKind,
  DocOf,
  Note,
  NoteType,
  Profile,
  SavedFigure,
  SourceRef,
  TutorSession,
} from "../../../shared/vault-types.ts";

export type {
  Activity,
  AgentContext,
  AgentRun,
  Anchor,
  Annotation,
  AnnotationType,
  Card,
  Concept,
  Doc,
  DocKind,
  DocOf,
  Note,
  NoteType,
  Profile,
  SavedFigure,
  SourceRef,
  TutorSession,
};
/** A link an agent suggested between notes, and what the learner decided. */
export type SuggestedLink = Connection;

/** A place a phrase was found in a book (see server/books/find.ts). */
export interface FindHit {
  page?: number;
  y?: number;
  block?: number;
  quote: string;
  prefix: string;
  suffix: string;
  chapterId?: string;
}
export interface Loc {
  page?: number;
  y?: number;
  block?: number;
}
export interface TocEntry {
  id: string;
  title: string;
  subtitle?: string;
  start: Loc;
  end: Loc;
  sections: { id: string; title: string; start: Loc }[];
}
export interface Book {
  id: string;
  title: string;
  /** Its folder in the vault (library/<folder>) and its file there. */
  folder?: string;
  file?: string;
  author?: string;
  format: "pdf" | "epub" | "text";
  pageCount?: number;
  blockCount?: number;
  toc: TocEntry[];
  createdAt: string;
  status: "ingesting" | "ready" | "error";
  error?: string;
  tocSource?: "outline" | "nav" | "headings" | "chunks" | "codex";
  demoCount?: number;
  building?: number;
}
export interface Brief {
  slug: string;
  eyebrow: string;
  title: string;
  caption: string;
  anchorQuote: string;
  page: number;
  idea: string;
  predict: unknown;
}
export type DemoStatus = "queued" | "planning" | "building" | "checking" | "ready" | "failed";
export interface Demo {
  type?: "scene" | "code";
  scene?: unknown;
  request?: string;
  kind?: string;
  quality?: "quick" | "careful";
  ms?: number;
  startedAt?: string;
  id: string;
  bookId: string;
  chapterId: string;
  status: DemoStatus;
  brief: Brief;
  anchor: Loc & { quote: string; matched: boolean };
  fig: string;
  createdAt: string;
  updatedAt: string;
  activity?: string;
  error?: string;
  attempts: number;
  source?: "chapter" | "selection";
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
export interface Block {
  id: number;
  chapter: number;
  tag: string;
  html: string;
  text: string;
}
export interface Status {
  codex: { installed: boolean; version?: string; loggedIn: boolean; detail?: string };
  chrome: boolean;
  queue: { running: number; waiting: number; concurrency: number };
}
/** A document with what its page shows beside it: links in and out, unlinked mentions, suggested connections. */
export type DocDetail<D extends Doc = Doc> = D & {
  backlinks: { from: string; path: string; title: string; kind: string; line: number; context: string }[];
  mentions: { path: string; title: string; context: string }[];
  outgoing: { target: string; kind: string; to: string | null; path?: string; title: string }[];
  connections: SuggestedLink[];
};
export type NoteDetail = DocDetail<Note>;
export interface Rect {
  p?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A link the agent suggested between notes, and what the learner decided. */
/** What a [[link]] points at: a document (of any kind), a book, a picture. */
export interface Resolved {
  node: string;
  kind: DocKind | "book" | "attachment";
  id: string;
  path?: string;
  title: string;
  page?: number;
  bookId?: string;
  /** Where in a book it is anchored. */
  source?: SourceRef;
}
/** A concept with how well it is known right now, and how many cards it has. */
export type ConceptView = Concept & { mastery: number | null; cards?: number };
/** A concept's page. */
export type ConceptDetail = Omit<Concept, "sources" | "related"> & {
  sources: (SourceRef & { title?: string })[];
  mastery: number | null;
  cards: CardView[];
  notes: Note[];
  /** Vault notes that link to it. */
  vaultNotes: { vault: string; vaultName: string; path: string; title: string }[];
  related: { id: string; title: string; mastery: number | null }[];
  backlinks: { id: string; title: string; mastery: number | null }[];
};
export interface MemoryState {
  s: number;
  d: number;
  last: number;
  due: number;
  phase: "learning" | "review" | "relearning";
  reps: number;
  lapses: number;
}
/** A card with its memory state, and when it would come back after each rating. */
export type CardView = Card & {
  state: MemoryState | null;
  next?: Record<1 | 2 | 3 | 4, number>;
};
export interface DraftCard {
  front: string;
  back: string;
  type: "basic" | "cloze";
  concept: string;
}
export interface Question {
  kind: "mcq" | "short";
  question: string;
  choices: string[];
  answer: number;
  ideal: string;
  explanation: string;
  concept: string;
  quote: string;
}
export interface Quiz {
  id: string;
  title: string;
  mode: "check" | "pretest" | "review";
  questions: Question[];
  source: { bookId?: string; chapterId?: string };
}
export interface ExplainFeedback {
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  jargon: string[];
  misconceptions: string[];
  followUp: string;
  simpler: string;
  quote: string;
}
/** One way an idea connects to the world ("Connect it to today"). */
export interface IdeaConnection {
  kind: "today" | "your-work" | "across";
  title: string;
  body: string;
  concepts: string[];
}
export interface GraphData {
  nodes: {
    id: string;
    kind: "book" | "concept" | "note" | "annotation";
    label: string;
    mastery: number | null;
    size: number;
    detail?: string;
    bookId?: string;
    path?: string;
    /** A vault note: the vault's id. */
    vault?: string;
    created: number;
  }[];
  edges: { from: string; to: string; kind: string; id?: string; why?: string }[];
}
export interface SearchHit {
  /** "vault": a vault note (`vault`, `path`). */
  kind: DocKind | "book" | "vault";
  id: string;
  title: string;
  snippet: string;
  score: number;
  bookId?: string;
  loc?: { page?: number; block?: number };
  vault?: string;
  vaultName?: string;
  path?: string;
}
export interface Journey {
  days: Record<string, { reviews: number; minutes: number; events: number; correct: number }>;
  streak: number;
  totals: { reviews: number; cards: number; concepts: number; notes: number; figures: number; books: number };
  retention: { now: number | null; month: number | null; mature: number; learning: number; unseen: number };
  mastery: { id: string; title: string; mastery: number | null }[];
  recent: Activity[];
}
export interface Today {
  queue: { due: number; learning: number; fresh: number; total: number };
  books: {
    id: string;
    title: string;
    author?: string;
    format: string;
    lastTs: number;
    position: number | null;
    chapter: string | null;
  }[];
  suggestions: { kind: string; title: string; detail: string; action: Record<string, string> }[];
  profile: Profile;
  summary: string;
}
export interface SettingsInfo {
  settings: {
    provider: "auto" | "codex" | "claude";
    codex: Tier;
    claude: Tier;
    concurrency: number;
    connections?: "suggest" | "auto";
  };
  active: "codex" | "claude";
  codex: { installed: boolean; version?: string; loggedIn: boolean; detail?: string };
  claude: { installed: boolean; version?: string };
  load: { running: number; waiting: number };
}
interface Tier {
  fastModel: string;
  fastEffort: string;
  smartModel: string;
  smartEffort: string;
}
