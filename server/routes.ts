/* The learning platform's API: profile and settings, the second brain (notes, concepts, cards,
 * figures, graph, search, asking the vault), the study tools and the journey. */
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { codexStatus } from "./codex.ts";
import { publish, subscribe } from "./events.ts";
import { askVault, journey, knowledgeGraph, saveAnswer, search, today } from "./learn/brain.ts";
import { deleteCard, draftCards, rateCard, reviewQueue, saveCard, saveDrafts, viewCard } from "./learn/cards.ts";
import { deleteConcept, extractConcepts, saveConcept, upsertConcept } from "./learn/concepts.ts";
import { conceptMastery } from "./learn/context.ts";
import { connect, gradeExplanation, gradeShortAnswers, makeQuiz, recordQuiz, saveExplanation, tutor } from "./learn/study.ts";
import { llmLoad } from "./llm.ts";
import { standaloneFigure } from "./scene/figures.ts";
import { activeProvider, claudeStatus, getSettings, saveSettings } from "./settings.ts";
import { getBook, listBooks } from "./store.ts";
import { cards, changed, concepts, figures, getProfile, logActivity, notes, now, saveProfile, shortId, vaultHistory, vaultStats } from "./vault/index.ts";
import { writeSourcePage } from "./vault/library.ts";
import { validateScene } from "../shared/scene/validate.ts";
import type { Note } from "../shared/vault-types.ts";

const body = async <T>(c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) || {}) as T;

/* reading sessions: pings while the reader is open become one activity entry per sitting */
const sessions = new Map<string, { start: number; last: number; minutes: number; chapter?: string; chapterId?: string; position?: number; pages: Set<number>; timer?: ReturnType<typeof setTimeout> }>();
function flushSession(bookId: string) {
  const s = sessions.get(bookId);
  if (!s) return;
  sessions.delete(bookId);
  clearTimeout(s.timer);
  if (s.minutes < 1) return;
  const book = getBook(bookId);
  logActivity({ type: "read", bookId, ts: s.last, text: `Read ${Math.round(s.minutes)} min of ${book?.title || "a book"}${s.chapter ? ` (${s.chapter})` : ""}`, data: { minutes: Math.round(s.minutes), chapter: s.chapter, chapterId: s.chapterId, position: s.position, pages: s.pages.size } });
}
process.on("exit", () => [...sessions.keys()].forEach(flushSession));

