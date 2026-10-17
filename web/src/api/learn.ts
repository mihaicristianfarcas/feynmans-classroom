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
  /** The graph with one vault's notes (and the app's items), or with every vault's. */
  graph: (vault?: string) =>
    call<GraphData>(vault === undefined ? "/api/graph" : `/api/graph?vault=${encodeURIComponent(vault)}`),
  search: (q: string) => call<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`),
  readPing: (body: { bookId: string; chapter?: string; chapterId?: string; position?: number; page?: number }) =>
    post("/api/activity", { type: "read", ...body }),
  /** The note a book's reading writes into in `vault` (made on first use). */
  vaultBookNote: (bookId: string, vault: string) =>
    post<{ vault: string; path: string; title: string }>(
      `/api/books/${bookId}/note?vault=${encodeURIComponent(vault)}`,
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
      /** The vault note to add to (the book's note in the first vault by default). */
      vault?: string;
      path?: string;
      mode?: "reference" | "passage" | "embed";
      comment?: string;
    },
  ) =>
    post<{ vaultNote: { vault: string; path: string }; annotation: Annotation; markdown: string }>(
      `/api/books/${bookId}/to-note`,
      input,
    ),
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
  }) => post("/api/quiz/record", input),
  explain: (input: { concept: string; explanation: string; passage?: string; source?: SourceRef }) =>
    post<ExplainFeedback>("/api/explain", input),
  saveExplanation: (input: {
    concept: string;
    explanation: string;
    score: number;
    feedback: string;
    source?: SourceRef;
    vault?: string;
  }) => post<{ vault: string; path: string; title: string }>("/api/explain/save", input),
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
  /** Writes a session up as a note in `vault` (the first vault without one). */
  sessionNote: (id: string, vault?: string) =>
    post<{ vaultNote: { vault: string; path: string; title: string }; session: TutorSession }>(
      `/api/sessions/${id}/note${vault ? `?vault=${encodeURIComponent(vault)}` : ""}`,
    ),
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
