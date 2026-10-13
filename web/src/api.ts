import { useEffect, useState } from "react";

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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `${response.status} ${response.statusText}`);
  return data as T;
}
const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const api = {
  status: () => call<Status>("/api/status"),
  books: () => call<Book[]>("/api/books"),
  book: (id: string) => call<Book>(`/api/books/${id}`),
  blocks: (id: string) => call<Block[]>(`/api/books/${id}/blocks`),
  demos: (id: string) => call<Demo[]>(`/api/books/${id}/demos`),
  jobs: (id: string) => call<Job[]>(`/api/books/${id}/jobs`),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<Book>("/api/books", { method: "POST", body: form });
  },
  deleteBook: (id: string) => call(`/api/books/${id}`, { method: "DELETE" }),
  generate: (id: string, chapterId: string, count?: number, mode: "scene" | "code" = "scene") => post<Job>(`/api/books/${id}/chapters/${chapterId}/generate`, { count, mode }),
  detectChapters: (id: string) => post<Job>(`/api/books/${id}/detect-chapters`),
  visualize: (id: string, input: { chapterId: string; text: string; request?: string; kind?: string; quality?: "quick" | "careful"; page?: number; block?: number }) => post<Demo>(`/api/books/${id}/visualize`, input),
  regenerate: (id: string, demoId: string, feedback?: string, quality?: "quick" | "careful") => post<Job>(`/api/books/${id}/demos/${demoId}/regenerate`, { feedback, quality }),
  craft: (id: string, demoId: string, feedback?: string) => post<Job>(`/api/books/${id}/demos/${demoId}/craft`, { feedback }),
  deleteDemo: (id: string, demoId: string) => call(`/api/books/${id}/demos/${demoId}`, { method: "DELETE" }),
  fileUrl: (id: string) => `/api/books/${id}/file`,
  pageUrl: (id: string, demoId: string, theme: string, version: string, predict = true) => `/api/books/${id}/demos/${demoId}/page?theme=${theme}&v=${encodeURIComponent(version)}${predict ? "" : "&predict=0"}`,
};

/** Position of a location in reading order (page + fraction, or block + fraction). */
export const posOf = (loc: Loc | undefined) => (!loc ? 0 : loc.page !== undefined ? loc.page + (loc.y ?? 0) : (loc.block ?? 0) + (loc.y ?? 0));

/** Fig numbers in reading order inside each chapter, same rule as the server. */
export function withFigs(book: Book, demos: Demo[]): Demo[] {
  const out = demos.map((d) => ({ ...d }));
  const groups = new Map<string, Demo[]>();
  for (const demo of out) {
    // a demo belongs to the chapter its anchor sits in
    if (demo.anchor.matched) {
      const at = posOf(demo.anchor);
      demo.chapterId = [...book.toc].reverse().find((entry) => posOf(entry.start) <= at + 1e-6)?.id || demo.chapterId;
    }
    if (!groups.has(demo.chapterId)) groups.set(demo.chapterId, []);
    groups.get(demo.chapterId)!.push(demo);
  }
  for (const [chapterId, list] of groups) {
    const index = book.toc.findIndex((entry) => entry.id === chapterId);
    list.sort((a, b) => posOf(a.anchor) - posOf(b.anchor) || a.createdAt.localeCompare(b.createdAt));
    list.forEach((demo, i) => (demo.fig = `Fig ${index + 1}.${i + 1}`));
  }
  return out.sort((a, b) => posOf(a.anchor) - posOf(b.anchor) || a.createdAt.localeCompare(b.createdAt));
}

