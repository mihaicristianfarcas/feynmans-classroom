/* The shapes the API answers with. Records kept in the vault (notes, annotations, cards…) share
 * their definitions with the server (shared/vault-types.ts); the rest are views the routes build. */

import type {
  Activity,
  AgentContext,
  AgentRun,
  Anchor,
  Annotation,
  AnnotationKind,
  Connection,
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
  AnnotationKind,
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
export interface NoteDetail extends Note {
  backlinks: { from: string; path: string; title: string; kind: string; line: number; context: string }[];
  mentions: { path: string; title: string; context: string }[];
  outgoing: { target: string; kind: string; to: string | null; path?: string; title: string }[];
  connections: SuggestedLink[];
}
export interface Rect {
  p?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A link the agent suggested between notes, and what the learner decided. */
export interface Resolved {
  node: string;
  kind: "note" | "concept" | "book" | "annotation" | "figure" | "attachment" | "session";
  id: string;
  path?: string;
  title: string;
  page?: number;
  bookId?: string;
  anchor?: Anchor;
}
export interface Concept {
  id: string;
  name: string;
  aliases: string[];
  summary: string;
  body: string;
  related: string[];
  sources: (SourceRef & { title?: string })[];
  created: string;
  updated: string;
  mastery: number | null;
  cards?: number;
}
export interface ConceptDetail extends Omit<Concept, "cards" | "related"> {
  cards: CardView[];
  notes: Note[];
  related: { id: string; name: string; mastery: number | null }[];
  backlinks: { id: string; name: string; mastery: number | null }[];
}
export interface MemoryState {
  s: number;
  d: number;
  last: number;
  due: number;
  phase: "learning" | "review" | "relearning";
  reps: number;
  lapses: number;
}
export interface CardView {
  id: string;
  front: string;
  back: string;
  kind: "basic" | "cloze";
  deck: string;
  concepts: string[];
  tags: string[];
  source?: SourceRef;
  figure?: string;
  suspended: boolean;
  created: string;
  state: MemoryState | null;
  next?: Record<1 | 2 | 3 | 4, number>;
}
export interface DraftCard {
  front: string;
  back: string;
  kind: "basic" | "cloze";
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
    created: number;
  }[];
  edges: { from: string; to: string; kind: string; id?: string; why?: string }[];
}
export interface SearchHit {
  kind: "note" | "concept" | "card" | "book" | "annotation" | "session";
  id: string;
  title: string;
  snippet: string;
  score: number;
  bookId?: string;
  loc?: { page?: number; block?: number };
}
export interface Journey {
  days: Record<string, { reviews: number; minutes: number; events: number; correct: number }>;
  streak: number;
  totals: { reviews: number; cards: number; concepts: number; notes: number; figures: number; books: number };
  retention: { now: number | null; month: number | null; mature: number; learning: number; unseen: number };
  mastery: { id: string; name: string; mastery: number | null }[];
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
