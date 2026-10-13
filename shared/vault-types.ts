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
  id: string;
  type: NoteType;
  title: string;
  /** Markdown. [[wikilinks]] to notes or concepts; ![[figure:id]] embeds a figure. */
  body: string;
  tags: string[];
  concepts: string[];
  source?: SourceRef;
  /** Feynman explanations: the grade the tutor gave (0–100). */
  score?: number;
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

export type ActivityType = "read" | "review" | "note" | "highlight" | "card" | "figure" | "quiz" | "explain" | "connect" | "ask" | "concept" | "book";

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