/** Demos, annotations and jobs for a book, kept live over server-sent events. */
export function useBookLive(bookId: string) {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connected, setConnected] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    let alive = true;
    // Events that arrive while a snapshot is being fetched are kept and replayed on top of it,
    // so a slow snapshot can never undo a newer event, and nothing sent while we were away is lost.
    let inflight = 0;
    let buffered: (() => void)[] = [];
    let retry = 0 as unknown as ReturnType<typeof setTimeout>;
    const applyDemo = (demo: Demo) =>
      setDemos((list) => {
        const mine = list.find((d) => d.id === demo.id);
        if (mine && mine.updatedAt > demo.updatedAt) return list;
        return mine ? list.map((d) => (d.id === demo.id ? demo : d)) : [...list, demo];
      });
    const removeDemo = (id: string) => setDemos((list) => list.filter((d) => d.id !== id));
    const applyAnnotation = (a: Annotation) =>
      setAnnotations((list) => {
        const mine = list.find((x) => x.id === a.id);
        if (mine && mine.updated > a.updated) return list;
        return mine ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a];
      });
    const removeAnnotation = (id: string) => setAnnotations((list) => list.filter((x) => x.id !== id));
    const applyJob = (job: Job) => setJobs((list) => [job, ...list.filter((j) => j.id !== job.id)].slice(0, 40));
    const event = (apply: () => void) => {
      apply();
      if (inflight) buffered.push(apply);
    };
    const refresh = async () => {
      clearTimeout(retry);
      inflight++;
      try {
        const [demoList, jobList, annotationList] = await Promise.all([api.demos(bookId), api.jobs(bookId), learn.annotations(bookId)]);
        if (!alive) return;
        setDemos(demoList);
        setJobs(jobList);
        setAnnotations(annotationList);
        for (const apply of buffered) apply();
      } catch {
        if (alive) retry = setTimeout(refresh, 3000);
      } finally {
        inflight--;
        if (!inflight) buffered = [];
      }
    };
    const source = new EventSource(`/api/books/${bookId}/events`);
    refresh();
    let opened = false;
    source.onopen = () => {
      setConnected(true);
      // the first open follows the snapshot above; every later one is a reconnect that may have missed events
      if (opened) refresh();
      opened = true;
    };
    source.onerror = () => setConnected(false);
    source.addEventListener("demo", (e) => {
      const demo = JSON.parse((e as MessageEvent).data) as Demo;
      event(() => applyDemo(demo));
    });
    source.addEventListener("demo-removed", (e) => {
      const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
      event(() => removeDemo(id));
    });
    source.addEventListener("annotation", (e) => {
      const a = JSON.parse((e as MessageEvent).data) as Annotation;
      event(() => applyAnnotation(a));
    });
    source.addEventListener("annotation-removed", (e) => {
      const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
      event(() => removeAnnotation(id));
    });
    source.addEventListener("book", (e) => setBook(JSON.parse((e as MessageEvent).data) as Book));
    source.addEventListener("job", (e) => {
      const job = JSON.parse((e as MessageEvent).data) as Job;
      event(() => applyJob(job));
    });
    return () => {
      alive = false;
      clearTimeout(retry);
      source.close();
    };
  }, [bookId]);
  return { demos, setDemos, annotations, setAnnotations, jobs, connected, book };
}

export function useTheme(): ["light" | "dark", (t: "light" | "dark") => void] {
  const initial = (() => {
    try {
      const saved = localStorage.getItem("classroom-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "light";
  })();
  const [theme, setTheme] = useState<"light" | "dark">(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("classroom-theme", theme);
    } catch {}
  }, [theme]);
  return [theme, setTheme];
}

/* ---------------- the learning platform ---------------- */

