/* The second brain's records. Everything the learner reads and writes is a document: one Markdown file
 * with YAML frontmatter in the vault (DATA_DIR/vault) whose `kind` says what it is, and six kinds share
 * one shape (the fields of DocBase, plus a few of their own). Books (library/<book>/) and logs
 * (log/*.jsonl, brain/connections.jsonl) are the only other things kept. A person, Obsidian or an AI
 * agent can read and write any of them; jj keeps the history. */

/**
 * Where a passage is in a book, recorded several ways (as the W3C Web Annotation model and Hypothesis
 * do), so it can be found again quickly (rects) and robustly (the quote and its context), and an agent
 * can find it in the book's Markdown text (md).
 */
export interface Anchor {
  /** PDF page (1-based) where the passage starts. */
  page?: number;
  /** Reflowable books: the block where it starts, and where it ends. */
  block?: number;
  blockEnd?: number;
  /** The passage, whitespace collapsed. */
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

/** The book a document comes from, or the passage it is anchored to: the book, its chapter, and as much
 * of the anchor as is known (a page and a few words, or the whole passage). */
export interface SourceRef extends Partial<Anchor> {
  bookId: string;
  chapterId?: string;
}

/* ---------------- documents ---------------- */

export type DocKind = "note" | "concept" | "card" | "annotation" | "session" | "figure";
export const DOC_KINDS: DocKind[] = ["note", "concept", "card", "annotation", "session", "figure"];

/** What every document has. */
export interface DocBase {
  /** From the frontmatter, or derived from the path for a file written without one. */
  id: string;
  kind: DocKind;
  /** Vault-relative path ("notes/Replication lag.md"). */
  path: string;
  /** A note's or concept's file name (as in Obsidian); the frontmatter's, or one made from the content,
   * for the other kinds. */
  title: string;
  /** Markdown. [[wikilinks]] to anything in the vault, ![[embeds]]. */
  body: string;
  tags: string[];
  aliases: string[];
  /** What it is about: links to books, concepts, notes ("[[DDIA]]", "[[Replication]]"). Their pages list it. */
  about: string[];
  /** Other links kept in the frontmatter: related ideas, connections the learner accepted, a note made from it. */
  related: string[];
  /** The concepts it is about or tests (their ids). */
  concepts: string[];
  /** The book it comes from, or the passage it is anchored to. */
  source?: SourceRef;
  /** Frontmatter keys the app doesn't know: kept exactly as they were. */
  props?: Record<string, unknown>;
  created: string;
  updated: string;
}

export type NoteType = "note" | "explanation" | "connection" | "answer" | "summary" | "quiz" | "exercises" | "session";

/** Notes: the learner's own (notes/**.md, in folders, named by their title). */
export interface Note extends DocBase {
  kind: "note";
  type: NoteType;
  /** Feynman explanations: the grade the tutor gave (0–100). */
  score?: number;
}

/** Concepts: one page per idea (concepts/<Name>.md); `related` links the concepts it builds on. */
export interface Concept extends DocBase {
  kind: "concept";
  /** One or two sentences. */
  summary: string;
  /** Where in the books it comes up. */
  sources: SourceRef[];
}

/** Flashcards (cards/*.md): the body is "## Front" and "## Back". Their memory state is replayed from
 * the review log, so a review never changes the file. */
export interface Card extends DocBase {
  kind: "card";
  type: "basic" | "cloze";
  front: string;
  back: string;
  /** The book it came from (or "general"). */
  deck: string;
  /** A figure shown with the answer. */
  figure?: string;
  suspended: boolean;
}

export type AnnotationType = "highlight" | "explain" | "define" | "ask" | "visualize" | "resources" | "comment";

/** What was made from a passage of a book, kept beside it (library/<book>/annotations/): a highlight,
 * or an answer a model wrote (an explanation, a figure, an animation…), shown in the margin. */
export interface Annotation extends DocBase {
  kind: "annotation";
  type: AnnotationType;
  source: SourceRef & { quote: string };
  /** Highlight colour (a theme token: yellow, green, blue, pink, purple). */
  color?: string;
  /** What the learner asked for ("why not just back up?"), if anything. */
  request?: string;
  status: "pending" | "ready" | "failed";
  error?: string;
  /** Who made it and how long it took. */
  model?: { provider: string; name: string; effort?: string; ms?: number };
}

/** One conversation with the tutor about a book (library/<book>/sessions/), kept to look back on: the
 * body is "## You" / "## Tutor" sections; `source` is the passage it was about, if one was pinned. */
export interface TutorSession extends DocBase {
  kind: "session";
  source: SourceRef;
  mode: "answer" | "socratic";
  messages: { role: "user" | "tutor"; text: string }[];
  /** The note made from it in a vault ("<vault id>/<path>"), kept as `vault-note`. */
  vaultNote?: string;
  /** The note made from it (Save as note), read live: the vault note while it's there, else the first of
   * its `related` links that is a note. */
  note?: { id?: string; title: string; vault?: string; path?: string };
}

/** A figure kept in the brain (figures/*.md): its scene spec in a ```figure block. */
export interface SavedFigure extends DocBase {
  kind: "figure";
  scene: unknown;
  request?: string;
}

export type Doc = Note | Concept | Card | Annotation | TutorSession | SavedFigure;
export type DocOf<K extends DocKind> = Extract<Doc, { kind: K }>;

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

/** Where the learner was when they asked (sent by the page; the server looks the rest up). */
export interface AgentContext {
  /** The page's route ("#/notes/n1a2b3c4", "#/review"). */
  route?: string;
  /** The document open on the page (a note, a concept). */
  docId?: string;
  /** A vault open on the page, and the note open in it. */
  vault?: string;
  vaultPath?: string;
  bookId?: string;
  /** In a book: the page (PDF, with the fraction down it) or the block (other formats). */
  at?: number;
  /** Text selected on the page. */
  selection?: string;
}

/** One request to the agent: a command it carries out in the vault, or a question it answers. */
export interface AgentRun {
  id: string;
  task: string;
  /** The conversation it belongs to (the first request's id); a follow-up sees the earlier turns. */
  thread?: string;
  /** Where the learner was, in a few words ("DDIA · ch. 5 Replication"). */
  where?: string;
  /** "fast": the quick model (Enter); "smart": the careful one (⌘Enter). */
  tier?: "fast" | "smart";
  /** It worked in this vault (its paths are the vault's); otherwise in the app's data vault. */
  vault?: string;
  status: "running" | "review" | "merged" | "discarded" | "failed" | "undone" | "done";
  started: string;
  ms?: number;
  provider?: string;
  model?: string;
  /** Files the run changed: A(dded), M(odified), D(eleted). */
  files?: { path: string; change: "A" | "M" | "D" }[];
  /** Why it waits for the learner's OK (a file it wrote can't be read). */
  review?: string[];
  /** The jj change it made (in a vault: the git commit): what Undo takes out again. */
  change?: string;
  /** That change's commit: its diff stays readable after an undo. */
  commit?: string;
  /** Its reply: what it did, or the answer. */
  answer?: string;
  /** The vault path of the main thing it made or changed, to open from the reply. */
  open?: string;
  /** The note an answer was kept in (in the run's vault, or in `keptIn`). */
  kept?: string;
  /** The vault it was kept in, for a run on the app's whole vault. */
  keptIn?: string;
  error?: string;
  activity?: string;
}
