/* The API for everything else the learner does: profile and settings, what each kind of document does
 * beyond being one (an annotation's answer, a card's review, a concept's page, a session's note…), the
 * study tools, links, search, the journey, and agents. (Documents themselves: docs.ts.) */
import { call, post, put } from "./client";
import type { Version } from "./docs";
import type {
  AgentContext,
  AgentRun,
  Anchor,
  Annotation,
  AnnotationType,
  CardView,
  Concept,
  ConceptDetail,
  ConceptView,
  DraftCard,
  ExplainFeedback,
  GraphData,
  IdeaConnection,
  Journey,
  Note,
  Profile,
  Quiz,
  Resolved,
  SavedFigure,
  SearchHit,
  SettingsInfo,
  SourceRef,
  SuggestedLink,
  Today,
  TutorSession,
} from "./types";

export type { Version } from "./docs";

export const learn = {
  profile: () => call<Profile>("/api/profile"),
  saveProfile: (p: Partial<Profile>) => put<Profile>("/api/profile", p),
  settings: () => call<SettingsInfo>("/api/settings"),
  saveSettings: (s: Partial<SettingsInfo["settings"]>) =>
    put<{ settings: SettingsInfo["settings"]; active: string }>("/api/settings", s),
  vault: () =>
    call<{
      notes: number;
      concepts: number;
      annotations: number;
      cards: number;
      figures: number;
      reviews: number;
      path: string;
      history: Version[];
    }>("/api/vault"),
  today: () => call<Today>("/api/today"),
  journey: () => call<Journey>("/api/journey"),
  graph: () => call<GraphData>("/api/graph"),
  search: (q: string) => call<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  readPing: (body: { bookId: string; chapter?: string; chapterId?: string; position?: number; page?: number }) =>
    post("/api/activity", { type: "read", ...body }),
  createFolder: (path: string) => post<{ folder: string }>("/api/folders", { path }),
  moveFolder: (from: string, to: string) => post<{ folder: string }>("/api/folders/move", { from, to }),
  deleteFolder: (path: string) => post<{ notes: number }>("/api/folders/delete", { path }),
  bookNote: (bookId: string) => post<Note>(`/api/books/${bookId}/note`),
  tree: () =>
    call<{ notes: { id: string; path: string; title: string; type: string; updated: string }[]; folders: string[] }>(
      "/api/vault/tree",
    ),
  linkTargets: () => call<{ title: string; kind: string; path?: string; detail?: string }[]>("/api/links/targets"),
  resolve: (target: string, sub?: string) =>
    call<Resolved>(
      `/api/links/resolve?target=${encodeURIComponent(target)}${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`,
    ),
  attach: (data: string, name?: string) => post<{ path: string; name: string }>("/api/attachments", { data, name }),
  transcribe: (path: string) => post<{ markdown: string; ms: number }>("/api/transcribe", { path }),
  annotations: (bookId: string) => call<Annotation[]>(`/api/books/${bookId}/annotations`),
  annotate: (
    bookId: string,
    input: {
      type: AnnotationType;
      anchor: Anchor;
      request?: string;
      color?: string;
      body?: string;
      quality?: "quick" | "careful";
      sceneKind?: string;
    },
  ) => post<Annotation>(`/api/books/${bookId}/annotations`, input),
  retryAnnotation: (id: string) => post<Annotation>(`/api/annotations/${id}/retry`),
  followUp: (id: string, question: string) => post<Annotation>(`/api/annotations/${id}/followup`, { question }),
  redraw: (id: string, notes?: string, quality?: "quick" | "careful") =>
    post<Annotation>(`/api/annotations/${id}/redraw`, { notes, quality }),
  toNote: (
    bookId: string,
    input: {
      annotationId?: string;
      anchor?: Anchor;
      noteId?: string;
      mode?: "reference" | "passage" | "embed";
      comment?: string;
    },
  ) => post<{ note: Note; annotation: Annotation; markdown: string }>(`/api/books/${bookId}/to-note`, input),
  connections: (path?: string) =>
    call<SuggestedLink[]>(`/api/connections${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  suggestConnections: (path?: string) =>
    post<{ suggested: SuggestedLink[]; ms: number }>("/api/connections/suggest", { path }),
  decideConnection: (id: string, decision: "accept" | "reject" | "remove") =>
    post<SuggestedLink>(`/api/connections/${id}/${decision}`),
  agents: () => call<AgentRun[]>("/api/agents"),
  runAgent: (input: { task: string; context?: AgentContext; after?: string; tier?: "fast" | "smart" }) =>
    post<AgentRun>("/api/agents", input),
  agentAction: (id: string, action: "approve" | "discard" | "undo" | "keep") =>
    post<AgentRun>(`/api/agents/${id}/${action}`),
  agentDiff: (id: string) => call<{ diff: string }>(`/api/agents/${id}/diff`),
  concepts: () => call<ConceptView[]>("/api/concepts"),
  concept: (id: string) => call<ConceptDetail>(`/api/concepts/${id}`),
  extractConcepts: (bookId: string, chapterId: string) =>
    post<Concept[]>(`/api/books/${bookId}/chapters/${chapterId}/concepts`),
  cards: (filter: { deck?: string; concept?: string } = {}) =>
    call<CardView[]>(`/api/cards?${new URLSearchParams(filter as Record<string, string>)}`),
  saveCards: (cards: Partial<CardView>[]) => post<CardView[]>("/api/cards", { cards }),
  draftCards: (input: { passage: string; source?: SourceRef; focus?: string; count?: number }) =>
    post<{ cards: DraftCard[]; concepts: { name: string; summary: string }[] }>("/api/cards/draft", input),
  saveDrafts: (input: {
    drafts: DraftCard[];
    deck?: string;
    source?: SourceRef;
    concepts?: { name: string; summary: string }[];
  }) => post<CardView[]>("/api/cards/save-drafts", input),
  decks: () => call<{ name: string; count: number }[]>("/api/decks"),
  queue: (deck?: string) =>
    call<{ cards: CardView[]; due: number; fresh: number; learning: number; total: number }>(
      `/api/review${deck ? `?deck=${encodeURIComponent(deck)}` : ""}`,
    ),
  rate: (id: string, rating: 1 | 2 | 3 | 4, took?: number) => post<CardView>(`/api/review/${id}`, { rating, took }),
  quiz: (input: {
    bookId?: string;
    chapterId?: string;
    passage?: string;
    source?: SourceRef;
    mode: "check" | "pretest" | "review";
    count?: number;
  }) => post<Quiz>("/api/quiz", input),
  gradeShort: (items: { question: string; ideal: string; answer: string }[]) =>
    post<{ score: number; feedback: string }[]>("/api/quiz/grade", { items }),
  recordQuiz: (input: {
    title: string;
    mode: string;
    bookId?: string;
    score: number;
    total: number;
    concepts: string[];
    /** One per question that was scored, by concept name. */
    answers: { concept: string; score: number }[];
  }) => post("/api/quiz/record", input),
  explain: (input: { concept: string; explanation: string; passage?: string; source?: SourceRef }) =>
    post<ExplainFeedback>("/api/explain", input),
  saveExplanation: (input: {
    concept: string;
    explanation: string;
    score: number;
    feedback: string;
    source?: SourceRef;
  }) => post<Note>("/api/explain/save", input),
  connect: (input: { passage: string; source?: SourceRef; question?: string }) =>
    post<IdeaConnection[]>("/api/connect", input),
  /** The tutor's reply; the conversation is saved as a session of the book (`sessionId` carries one on). */
  tutor: (input: {
    messages: { role: "user" | "tutor"; text: string }[];
    passage?: string;
    source?: SourceRef;
    mode?: "answer" | "socratic";
    sessionId?: string;
  }) => post<{ reply: string; session: TutorSession | null }>("/api/tutor", input),
  sessions: (bookId: string) => call<TutorSession[]>(`/api/books/${bookId}/sessions`),
  /** Writes a session up as a note of the learner's own (a model call, ~15 s). */
  sessionNote: (id: string) => post<{ note: Note; session: TutorSession }>(`/api/sessions/${id}/note`),
  makeFigure: (input: {
    passage: string;
    request?: string;
    kind?: string;
    quality?: "quick" | "careful";
    source?: SourceRef;
    save?: boolean;
  }) => post<SavedFigure>("/api/figures", input),
  keepFigure: (input: { scene: unknown; title?: string; source?: SourceRef }) =>
    post<SavedFigure>("/api/figures", input),
  booksLite: () =>
    call<{ id: string; title: string; author?: string; toc: { id: string; title: string }[] }[]>("/api/books-lite"),
};