export interface SourceRef {
  bookId: string;
  chapterId?: string;
  page?: number;
  y?: number;
  block?: number;
  quote?: string;
}
export type NoteType = "note" | "highlight" | "explanation" | "connection" | "answer" | "summary";
export interface Note {
  id: string;
  /** Vault-relative path: the file name is the title. */
  path: string;
  type: NoteType;
  title: string;
  body: string;
  tags: string[];
  aliases: string[];
  related: string[];
  concepts: string[];
  source?: SourceRef;
  score?: number;
  props?: Record<string, unknown>;
  created: string;
  updated: string;
}
export interface NoteDetail extends Note {
  backlinks: { from: string; path: string; title: string; kind: string; line: number; context: string }[];
  mentions: { path: string; title: string; context: string }[];
  outgoing: { target: string; kind: string; to: string | null; path?: string; title: string }[];
}
export type AnnotationKind = "highlight" | "explain" | "define" | "ask" | "visualize" | "resources" | "comment";
export interface Rect {
  p?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Anchor {
  page?: number;
  block?: number;
  blockEnd?: number;
  quote: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
  rects?: Rect[];
  y?: number;
  md?: { file: string; line: number; score?: number };
}
export interface Annotation {
  id: string;
  kind: AnnotationKind;
  bookId: string;
  path: string;
  chapterId?: string;
  anchor: Anchor;
  color?: string;
  request?: string;
  status: "pending" | "ready" | "failed";
  error?: string;
  model?: { provider: string; name: string; effort?: string; ms?: number };
  body: string;
  title?: string;
  tags: string[];
  created: string;
  updated: string;
}
export interface Resolved {
  node: string;
  kind: "note" | "concept" | "book" | "annotation" | "figure" | "attachment";
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
export interface Profile {
  name: string;
  role: "student" | "professor" | "professional" | "curious";
  goals: string;
  background: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
  styles: { visual: number; reader: number; doer: number };
  interests: string[];
  dailyNew: number;
  retention: number;
  notes: string;
  onboarded: boolean;
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
export interface Connection {
  kind: "today" | "your-work" | "across";
  title: string;
  body: string;
  concepts: string[];
}
export interface SavedFigure {
  id: string;
  title: string;
  scene: unknown;
  source?: SourceRef;
  request?: string;
  created: string;
}
export interface GraphData {
  nodes: { id: string; kind: "book" | "concept" | "note" | "annotation"; label: string; mastery: number | null; size: number; detail?: string; bookId?: string; path?: string; created: number }[];
  edges: { from: string; to: string; kind: string }[];
}
export interface SearchHit {
  kind: "note" | "concept" | "card" | "book" | "annotation";
  id: string;
  title: string;
  snippet: string;
  score: number;
  bookId?: string;
  loc?: { page?: number; block?: number };
}
export interface Activity {
  ts: number;
  type: string;
  bookId?: string;
  concepts?: string[];
  text: string;
  data?: Record<string, unknown>;
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
  books: { id: string; title: string; author?: string; format: string; lastTs: number; position: number | null; chapter: string | null }[];
  suggestions: { kind: string; title: string; detail: string; action: Record<string, string> }[];
  profile: Profile;
  summary: string;
}
export interface SettingsInfo {
  settings: { provider: "auto" | "codex" | "claude"; codex: Tier; claude: Tier; concurrency: number };
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

const put = <T,>(path: string, body?: unknown) => call<T>(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const del = (path: string) => call(path, { method: "DELETE" });

export const learn = {
  profile: () => call<Profile>("/api/profile"),
  saveProfile: (p: Partial<Profile>) => put<Profile>("/api/profile", p),
  settings: () => call<SettingsInfo>("/api/settings"),
  saveSettings: (s: Partial<SettingsInfo["settings"]>) => put<{ settings: SettingsInfo["settings"]; active: string }>("/api/settings", s),
  vault: () => call<{ notes: number; concepts: number; cards: number; figures: number; reviews: number; git: boolean; path: string; history: { hash: string; when: string; subject: string }[] }>("/api/vault"),
  today: () => call<Today>("/api/today"),
  journey: () => call<Journey>("/api/journey"),
  graph: () => call<GraphData>("/api/graph"),
  search: (q: string) => call<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  readPing: (body: { bookId: string; chapter?: string; chapterId?: string; position?: number; page?: number }) => post("/api/activity", { type: "read", ...body }),
  notes: (filter: { type?: string; book?: string; concept?: string; folder?: string } = {}) => call<Note[]>(`/api/notes?${new URLSearchParams(filter as Record<string, string>)}`),
  note: (id: string) => call<NoteDetail>(`/api/notes/${id}`),
  createNote: (n: Partial<Note> & { folder?: string }) => post<Note>("/api/notes", n),
  updateNote: (id: string, n: Partial<Note> & { folder?: string }) => put<Note>(`/api/notes/${id}`, n),
  appendToNote: (id: string, markdown: string) => post<Note>(`/api/notes/${id}/append`, { markdown }),
  deleteNote: (id: string) => del(`/api/notes/${id}`),
  bookNote: (bookId: string) => post<Note>(`/api/books/${bookId}/note`),
  tree: () => call<{ notes: { id: string; path: string; title: string; type: string; updated: string }[]; folders: string[] }>("/api/vault/tree"),
  linkTargets: () => call<{ title: string; kind: string; path?: string; detail?: string }[]>("/api/links/targets"),
  resolve: (target: string, sub?: string) => call<Resolved>(`/api/links/resolve?target=${encodeURIComponent(target)}${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`),
  attach: (data: string, name?: string) => post<{ path: string; name: string }>("/api/attachments", { data, name }),
  transcribe: (path: string) => post<{ markdown: string; ms: number }>("/api/transcribe", { path }),
  annotations: (bookId: string) => call<Annotation[]>(`/api/books/${bookId}/annotations`),
  annotation: (id: string) => call<Annotation>(`/api/annotations/${id}`),
  annotate: (bookId: string, input: { kind: AnnotationKind; anchor: Anchor; request?: string; color?: string; body?: string; quality?: "quick" | "careful"; sceneKind?: string }) => post<Annotation>(`/api/books/${bookId}/annotations`, input),
  retryAnnotation: (id: string) => post<Annotation>(`/api/annotations/${id}/retry`),
  updateAnnotation: (id: string, patch: Partial<Pick<Annotation, "color" | "body" | "request" | "tags" | "title" | "kind">>) => call<Annotation>(`/api/annotations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }),
  deleteAnnotation: (id: string) => del(`/api/annotations/${id}`),
  followUp: (id: string, question: string) => post<Annotation>(`/api/annotations/${id}/followup`, { question }),
  redraw: (id: string, notes?: string, quality?: "quick" | "careful") => post<Annotation>(`/api/annotations/${id}/redraw`, { notes, quality }),
  toNote: (bookId: string, input: { annotationId?: string; anchor?: Anchor; noteId?: string; mode?: "reference" | "passage" | "embed"; comment?: string }) => post<{ note: Note; annotation: Annotation; markdown: string }>(`/api/books/${bookId}/to-note`, input),
  concepts: () => call<Concept[]>("/api/concepts"),
  concept: (id: string) => call<ConceptDetail>(`/api/concepts/${id}`),
  createConcept: (c: { name: string; summary?: string }) => post<Concept>("/api/concepts", c),
  updateConcept: (id: string, c: Partial<Concept>) => put<Concept>(`/api/concepts/${id}`, c),
  deleteConcept: (id: string) => del(`/api/concepts/${id}`),
  extractConcepts: (bookId: string, chapterId: string) => post<Concept[]>(`/api/books/${bookId}/chapters/${chapterId}/concepts`),
  cards: (filter: { deck?: string; concept?: string } = {}) => call<CardView[]>(`/api/cards?${new URLSearchParams(filter as Record<string, string>)}`),
  saveCards: (cards: Partial<CardView>[]) => post<CardView[]>("/api/cards", { cards }),
  updateCard: (id: string, c: Partial<CardView>) => put<CardView>(`/api/cards/${id}`, c),
  deleteCard: (id: string) => del(`/api/cards/${id}`),
  draftCards: (input: { passage: string; source?: SourceRef; focus?: string; count?: number }) => post<{ cards: DraftCard[]; concepts: { name: string; summary: string }[] }>("/api/cards/draft", input),
  saveDrafts: (input: { drafts: DraftCard[]; deck?: string; source?: SourceRef; concepts?: { name: string; summary: string }[] }) => post<CardView[]>("/api/cards/save-drafts", input),
  decks: () => call<{ name: string; count: number }[]>("/api/decks"),
  queue: (deck?: string) => call<{ cards: CardView[]; due: number; fresh: number; learning: number; total: number }>(`/api/review${deck ? `?deck=${encodeURIComponent(deck)}` : ""}`),
  rate: (id: string, rating: 1 | 2 | 3 | 4, took?: number) => post<CardView>(`/api/review/${id}`, { rating, took }),
  quiz: (input: { bookId?: string; chapterId?: string; passage?: string; source?: SourceRef; mode: "check" | "pretest" | "review"; count?: number }) => post<Quiz>("/api/quiz", input),
  gradeShort: (items: { question: string; ideal: string; answer: string }[]) => post<{ score: number; feedback: string }[]>("/api/quiz/grade", { items }),
  recordQuiz: (input: { title: string; mode: string; bookId?: string; score: number; total: number; concepts: string[] }) => post("/api/quiz/record", input),
  explain: (input: { concept: string; explanation: string; passage?: string; source?: SourceRef }) => post<ExplainFeedback>("/api/explain", input),
  saveExplanation: (input: { concept: string; explanation: string; score: number; feedback: string; source?: SourceRef }) => post<Note>("/api/explain/save", input),
  connect: (input: { passage: string; source?: SourceRef; question?: string }) => post<Connection[]>("/api/connect", input),
  tutor: (input: { messages: { role: "user" | "tutor"; text: string }[]; passage?: string; source?: SourceRef; mode?: "answer" | "socratic" }) => post<{ reply: string }>("/api/tutor", input),
  ask: (question: string) => post<{ answer: string; sources: { path: string; quote: string }[]; ms: number }>("/api/ask", { question }),
  saveAnswer: (input: { question: string; answer: string; sources: { path: string; quote: string }[] }) => post<Note>("/api/ask/save", input),
  figures: () => call<SavedFigure[]>("/api/figures"),
  figure: (id: string) => call<SavedFigure>(`/api/figures/${id}`),
  makeFigure: (input: { passage: string; request?: string; kind?: string; quality?: "quick" | "careful"; source?: SourceRef; save?: boolean }) => post<SavedFigure>("/api/figures", input),
  deleteFigure: (id: string) => del(`/api/figures/${id}`),
  keepFigure: (input: { scene: unknown; title?: string; source?: SourceRef }) => post<SavedFigure>("/api/figures", input),
  booksLite: () => call<{ id: string; title: string; author?: string; toc: { id: string; title: string }[] }[]>("/api/books-lite"),
};

/** Navigates to a hash route. */
export const go = (route: string) => {
  location.hash = route.startsWith("#") ? route : `#${route}`;
};

/** Opens what a [[link]] points at; a link to nothing yet creates that note (as Obsidian does). */
export async function openLink(target: string, sub?: string) {
  try {
    const r = await learn.resolve(target, sub);
    if (r.kind === "note") return go(`#/notes/${r.id}`);
    if (r.kind === "concept") return go(`#/brain/concept/${r.id}`);
    if (r.kind === "book") return go(`#/book/${r.id}${r.page ? `?at=${r.page}` : ""}`);
    if (r.kind === "annotation" && r.bookId && r.anchor) {
      const at = r.anchor.page !== undefined ? r.anchor.page + (r.anchor.y ?? 0) : (r.anchor.block ?? 0);
      return go(`#/book/${r.bookId}?at=${at.toFixed(3)}&focus=${r.id}`);
    }
    if (r.kind === "figure") return go("#/brain/figures");
    if (r.kind === "attachment" && r.path) return window.open(`/api/vault/attachment?path=${encodeURIComponent(r.path)}`, "_blank", "noopener");
  } catch {
    if (!target.trim() || target.includes("/")) return;
    const note = await learn.createNote({ title: target.trim(), body: "" });
    go(`#/notes/${note.id}`);
  }
}

/** A book location as a reader link. */
export const bookLink = (ref: Partial<SourceRef> & { bookId?: string }) => (ref.bookId ? `#/book/${ref.bookId}${ref.page !== undefined ? `?at=${(ref.page + (ref.y ?? 0)).toFixed(3)}` : ref.block !== undefined ? `?at=${ref.block}` : ""}` : "#/library");
