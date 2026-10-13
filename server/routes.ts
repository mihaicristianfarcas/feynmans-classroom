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
import { annotations, cards, changed, concepts, figures, getProfile, logActivity, notes, now, onVaultChange, saveProfile, shortId, VAULT, vaultHistory, vaultStats } from "./vault/index.ts";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileNameOf } from "../shared/links.ts";
import { appendToNote, bookNote, createNote, deleteNote, linkMention, updateNote } from "./learn/notes.ts";
import { allEdges, backlinks, linkTargets, resolveLink, titleOf, unlinkedMentions } from "./vault/links.ts";
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

/** An absolute path inside the vault for a vault-relative one, or null if it would leave the vault. */
function safeVaultPath(rel: string) {
  const full = resolve(VAULT, rel);
  return full.startsWith(`${resolve(VAULT)}/`) ? full : null;
}

/** Every folder under notes/ (for the file tree), including empty ones. */
function noteFolders(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(VAULT, rel), { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      out.push(`${rel}/${entry.name}`.replace(/^notes\//, ""));
      walk(`${rel}/${entry.name}`);
    }
  };
  if (existsSync(join(VAULT, "notes")) && statSync(join(VAULT, "notes")).isDirectory()) walk("notes");
  return out.sort();
}

export function registerRoutes(app: Hono) {
  // files changing in the vault (from the app, an agent, Obsidian): pages showing them reload
  onVaultChange((path) => publish("global", { type: "vault", data: { path } }));

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
    const { type, book, concept, folder } = c.req.query();
    const list = notes
      .list()
      .filter((n) => (!type || n.type === type) && (!book || n.source?.bookId === book) && (!concept || n.concepts.includes(concept)) && (!folder || n.path.startsWith(`notes/${folder}/`)))
      .sort((a, b) => b.updated.localeCompare(a.updated));
    return c.json(list);
  });
  app.get("/api/notes/:id", (c) => {
    const note = notes.get(c.req.param("id")) || notes.byPath(c.req.query("path") || "");
    if (!note) return c.json({ error: "not found" }, 404);
    const node = `note:${note.id}`;
    const outgoing = allEdges()
      .filter((e) => e.from === node && e.kind !== "source")
      .map((e) => ({ target: e.target, kind: e.kind, to: e.to, path: e.toPath, title: e.to ? titleOf(e.to, e.toPath) : e.target }));
    return c.json({ ...note, backlinks: backlinks(node), mentions: unlinkedMentions(note), outgoing });
  });
  app.post("/api/notes", async (c) => {
    const b = await body<Partial<Note> & { folder?: string; concepts?: string[] }>(c);
    const concepts_ = (b.concepts || []).map((name) => upsertConcept({ name, source: b.source }).id);
    return c.json(createNote({ ...b, concepts: concepts_ }));
  });
  app.put("/api/notes/:id", async (c) => {
    const b = await body<Partial<Note> & { folder?: string }>(c);
    if (b.concepts) b.concepts = b.concepts.map((x) => concepts.get(x)?.id || upsertConcept({ name: x }).id);
    return c.json(updateNote(c.req.param("id"), b));
  });
  app.post("/api/notes/:id/append", async (c) => {
    const b = await body<{ markdown: string }>(c);
    if (!b.markdown?.trim()) return c.json({ error: "nothing to add" }, 400);
    return c.json(appendToNote(c.req.param("id"), b.markdown));
  });
  app.delete("/api/notes/:id", (c) => c.json({ ok: deleteNote(c.req.param("id")) }));
  app.post("/api/notes/:id/link-mention", async (c) => c.json(linkMention(c.req.param("id"), (await body<{ path: string }>(c)).path)));

  /** The note a book's reading session writes into ("<title> — notes", made on first use). */
  app.post("/api/books/:id/note", (c) => c.json(bookNote(c.req.param("id"))));

  /* ---------- links and files ---------- */
  app.get("/api/links/targets", (c) => c.json(linkTargets()));
  app.get("/api/links/resolve", (c) => {
    const r = resolveLink(c.req.query("target") || "", c.req.query("sub") || undefined);
    if (!r) return c.json({ error: "nothing by that name" }, 404);
    const annotation = r.kind === "annotation" ? annotations.get(r.id) : undefined;
    return c.json({ ...r, ...(annotation ? { bookId: annotation.bookId, anchor: annotation.anchor } : {}) });
  });
  app.get("/api/vault/tree", (c) =>
    c.json({
      notes: notes
        .list()
        .map((n) => ({ id: n.id, path: n.path, title: n.title, type: n.type, updated: n.updated }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      folders: noteFolders(),
    }),
  );
  /** Pictures in notes (attachments/ only). */
  app.get("/api/vault/attachment", (c) => {
    const rel = (c.req.query("path") || "").replace(/\\/g, "/");
    const path = rel.startsWith("attachments/") ? safeVaultPath(rel) : null;
    if (!path || !existsSync(path)) return c.json({ error: "not found" }, 404);
    const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[extname(path).slice(1).toLowerCase()];
    if (!type) return c.json({ error: "not a picture" }, 400);
    return new Response(readFileSync(path), { headers: { "content-type": type, "cache-control": "private, max-age=3600", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "x-content-type-options": "nosniff" } });
  });
  /** Saves a picture (pasted into a note, or captured from a book) under attachments/. */
  app.post("/api/attachments", async (c) => {
    const b = await body<{ data: string; name?: string }>(c);
    const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(b.data || "");
    if (!m) return c.json({ error: "send a PNG, JPEG, WebP or GIF data URL" }, 400);
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 12 * 1024 * 1024) return c.json({ error: "picture too large (12 MB max)" }, 413);
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    const base = fileNameOf((b.name || `Pasted ${new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, ".")}`).replace(/\.(png|jpe?g|webp|gif)$/i, ""), 90);
    let rel = `attachments/${base}.${ext}`;
    for (let n = 2; existsSync(join(VAULT, rel)); n++) rel = `attachments/${base} ${n}.${ext}`;
    mkdirSync(join(VAULT, "attachments"), { recursive: true });
    writeFileSync(join(VAULT, rel), bytes);
    changed(`attachment ${base}`);
    return c.json({ path: rel, name: rel.slice("attachments/".length) });
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
    const linking = new Set(allEdges().filter((e) => e.to === `concept:${concept.id}` && e.from.startsWith("note:")).map((e) => e.from.slice(5)));
    const linkedNotes = notes.list().filter((n) => n.concepts.includes(concept.id) || linking.has(n.id));
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
      figures.save(figure);
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
