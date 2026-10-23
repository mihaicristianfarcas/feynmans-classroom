/* The learning journey and today's plan: study days and recall over time, what's due, what's
 * fading, and what to do next (with how far through the last book you are, and your pace). The
 * streak counts study days and nothing more (Mathua dropped its streak multiplier and speed bonus:
 * they paid a long run or a guess more than the same careful work), and it can be paused for a break,
 * so days away don't break it. */
import { retrievability } from "../../shared/fsrs.ts";
import type { Activity } from "../../shared/vault-types.ts";
import { getBook, listBooks, listDemos } from "../books/store.ts";
import { activity, docs, getProfile, logActivity, reviews } from "../vault/index.ts";
import { cardState, reviewQueue } from "./cards.ts";
import { conceptMastery, learnerSummary } from "./context.ts";
import { type BookProgress, bookProgress } from "./progress.ts";

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** A day starts at 4 am, so a late session counts for the night before. */
const dayKey = (ts: number) => keyOf(new Date(ts - 4 * 3600000));
const dateOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (key: string, n: number) => {
  const d = dateOf(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};

/** Every day a pause covers: a paused day without study neither counts toward the streak nor breaks it. */
function pausedDays(acts: Activity[]): Set<string> {
  const out = new Set<string>();
  for (const a of acts) {
    if (a.type !== "pause") continue;
    const from = String(a.data?.from || "");
    const until = String(a.data?.until || "");
    if (!/^\d{4}-\d\d-\d\d$/.test(from) || !/^\d{4}-\d\d-\d\d$/.test(until)) continue;
    for (let key = from, i = 0; key <= until && i < 31; key = addDays(key, 1), i++) out.add(key);
  }
  return out;
}

/** Pauses the streak for a number of days (1–30) from today. */
export function pauseStreak(days: number) {
  const n = Math.min(30, Math.max(1, Math.round(Number(days)) || 1));
  const from = dayKey(Date.now());
  const until = addDays(from, n - 1);
  const last = dateOf(until).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long" });
  logActivity({ type: "pause", text: `Paused the streak until ${last}`, data: { from, until } });
  return journey();
}

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
    if (a.type === "pause") continue; // a break, not study
    bump(dayKey(a.ts), "events");
    if (a.type === "read") bump(dayKey(a.ts), "minutes", Number(a.data?.minutes) || 0);
  }
  // streak: consecutive days with any activity, ending today or yesterday; paused days are passed over
  let streak = 0;
  const today = dayKey(Date.now());
  const paused = pausedDays(acts);
  for (let i = 0; i < 3650; i++) {
    const key = dayKey(Date.now() - i * 86400000);
    if (days.has(key)) streak++;
    else if (key !== today && !paused.has(key)) break;
  }
  const pausedUntil =
    [...paused]
      .filter((key) => key >= today)
      .sort()
      .at(-1) ?? null;
  const at = Date.now();
  const mastery = docs
    .list("concept")
    .map((c) => ({ id: c.id, title: c.title, mastery: conceptMastery(c.id, at) }))
    .sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1));
  const states = docs.list("card").map((c) => cardState(c.id));
  const retained = states.filter(Boolean).map((s) => retrievability(s, at));
  const month = revs.filter((r) => r.ts > at - 30 * 86400000);
  return {
    days: Object.fromEntries(days),
    streak,
    /** The last day of a pause running today or later (YYYY-MM-DD). */
    pausedUntil,
    totals: {
      reviews: revs.length,
      cards: docs.count("card"),
      concepts: docs.count("concept"),
      notes: docs.count("note"),
      figures:
        docs.count("figure") +
        listBooks().reduce((n, b) => n + listDemos(b.id).filter((d) => d.status === "ready").length, 0),
      books: listBooks().length,
    },
    retention: {
      now: retained.length ? retained.reduce((a, b) => a + b, 0) / retained.length : null,
      month: month.length ? month.filter((r) => r.rating > 1).length / month.length : null,
      mature: states.filter((s) => s && s.s >= 21).length,
      learning: states.filter((s) => s && s.s < 21).length,
      unseen: states.filter((s) => !s).length,
    },
    mastery,
    recent: acts.slice(-60).reverse(),
  };
}

