/* The second brain's views: the knowledge graph, search, asking the vault, the learning journey
 * and today's plan. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { retrievability } from "../../shared/fsrs.ts";
import { agent } from "../llm.ts";
import { getBook, listBooks, listDemos } from "../store.ts";
import { activity, annotations, cards, concepts, figures, getProfile, logActivity, notes, reviews, VAULT } from "../vault/index.ts";
import { listConnections } from "../vault/connections.ts";
import { chapterFile } from "../vault/library.ts";
import { allEdges, resolveLink, type Edge } from "../vault/links.ts";
import { createNote } from "./notes.ts";
import { cardState, reviewQueue } from "./cards.ts";
import { conceptMastery, learnerSummary } from "./context.ts";

/* ---------------- graph ---------------- */

export interface GraphNode {
  id: string;
  kind: "book" | "concept" | "note" | "annotation";
  label: string;
  /** 0–1, or null when unknown. */
  mastery: number | null;
  size: number;
  detail?: string;
  bookId?: string;
  path?: string;
  /** When it entered the brain (ms), for replaying the graph's growth. */
  created: number;
}
export interface GraphEdge {
  from: string;
  to: string;
  /** link/embed: written in a note; related: a property link; ai: a connection the learner accepted;
   * suggested: one waiting for a decision; concept: concept to concept; mentions: note to concept; source: to its book. */
  kind: "source" | "related" | "mentions" | "link" | "embed" | "ai" | "suggested" | "concept";
  /** For suggestions: the connection's id and why it was suggested. */
  id?: string;
  why?: string;
}

/** The knowledge graph, from the vault's links (see vault/links.ts). */
export function knowledgeGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const books = listBooks().filter((b) => b.status === "ready");
  for (const b of books) nodes.push({ id: `book:${b.id}`, kind: "book", label: b.title, mastery: null, size: 3, detail: b.author, bookId: b.id, created: new Date(b.createdAt).getTime() });
  for (const c of concepts.list()) {
    const linkedCards = cards.list().filter((k) => k.concepts.includes(c.id)).length;
    nodes.push({ id: `concept:${c.id}`, kind: "concept", label: c.name, mastery: conceptMastery(c.id), size: 1 + Math.min(2, (linkedCards + c.sources.length) / 4), detail: c.summary, path: concepts.fileOf(c.id) || undefined, created: new Date(c.created).getTime() });
  }
  for (const n of notes.list()) nodes.push({ id: `note:${n.id}`, kind: "note", label: n.title, mastery: typeof n.score === "number" ? n.score / 100 : null, size: 0.8, detail: n.type, path: n.path, created: new Date(n.created).getTime() });
  for (const a of annotations.list()) nodes.push({ id: `annotation:${a.id}`, kind: "annotation", label: a.title || a.anchor.quote.split(/\s+/).slice(0, 7).join(" ") + "…", mastery: null, size: 0.5, detail: a.kind, bookId: a.bookId, path: a.path, created: new Date(a.created).getTime() });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (e: GraphEdge) => {
    const key = `${e.from}|${e.to}`;
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to) || seen.has(key)) return;
    seen.add(key);
    edges.push(e);
  };
  // the strongest kind of link between two things is the one drawn: written links first
  const order: Edge["kind"][] = ["link", "embed", "ai", "related", "concept", "mentions", "source"];
  const all = allEdges().filter((e) => e.to);
  for (const kind of order) for (const e of all) if (e.kind === kind) add({ from: e.from, to: e.to!, kind: e.kind });
  for (const c of listConnections()) {
    if (c.status !== "suggested") continue;
    const from = notes.byPath(c.from);
    const to = resolveLink(c.to);
    if (from && to) add({ from: `note:${from.id}`, to: to.node, kind: "suggested", id: c.id, why: c.why });
  }
  return { nodes, edges };
}

/* ---------------- search ---------------- */

export interface SearchHit {
  kind: "note" | "concept" | "card" | "book" | "annotation";
  id: string;
  title: string;
  snippet: string;
  score: number;
  bookId?: string;
  loc?: { page?: number; block?: number };
}

const words = (q: string) => q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

function scoreText(text: string, terms: string[]): number {
  const low = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const n = low.split(t).length - 1;
    if (!n) return 0; // every term must appear
    s += Math.log(1 + n);
  }
  return s;
}

function snippet(text: string, terms: string[], width = 160): string {
  const low = text.toLowerCase();
  const at = Math.max(0, Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0)) - 50);
  return `${at > 0 ? "…" : ""}${text.slice(at, at + width).replace(/\s+/g, " ").trim()}${at + width < text.length ? "…" : ""}`;
}

