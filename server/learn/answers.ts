/* Quiz answers as evidence of what the learner knows. Every quiz but a pretest keeps each answer's
 * concept and score in the activity log. A concept's recall from them is how well its recent quizzes
 * went (the latest counting twice the oldest) times how much of that remains now: the quizzes are
 * replayed with FSRS-6 as if the concept were a card reviewed in them, so successes spaced over weeks
 * fade slowly and a miss leaves the memory fragile. One quiz is one retrieval of each concept it asked
 * about. (FSRS alone won't do: it predicts near-certain recall right after any review, a miss included.) */
import { type MemoryState, type Rating, retrievability, review } from "../../shared/fsrs.ts";
import type { Activity } from "../../shared/vault-types.ts";
import { activity } from "../vault/index.ts";

export interface QuizAnswer {
  /** The concept's id. */
  concept: string;
  /** 0–1. */
  score: number;
}

/** How many of a concept's latest quizzes its accuracy is read from. */
const WINDOW = 6;

/** What a quiz's answers on one concept amount to, with the quiz's own cut-offs (right ≥ 0.7, partly > 0.3). */
export const ratingFor = (score: number): Rating => (score >= 0.7 ? 3 : score > 0.3 ? 2 : 1);

/** The answers a logged quiz counts as evidence: none for a pretest, which asks before the reading. */
export function answersOf(entry: Activity): QuizAnswer[] {
  if (entry.type !== "quiz" || entry.data?.mode === "pretest" || !Array.isArray(entry.data?.answers)) return [];
  return (entry.data.answers as Partial<QuizAnswer>[]).filter(
    (a): a is QuizAnswer => typeof a.concept === "string" && typeof a.score === "number" && Number.isFinite(a.score),
  );
}

interface Evidence {
  /** Each quiz's mean score on the concept, oldest first. */
  scores: number[];
  state: MemoryState;
}

let cache: { log: Activity[]; count: number; evidence: Map<string, Evidence> } | null = null;

function evidence(): Map<string, Evidence> {
  const log = activity();
  if (cache?.log === log && cache.count === log.length) return cache.evidence;
  const map = new Map<string, Evidence>();
  for (const entry of [...log].sort((a, b) => a.ts - b.ts)) {
    const scores = new Map<string, number[]>();
    for (const a of answersOf(entry)) scores.set(a.concept, [...(scores.get(a.concept) || []), a.score]);
    for (const [concept, list] of scores) {
      const mean = list.reduce((sum, s) => sum + s, 0) / list.length;
      const was = map.get(concept);
      map.set(concept, {
        scores: [...(was?.scores || []), mean],
        state: review(was?.state || null, ratingFor(mean), entry.ts),
      });
    }
  }
  cache = { log, count: log.length, evidence: map };
  return map;
}

/** What the learner would recall of a concept now from its quizzes, 0–1, or null when no quiz has asked about it. */
export function answerRecall(conceptId: string, now = Date.now()): number | null {
  const found = evidence().get(conceptId);
  if (!found) return null;
  const recent = found.scores.slice(-WINDOW);
  const weights = recent.map((_, i) => (recent.length > 1 ? 0.5 + (0.5 * i) / (recent.length - 1) : 1));
  const accuracy = recent.reduce((sum, s, i) => sum + s * weights[i], 0) / weights.reduce((a, b) => a + b, 0);
  return accuracy * retrievability(found.state, now);
}
