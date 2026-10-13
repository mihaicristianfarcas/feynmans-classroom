/* What every prompt needs to know: who the learner is (and how they're doing), and the book text
 * around what they're looking at. */
import { chapterRange } from "../anchor.ts";
import { chapterText, findChapter, passageAround } from "../ingest/index.ts";
import { getBook } from "../store.ts";
import { cards, concepts, getProfile, notes } from "../vault/index.ts";
import { retrievability } from "../../shared/fsrs.ts";
import type { SourceRef } from "../../shared/vault-types.ts";
import { cardState } from "./cards.ts";

/** Mastery of a concept, 0–1: recall of its cards now, else its best explanation score. Null when unknown. */
export function conceptMastery(conceptId: string, now = Date.now()): number | null {
  const linked = cards.list().filter((c) => c.concepts.includes(conceptId) && !c.suspended);
  const reviewed = linked.map((c) => cardState(c.id)).filter(Boolean);
  const explained = notes.list().filter((n) => n.type === "explanation" && n.concepts.includes(conceptId) && typeof n.score === "number");
  const fromExplain = explained.length ? Math.max(...explained.map((n) => n.score!)) / 100 : null;
  if (!reviewed.length) return fromExplain;
  const recall = reviewed.reduce((sum, s) => sum + retrievability(s, now), 0) / linked.length;
  return fromExplain === null ? recall : Math.max(recall, fromExplain * 0.8);
}

/** A paragraph about the learner for prompts. */
export function learnerSummary(): string {
  const p = getProfile();
  const style = (v: number) => (v >= 0.7 ? "a lot" : v >= 0.4 ? "some" : "little");
  const known = concepts
    .list()
    .map((c) => ({ c, m: conceptMastery(c.id) }))
    .filter((x) => x.m !== null);
  const strong = known.filter((x) => x.m! >= 0.8).map((x) => x.c.name).slice(0, 12);
  const weak = known
    .filter((x) => x.m! < 0.6)
    .sort((a, b) => a.m! - b.m!)
    .map((x) => x.c.name)
    .slice(0, 10);
  const lines = [
    `${p.name || "The learner"} is a ${p.role === "curious" ? "self-directed learner" : p.role}; level: ${p.level}.`,
    p.background ? `Background: ${p.background}` : "",
    p.goals ? `Goals: ${p.goals}` : "",
    p.interests.length ? `Interests: ${p.interests.join(", ")}.` : "",
    `Wants pictures: ${style(p.styles.visual)} (visual ${p.styles.visual.toFixed(1)}); wants words: ${style(p.styles.reader)} (reader ${p.styles.reader.toFixed(1)}); wants things to touch and try: ${style(p.styles.doer)} (doer ${p.styles.doer.toFixed(1)}).`,
    strong.length ? `Already solid on: ${strong.join(", ")}.` : "",
    weak.length ? `Shaky on: ${weak.join(", ")}.` : "",
    p.notes && !p.notes.startsWith("_Anything") ? `In their own words: ${p.notes.slice(0, 600)}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export interface BookContext {
  source: { title?: string; author?: string; chapter?: string };
  /** Text around the passage (or the chapter). */
  context: string;
  chapterId?: string;
}

/** The book and chapter around a source reference, as text for a prompt. */
export function bookContext(ref: Partial<SourceRef> | undefined, chars = 9000): BookContext {
  if (!ref?.bookId) return { source: {}, context: "" };
  const book = getBook(ref.bookId);
  if (!book) return { source: {}, context: "" };
  let chapter = ref.chapterId ? findChapter(book, ref.chapterId) : null;
  if (!chapter && (ref.page !== undefined || ref.block !== undefined)) {
    const at = ref.page !== undefined ? ref.page + (ref.y ?? 0) : (ref.block ?? 0);
    chapter = [...book.toc].reverse().find((c) => (c.start.page !== undefined ? c.start.page + (c.start.y ?? 0) : (c.start.block ?? 0)) <= at + 1e-6) || book.toc[0] || null;
  }
  const source = { title: book.title, author: book.author, chapter: chapter ? `${chapter.title}${chapter.subtitle ? ` — ${chapter.subtitle}` : ""}` : undefined };
  let context = "";
  if (ref.page !== undefined || ref.block !== undefined) context = passageAround(book, { page: ref.page, block: ref.block }, 1);
  else if (chapter) context = chapterText(book, chapter, chars);
  if (context.length > chars) context = context.slice(0, chars);
  return { source, context, chapterId: chapter?.id };
}

/** The whole chapter text (for quizzes and concept extraction). */
export function chapterContext(bookId: string, chapterId: string, chars = 40000): BookContext & { range?: ReturnType<typeof chapterRange> } {
  const book = getBook(bookId);
  if (!book) throw new Error("book not found");
  const chapter = findChapter(book, chapterId);
  if (!chapter) throw new Error("chapter not found");
  return { source: { title: book.title, author: book.author, chapter: `${chapter.title}${chapter.subtitle ? ` — ${chapter.subtitle}` : ""}` }, context: chapterText(book, chapter, chars), chapterId, range: chapterRange(chapter) };
}

export function sourceLine(source: BookContext["source"]): string {
  return source.title ? `${source.title}${source.author ? ` by ${source.author}` : ""}${source.chapter ? `, ${source.chapter}` : ""}` : "";
}