export function search(q: string, limit = 40): SearchHit[] {
  const terms = words(q);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const c of concepts.list()) {
    const s = scoreText(`${c.name} ${c.name} ${c.aliases.join(" ")} ${c.summary} ${c.body}`, terms);
    if (s) hits.push({ kind: "concept", id: c.id, title: c.name, snippet: c.summary || snippet(c.body, terms), score: s * 1.6 });
  }
  for (const n of notes.list()) {
    const s = scoreText(`${n.title} ${n.title} ${n.body} ${n.tags.join(" ")}`, terms);
    if (s) hits.push({ kind: "note", id: n.id, title: n.title, snippet: snippet(n.body, terms), score: s * 1.3, bookId: n.source?.bookId });
  }
  for (const a of annotations.list()) {
    const s = scoreText(`${a.anchor.quote} ${a.request || ""} ${a.body}`, terms);
    if (s) hits.push({ kind: "annotation", id: a.id, title: `${a.kind}: ${a.anchor.quote.slice(0, 80)}`, snippet: snippet(a.body || a.anchor.quote, terms), score: s * 1.2, bookId: a.bookId, loc: a.anchor.page !== undefined ? { page: a.anchor.page } : { block: a.anchor.block } });
  }
  for (const k of cards.list()) {
    const s = scoreText(`${k.front} ${k.back}`, terms);
    if (s) hits.push({ kind: "card", id: k.id, title: k.front.slice(0, 90), snippet: k.back.slice(0, 160), score: s });
  }
  // book text, by chapter file in the library
  for (const b of listBooks().filter((x) => x.status === "ready")) {
    b.toc.forEach((ch, i) => {
      let body = "";
      try {
        body = readFileSync(join(VAULT, chapterFile(b, i)), "utf8");
      } catch {
        return;
      }
      const s = scoreText(body, terms);
      if (!s) return;
      const low = body.toLowerCase();
      const idx = low.indexOf(terms[0]);
      const marker = [...body.slice(0, idx).matchAll(/\[\[(page|block) (\d+)\]\]/g)].pop();
      hits.push({ kind: "book", id: `${b.id}:${ch.id}`, title: `${b.title} · ${ch.title}`, snippet: snippet(body.replace(/\[\[(page|block) \d+\]\]/g, ""), terms), score: s * 0.8, bookId: b.id, loc: marker ? { [marker[1]]: Number(marker[2]) } : undefined });
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------------- ask the vault ---------------- */

const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "sources"],
  properties: {
    answer: { type: "string", description: "Markdown answer for the learner; cite sources inline like [1]" },
    sources: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "quote"], properties: { path: { type: "string", description: "vault-relative file path" }, quote: { type: "string", description: "the short passage used" } } } },
  },
};

/** An agent reads the vault (notes, concepts, cards, the books' text) and answers with citations. */
export async function askVault(question: string, opts: { onActivity?: (t: string) => void; signal?: AbortSignal } = {}) {
  const prompt = `You are the learner's research assistant, working inside their knowledge vault (this folder). Read AGENTS.md first: it explains the layout. Answer the question from what is in the vault: search with rg or grep across notes/, concepts/, cards/ and library/ (the books' full text), read the relevant files, and synthesise a clear answer in plain words. Cite the files you used. If the vault doesn't cover it, say so and answer briefly from general knowledge, marked as such. Do not modify any file.

The learner:
${learnerSummary()}

Question: ${question}

Return JSON.`;
  const result = await agent({ cwd: VAULT, prompt, schema: ASK_SCHEMA, tier: "smart", effort: "low", onActivity: opts.onActivity, signal: opts.signal });
  const data = result.data as { answer: string; sources: { path: string; quote: string }[] };
  logActivity({ type: "ask", text: `Asked the vault: ${question.slice(0, 80)}` });
  return { ...data, ms: result.ms };
}

export function saveAnswer(question: string, answer: string, sources: { path: string; quote: string }[]) {
  const cite = (path: string) => (path.endsWith(".md") && !path.includes("/text/") ? `[[${path.replace(/\.md$/, "")}]]` : `\`${path}\``);
  return createNote({ type: "answer", title: question.slice(0, 80), body: `${answer}\n\n${sources.length ? `**Sources**\n${sources.map((s, i) => `${i + 1}. ${cite(s.path)} — “${s.quote}”`).join("\n")}` : ""}`, tags: ["ask"] });
}

/* ---------------- the journey ---------------- */

