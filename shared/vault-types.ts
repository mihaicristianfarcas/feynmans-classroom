/* The second brain's records. Each lives as one Markdown file with YAML frontmatter in the vault
 * (DATA_DIR/vault), so a person, Obsidian or an AI agent can read and edit them directly; reviews
 * and activity are append-only JSONL logs. Git keeps the history. */

export interface SourceRef {
  bookId: string;
  chapterId?: string;
  /** PDF page + fraction, or block index (EPUB, Markdown, text). */
  page?: number;
  y?: number;
  block?: number;
  quote?: string;
}

export type NoteType = "note" | "highlight" | "explanation" | "connection" | "answer" | "summary";

export interface Note {
  /** From the frontmatter, or derived from the path for notes written elsewhere (Obsidian, an agent). */
  id: string;
  /** Vault-relative path ("notes/Replication lag.md"): the file name is the title, as in Obsidian. */
  path: string;
  type: NoteType;
  title: string;
  /** Markdown. [[wikilinks]] to notes or concepts; ![[figure:id]] embeds a figure. */
  body: string;
  tags: string[];
  aliases: string[];
  /** Links kept in the frontmatter (Obsidian properties), e.g. connections the learner accepted. */
  related: string[];
  concepts: string[];
  source?: SourceRef;
  /** Feynman explanations: the grade the tutor gave (0–100). */
  score?: number;
  /** Frontmatter keys the app doesn't know: kept exactly as they were. */
  props?: Record<string, unknown>;
  created: string;
  updated: string;
}

export interface Concept {
  /** Slug of the name. */
  id: string;
  name: string;
  aliases: string[];
  /** One or two sentences. */
  summary: string;
  /** Markdown: a fuller explanation, examples, the user's own words. */
  body: string;
  related: string[];
  sources: SourceRef[];
  created: string;
  updated: string;
}

export interface Card {
  id: string;
  /** Markdown. */
  front: string;
  back: string;
  kind: "basic" | "cloze";
  /** The book it came from (or "general"). */
  deck: string;
  concepts: string[];
  tags: string[];
  source?: SourceRef;
  /** A figure shown with the answer. */
  figure?: string;
  suspended: boolean;
  created: string;
  updated: string;
}

export interface ReviewLog {
  card: string;
  ts: number;
  rating: 1 | 2 | 3 | 4;
  /** Seconds to answer. */
  took?: number;
}

export type ActivityType =
  | "read"
  | "review"
  | "note"
  | "highlight"
  | "card"
  | "figure"
  | "quiz"
  | "explain"
  | "connect"
  | "ask"
  | "concept"
  | "book";

export interface Activity {
  ts: number;
  type: ActivityType;
  bookId?: string;
  concepts?: string[];
  /** Short human summary ("Read 12 pages of DDIA", "Quiz: 4/5"). */
  text: string;
  data?: Record<string, unknown>;
}

export interface Profile {
  name: string;
  role: "student" | "professor" | "professional" | "curious";
  /** What they want to learn and why. */
  goals: string;
  /** Background and expertise. */
  background: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
  /** 0–1: how much they want pictures, words and things to touch. */
  styles: { visual: number; reader: number; doer: number };
  interests: string[];
  /** New cards per day and target retention. */
  dailyNew: number;
  retention: number;
  /** Free notes about themselves (Markdown body of profile.md). */
  notes: string;
  onboarded: boolean;
}

export interface SavedFigure {
  id: string;
  title: string;
  /** The scene spec. */
  scene: unknown;
  source?: SourceRef;
  request?: string;
  created: string;
}

/* ---------------- annotations: what was made from a passage, kept beside the book ---------------- */

export type AnnotationKind = "highlight" | "explain" | "define" | "ask" | "visualize" | "resources" | "comment";

/**
 * Where a passage is, recorded several ways (as the W3C Web Annotation model and Hypothesis do), so it
 * can be found again quickly (rects) and robustly (the quote and its context), and an agent can find
 * it in the book's Markdown text (md).
 */
export interface Anchor {
  /** PDF page (1-based) where the passage starts. */
  page?: number;
  /** Reflowable books: the block where it starts, and where it ends. */
  block?: number;
  blockEnd?: number;
  /** The selected text, whitespace collapsed. */
  quote: string;
  /** Up to 32 characters before and after it in the page (or block) text. */
  prefix?: string;
  suffix?: string;
  /** Character offsets of the quote in the page's text layer (or the block's text). */
  start?: number;
  end?: number;
  /** PDF: the selection's boxes as fractions of the page, [x, y, w, h]; `p` when not on `page`. */
  rects?: { p?: number; x: number; y: number; w: number; h: number }[];
  /** Top of the passage as a fraction of the page height (from the rects, or found from the text). */
  y?: number;
  /** The same passage in the book's Markdown: the chapter text file and line. */
  md?: { file: string; line: number; score?: number };
}

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  bookId: string;
  /** Vault-relative path of the file. */
  path: string;
  chapterId?: string;
  anchor: Anchor;
  /** Highlight colour (a theme token: yellow, green, blue, pink, purple). */
  color?: string;
  /** What the learner asked for ("why not just back up?"), if anything. */
  request?: string;
  status: "pending" | "ready" | "failed";
  error?: string;
  /** Who made it and how long it took. */
  model?: { provider: string; name: string; effort?: string; ms?: number };
  /** Markdown: the answer, follow-ups as "## Follow-up: …" sections, a figure as a ```figure block. */
  body: string;
  title?: string;
  tags: string[];
  props?: Record<string, unknown>;
  created: string;
  updated: string;
}

/* ---------------- connections the agent suggests between notes ---------------- */

export interface Connection {
  id: string;
  /** Vault path of the note the link goes in. */
  from: string;
  /** The link target as it would be written in [[…]] (a note title, a concept name). */
  to: string;
  why: string;
  status: "suggested" | "accepted" | "rejected" | "removed";
  by?: { provider: string; model: string };
  created: string;
  decided?: string;
}

/* ---------------- agent runs ---------------- */

export interface AgentRun {
  id: string;
  task: string;
  mode: "read" | "write";
  status: "running" | "review" | "merged" | "discarded" | "failed" | "undone" | "done";
  started: string;
  ms?: number;
  provider?: string;
  model?: string;
  /** Files the run changed: A(dded), M(odified), D(eleted). */
  files?: { path: string; change: "A" | "M" | "D" }[];
  /** Why it waits for the learner's OK (a file it wrote can't be read). */
  review?: string[];
  /** The jj change it made: what Undo takes out again. */
  change?: string;
  /** That change's commit: its diff stays readable after an undo. */
  commit?: string;
  answer?: string;
  error?: string;
  activity?: string;
}