export function registerRoutes(app: Hono) {
  /* ---------- profile and settings ---------- */
  app.get("/api/profile", (c) => c.json(getProfile()));
  app.put("/api/profile", async (c) => c.json(saveProfile(await body(c))));
  app.get("/api/settings", (c) => {
    const settings = getSettings();
    return c.json({ settings, active: activeProvider(settings), codex: codexStatus(), claude: claudeStatus(), load: llmLoad() });
  });
  app.put("/api/settings", async (c) => {
    const settings = saveSettings(await body(c));
    return c.json({ settings, active: activeProvider(settings) });
  });
  app.get("/api/vault", (c) => c.json({ ...vaultStats(), history: vaultHistory(20) }));

  /* ---------- home and journey ---------- */
  app.get("/api/today", (c) => c.json(today()));
  app.get("/api/journey", (c) => c.json(journey()));
  app.get("/api/graph", (c) => c.json(knowledgeGraph()));
  app.get("/api/search", (c) => c.json(search(c.req.query("q") || "")));
  app.post("/api/activity", async (c) => {
    const b = await body<{ type: string; bookId: string; chapter?: string; chapterId?: string; position?: number; page?: number }>(c);
    if (b.type !== "read" || !b.bookId) return c.json({ ok: false }, 400);
    const at = Date.now();
    let s = sessions.get(b.bookId);
    if (s && (b.chapterId !== s.chapterId || at - s.last > 6 * 60000)) {
      flushSession(b.bookId);
      s = undefined;
    }
    if (!s) {
      s = { start: at, last: at, minutes: 0, pages: new Set() };
      sessions.set(b.bookId, s);
    } else s.minutes += Math.min(1.5, (at - s.last) / 60000);
    Object.assign(s, { last: at, chapter: b.chapter, chapterId: b.chapterId, position: b.position });
    if (b.page) s.pages.add(b.page);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => flushSession(b.bookId), 6 * 60000);
    return c.json({ ok: true, minutes: Math.round(s.minutes) });
  });

  /* ---------- notes ---------- */
  app.get("/api/notes", (c) => {
    const { type, book, concept } = c.req.query();
    const list = notes
      .list()
      .filter((n) => (!type || n.type === type) && (!book || n.source?.bookId === book) && (!concept || n.concepts.includes(concept)))
      .sort((a, b) => b.updated.localeCompare(a.updated));
    return c.json(list);
  });
  app.get("/api/notes/:id", (c) => {
    const note = notes.get(c.req.param("id"));
    if (!note) return c.json({ error: "not found" }, 404);
    const backlinks = notes.list().filter((n) => n.id !== note.id && n.body.toLowerCase().includes(`[[${note.title.toLowerCase()}`));
    return c.json({ ...note, backlinks: backlinks.map((n) => ({ id: n.id, title: n.title, type: n.type })) });
  });
  app.post("/api/notes", async (c) => {
    const b = await body<Partial<Note>>(c);
    const concepts_ = (b.concepts || []).map((name) => upsertConcept({ name, source: b.source }).id);
    const note: Note = { id: shortId("n"), type: b.type || "note", title: (b.title || "Untitled").trim().slice(0, 140), body: b.body || "", tags: b.tags || [], concepts: concepts_, source: b.source, score: b.score, created: now(), updated: now() };
    notes.save(note, note.title);
    changed(`note ${note.title}`);
    logActivity({ type: note.type === "highlight" ? "highlight" : note.type === "connection" ? "connect" : "note", bookId: note.source?.bookId, concepts: note.concepts, text: `${note.type === "highlight" ? "Highlighted" : "Wrote"}: ${note.title}` });
    if (note.source?.bookId) {
      const book = getBook(note.source.bookId);
      if (book) writeSourcePage(book);
    }
    return c.json(note);
  });
  app.put("/api/notes/:id", async (c) => {
    const note = notes.get(c.req.param("id"));
    if (!note) return c.json({ error: "not found" }, 404);
    const b = await body<Partial<Note>>(c);
    Object.assign(note, { ...b, id: note.id, created: note.created, updated: now() });
    if (b.concepts) note.concepts = b.concepts.map((x) => concepts.get(x)?.id || upsertConcept({ name: x }).id);
    notes.save(note);
    changed(`note ${note.title}`);
    return c.json(note);
  });
  app.delete("/api/notes/:id", (c) => {
    notes.remove(c.req.param("id"));
    changed("delete note");
    return c.json({ ok: true });
  });

  /* ---------- concepts ---------- */
  app.get("/api/concepts", (c) => {
    const at = Date.now();
    return c.json(
      concepts
        .list()
        .map((x) => ({ ...x, mastery: conceptMastery(x.id, at), cards: cards.list().filter((k) => k.concepts.includes(x.id)).length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  });
  app.get("/api/concepts/:id", (c) => {
    const concept = concepts.get(c.req.param("id"));
    if (!concept) return c.json({ error: "not found" }, 404);
    const linkedCards = cards.list().filter((k) => k.concepts.includes(concept.id)).map((k) => viewCard(k));
    const linkedNotes = notes.list().filter((n) => n.concepts.includes(concept.id) || n.body.toLowerCase().includes(`[[${concept.id}`) || n.body.toLowerCase().includes(`[[${concept.name.toLowerCase()}`));
    const related = concept.related.map((id) => concepts.get(id)).filter(Boolean).map((r) => ({ id: r!.id, name: r!.name, mastery: conceptMastery(r!.id) }));
    const backlinks = concepts.list().filter((x) => x.related.includes(concept.id)).map((r) => ({ id: r.id, name: r.name, mastery: conceptMastery(r.id) }));
    const sources = concept.sources.map((s) => ({ ...s, title: getBook(s.bookId)?.title }));
    return c.json({ ...concept, sources, mastery: conceptMastery(concept.id), cards: linkedCards, notes: linkedNotes, related, backlinks });
  });
  app.post("/api/concepts", async (c) => {
    const b = await body<{ name: string; summary?: string; body?: string; related?: string[] }>(c);
    if (!b.name?.trim()) return c.json({ error: "name the concept" }, 400);
    return c.json(upsertConcept(b));
  });
  app.put("/api/concepts/:id", async (c) => c.json(saveConcept(c.req.param("id"), await body(c))));
  app.delete("/api/concepts/:id", (c) => {
    deleteConcept(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/books/:id/chapters/:chapterId/concepts", async (c) => {
    const list = await extractConcepts(c.req.param("id"), c.req.param("chapterId"));
    const book = getBook(c.req.param("id"));
    if (book) writeSourcePage(book);
    publish("global", { type: "book", data: { concepts: list.length } });
    return c.json(list);
  });

  /* ---------- cards and review ---------- */
  app.get("/api/cards", (c) => {
    const { deck, concept } = c.req.query();
    return c.json(
      cards
        .list()
        .filter((k) => (!deck || k.deck === deck) && (!concept || k.concepts.includes(concept)))
        .sort((a, b) => b.created.localeCompare(a.created))
        .map((k) => viewCard(k)),
    );
  });
  app.post("/api/cards", async (c) => {
    const b = await body<{ cards?: Parameters<typeof saveCard>[0][] } & Partial<Parameters<typeof saveCard>[0]>>(c);
    const list = b.cards || [b as Parameters<typeof saveCard>[0]];
    const saved = list.filter((x) => x.front?.trim() && x.back?.trim()).map(saveCard);
    if (saved.length) logActivity({ type: "card", text: `Made ${saved.length} card${saved.length === 1 ? "" : "s"}`, concepts: [...new Set(saved.flatMap((k) => k.concepts))] });
    return c.json(saved);
  });
  app.put("/api/cards/:id", async (c) => {
    const card = cards.get(c.req.param("id"));
    if (!card) return c.json({ error: "not found" }, 404);
    const b = await body<Partial<Parameters<typeof saveCard>[0]>>(c);
    return c.json(saveCard({ ...card, ...b, id: card.id, front: b.front ?? card.front, back: b.back ?? card.back }));
  });
  app.delete("/api/cards/:id", (c) => {
    deleteCard(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/cards/draft", async (c) => c.json(await draftCards(await body(c))));
  app.post("/api/cards/save-drafts", async (c) => {
    const b = await body<{ drafts: { front: string; back: string; kind?: "basic" | "cloze"; concept?: string }[]; deck?: string; source?: Note["source"]; concepts?: { name: string; summary: string }[] }>(c);
    const deck = b.deck || (b.source?.bookId ? getBook(b.source.bookId)?.title : undefined) || "general";
    return c.json(saveDrafts(b.drafts || [], { deck, source: b.source, concepts: b.concepts }));
  });
  app.get("/api/review", (c) => c.json(reviewQueue({ deck: c.req.query("deck") || undefined })));
  app.post("/api/review/:id", async (c) => {
    const b = await body<{ rating: 1 | 2 | 3 | 4; took?: number }>(c);
    return c.json(rateCard(c.req.param("id"), b.rating, b.took));
  });
  app.get("/api/decks", (c) => {
    const decks = new Map<string, number>();
    for (const k of cards.list()) decks.set(k.deck, (decks.get(k.deck) || 0) + 1);
    return c.json([...decks].map(([name, count]) => ({ name, count })));
  });

  /* ---------- study tools ---------- */
  app.post("/api/quiz", async (c) => c.json(await makeQuiz(await body(c))));
  app.post("/api/quiz/grade", async (c) => c.json(await gradeShortAnswers((await body<{ items: { question: string; ideal: string; answer: string }[] }>(c)).items || [])));
  app.post("/api/quiz/record", async (c) => c.json(recordQuiz(await body(c))));
  app.post("/api/explain", async (c) => {
    const b = await body<{ concept: string; explanation: string; passage?: string; source?: Note["source"] }>(c);
    if (!b.explanation?.trim() || b.explanation.trim().split(/\s+/).length < 8) return c.json({ error: "Write at least a couple of sentences in your own words." }, 400);
    return c.json(await gradeExplanation(b));
  });
  app.post("/api/explain/save", async (c) => c.json(saveExplanation(await body(c))));
  app.post("/api/connect", async (c) => c.json(await connect(await body(c))));
  app.post("/api/tutor", async (c) => c.json({ reply: await tutor(await body(c)) }));
  app.post("/api/ask", async (c) => {
    const b = await body<{ question: string }>(c);
    if (!b.question?.trim()) return c.json({ error: "ask a question" }, 400);
    return c.json(await askVault(b.question.trim()));
  });
  app.post("/api/ask/save", async (c) => {
    const b = await body<{ question: string; answer: string; sources: { path: string; quote: string }[] }>(c);
    return c.json(saveAnswer(b.question, b.answer, b.sources || []));
  });

  /* ---------- figures in the vault ---------- */
  app.get("/api/figures", (c) => c.json(figures.list().sort((a, b) => b.created.localeCompare(a.created))));
  app.get("/api/figures/:id", (c) => {
    const f = figures.get(c.req.param("id"));
    return f ? c.json(f) : c.json({ error: "not found" }, 404);
  });
  app.post("/api/figures", async (c) => {
    const b = await body<Parameters<typeof standaloneFigure>[0] & { scene?: unknown; title?: string }>(c);
    if (b.scene) {
      // keep a figure that was already drawn (e.g. one from a book) in the vault
      const check = validateScene(b.scene);
      if (!check.ok || !check.scene) return c.json({ error: check.errors[0] || "not a figure" }, 400);
      const figure = { id: shortId("f"), title: b.title || check.scene.title, scene: check.scene, source: b.source, request: b.request, created: now() };
      figures.save(figure, figure.title);
      changed(`figure ${figure.title}`);
      return c.json(figure);
    }
    if (!b.passage?.trim() && !b.request?.trim()) return c.json({ error: "say what to show" }, 400);
    return c.json(await standaloneFigure({ ...b, passage: b.passage || b.request || "" }));
  });
  app.delete("/api/figures/:id", (c) => {
    figures.remove(c.req.param("id"));
    changed("delete figure");
    return c.json({ ok: true });
  });

  /* ---------- global live updates ---------- */
  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = subscribe("global", (event) => {
        stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) }).catch(() => {});
      });
      await stream.writeSSE({ event: "hello", data: "{}" });
      const ping = setInterval(() => stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {}), 20000);
      await new Promise<void>((done) => stream.onAbort(() => done()));
      clearInterval(ping);
      unsubscribe();
    }),
  );

  app.get("/api/books-lite", (c) => c.json(listBooks().map((b) => ({ id: b.id, title: b.title, author: b.author, toc: b.toc.map((t) => ({ id: t.id, title: t.title })) }))));
}