/** Where the learner is in the book they last read, and when they'd finish it at their recent pace. */
function whereYouAre(chapter: string | null, progress: BookProgress | null): string {
  if (progress?.fraction === 1) return "You've reached the end of it.";
  const percent = progress ? `${Math.round(progress.fraction * 100)}%` : "";
  const place =
    chapter && percent
      ? `You were in ${chapter}, ${percent} of the way through.`
      : chapter
        ? `You were in ${chapter}.`
        : percent
          ? `You're ${percent} of the way through.`
          : "Pick up where you left off.";
  return progress?.finishIn ? `${place} At your pace over the last two weeks, ${progress.finishIn} to the end.` : place;
}

export function today() {
  const queue = reviewQueue({ limit: 0 });
  const acts = activity();
  const books = listBooks()
    .filter((b) => b.status === "ready")
    .map((b) => {
      const last = [...acts].reverse().find((a) => a.bookId === b.id);
      // where you were is where you last read (a highlight or a question since doesn't move it)
      const read = [...acts].reverse().find((a) => a.bookId === b.id && a.type === "read");
      return {
        id: b.id,
        title: b.title,
        author: b.author,
        format: b.format,
        lastTs: last?.ts || new Date(b.createdAt).getTime(),
        position: (read?.data?.position as number | undefined) ?? null,
        chapter: (read?.data?.chapter as string | undefined) || null,
        progress: bookProgress(b.id),
      };
    })
    .sort((a, b) => b.lastTs - a.lastTs);
  const suggestions: { kind: string; title: string; detail: string; action: Record<string, string> }[] = [];
  const waiting = queue.due + queue.learning + queue.fresh;
  if (waiting > 0)
    suggestions.push({
      kind: "review",
      title: `Review ${waiting} card${waiting === 1 ? "" : "s"}`,
      detail:
        queue.due + queue.learning
          ? "Retrieval at the edge of forgetting is what makes memories last."
          : "New cards: the first recall is the start of a long memory.",
      action: { route: "#/review" },
    });
  // a concept that is slipping: explain it back
  const slipping = docs
    .list("concept")
    .map((c) => ({ c, m: conceptMastery(c.id) }))
    .filter((x) => x.m !== null && x.m < 0.65)
    .sort((a, b) => a.m! - b.m!)[0];
  if (slipping)
    suggestions.push({
      kind: "explain",
      title: `Explain “${slipping.c.title}” in your own words`,
      detail: "Your recall of it is slipping. Teaching it back shows you exactly where the gaps are.",
      action: { route: `#/brain/concept/${slipping.c.id}`, explain: "1" },
    });
  const lastRead = books[0];
  if (lastRead)
    suggestions.push({
      kind: "read",
      title: `Continue ${lastRead.title}`,
      detail: whereYouAre(lastRead.chapter, lastRead.progress),
      action: { route: `#/book/${lastRead.id}` },
    });
  // spaced quiz on a chapter read a few days ago
  const read = [...acts]
    .reverse()
    .find((a) => a.type === "read" && a.ts < Date.now() - 2 * 86400000 && a.data?.chapterId);
  if (read?.bookId) {
    const chapter = getBook(read.bookId)?.toc.find((c) => c.id === read.data?.chapterId);
    const at = chapter
      ? chapter.start.page !== undefined
        ? chapter.start.page + (chapter.start.y ?? 0) + 0.02
        : (chapter.start.block ?? 0)
      : undefined;
    suggestions.push({
      kind: "quiz",
      title: `Quiz yourself on ${String(read.data?.chapter || "a chapter you read")}`,
      detail: "A few days later is the right moment to test what stayed.",
      action: {
        route: `#/book/${read.bookId}`,
        quiz: String(read.data?.chapterId),
        ...(at !== undefined ? { at: at.toFixed(3) } : {}),
      },
    });
  }
  if (docs.count("concept") >= 6)
    suggestions.push({
      kind: "mixed",
      title: "Mixed review quiz",
      detail: "Interleaving topics feels harder and works better: it teaches you to tell ideas apart.",
      action: { route: "#/review", mixed: "1" },
    });
  return {
    queue: { due: queue.due, learning: queue.learning, fresh: queue.fresh, total: queue.total },
    books: books.slice(0, 6),
    suggestions,
    profile: getProfile(),
    summary: learnerSummary(),
  };
}