const dayKey = (ts: number) => {
  const d = new Date(ts - 4 * 3600000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function journey() {
  const acts = activity();
  const revs = reviews();
  const days = new Map<string, { reviews: number; minutes: number; events: number; correct: number }>();
  const bump = (key: string, field: "reviews" | "minutes" | "events" | "correct", n = 1) => {
    const d = days.get(key) || { reviews: 0, minutes: 0, events: 0, correct: 0 };
    d[field] += n;
    days.set(key, d);
  };
  for (const r of revs) {
    bump(dayKey(r.ts), "reviews");
    if (r.rating > 1) bump(dayKey(r.ts), "correct");
    bump(dayKey(r.ts), "minutes", Math.min(2, (r.took || 12) / 60));
  }
  for (const a of acts) {
    bump(dayKey(a.ts), "events");
    if (a.type === "read") bump(dayKey(a.ts), "minutes", Number(a.data?.minutes) || 0);
  }
  // streak: consecutive days with any activity, ending today or yesterday
  let streak = 0;
  const today = dayKey(Date.now());
  for (let i = 0; i < 3650; i++) {
    const key = dayKey(Date.now() - i * 86400000);
    if (days.has(key)) streak++;
    else if (key !== today) break;
  }
  const at = Date.now();
  const mastery = concepts
    .list()
    .map((c) => ({ id: c.id, name: c.name, mastery: conceptMastery(c.id, at) }))
    .sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1));
  const states = cards.list().map((c) => cardState(c.id));
  const retained = states.filter(Boolean).map((s) => retrievability(s, at));
  const month = revs.filter((r) => r.ts > at - 30 * 86400000);
  return {
    days: Object.fromEntries(days),
    streak,
    totals: { reviews: revs.length, cards: cards.items.size, concepts: concepts.items.size, notes: notes.items.size, figures: figures.items.size + listBooks().reduce((n, b) => n + listDemos(b.id).filter((d) => d.status === "ready").length, 0), books: listBooks().length },
    retention: { now: retained.length ? retained.reduce((a, b) => a + b, 0) / retained.length : null, month: month.length ? month.filter((r) => r.rating > 1).length / month.length : null, mature: states.filter((s) => s && s.s >= 21).length, learning: states.filter((s) => s && s.s < 21).length, unseen: states.filter((s) => !s).length },
    mastery,
    recent: acts.slice(-60).reverse(),
  };
}

/* ---------------- today ---------------- */

export function today() {
  const queue = reviewQueue({ limit: 0 });
  const acts = activity();
  const books = listBooks()
    .filter((b) => b.status === "ready")
    .map((b) => {
      const last = [...acts].reverse().find((a) => a.bookId === b.id);
      return { id: b.id, title: b.title, author: b.author, format: b.format, lastTs: last?.ts || new Date(b.createdAt).getTime(), position: (last?.data?.position as number | undefined) ?? null, chapter: (last?.data?.chapter as string | undefined) || null };
    })
    .sort((a, b) => b.lastTs - a.lastTs);
  const suggestions: { kind: string; title: string; detail: string; action: Record<string, string> }[] = [];
  const waiting = queue.due + queue.learning + queue.fresh;
  if (waiting > 0) suggestions.push({ kind: "review", title: `Review ${waiting} card${waiting === 1 ? "" : "s"}`, detail: queue.due + queue.learning ? "Retrieval at the edge of forgetting is what makes memories last." : "New cards: the first recall is the start of a long memory.", action: { route: "#/review" } });
  // a concept that is slipping: explain it back
  const slipping = concepts
    .list()
    .map((c) => ({ c, m: conceptMastery(c.id) }))
    .filter((x) => x.m !== null && x.m < 0.65)
    .sort((a, b) => a.m! - b.m!)[0];
  if (slipping) suggestions.push({ kind: "explain", title: `Explain “${slipping.c.name}” in your own words`, detail: "Your recall of it is slipping. Teaching it back shows you exactly where the gaps are.", action: { route: `#/brain/concept/${slipping.c.id}`, explain: "1" } });
  const lastRead = books[0];
  if (lastRead) suggestions.push({ kind: "read", title: `Continue ${lastRead.title}`, detail: lastRead.chapter ? `You were in ${lastRead.chapter}.` : "Pick up where you left off.", action: { route: `#/book/${lastRead.id}` } });
  // spaced quiz on a chapter read a few days ago
  const read = [...acts].reverse().find((a) => a.type === "read" && a.ts < Date.now() - 2 * 86400000 && a.data?.chapterId);
  if (read?.bookId) {
    const chapter = getBook(read.bookId)?.toc.find((c) => c.id === read.data?.chapterId);
    const at = chapter ? (chapter.start.page !== undefined ? chapter.start.page + (chapter.start.y ?? 0) + 0.02 : (chapter.start.block ?? 0)) : undefined;
    suggestions.push({ kind: "quiz", title: `Quiz yourself on ${String(read.data?.chapter || "a chapter you read")}`, detail: "A few days later is the right moment to test what stayed.", action: { route: `#/book/${read.bookId}`, quiz: String(read.data?.chapterId), ...(at !== undefined ? { at: at.toFixed(3) } : {}) } });
  }
  if (concepts.items.size >= 6) suggestions.push({ kind: "mixed", title: "Mixed review quiz", detail: "Interleaving topics feels harder and works better: it teaches you to tell ideas apart.", action: { route: "#/review", mixed: "1" } });
  return { queue: { due: queue.due, learning: queue.learning, fresh: queue.fresh, total: queue.total }, books: books.slice(0, 6), suggestions, profile: getProfile(), summary: learnerSummary() };
}
