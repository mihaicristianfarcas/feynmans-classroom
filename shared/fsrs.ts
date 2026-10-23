/* FSRS-6: the spaced-repetition scheduler Anki uses, trained on hundreds of millions of reviews.
 *
 * A card's memory has a stability S (days until recall falls to 90%) and a difficulty D (1–10).
 * Each review updates both from the rating and from how likely recall was at that moment (R).
 * The next review is scheduled for when R is predicted to drop to the desired retention.
 * Formulas and default weights: github.com/open-spaced-repetition (FSRS-6, 21 parameters).
 * The state is a pure function of the review log, so replaying the log rebuilds every card. On top of
 * FSRS, `credit` gives part of a review to a memory used without being reviewed (Math Academy's
 * implicit repetitions). */

export type Rating = 1 | 2 | 3 | 4; // again, hard, good, easy
export const RATINGS: Rating[] = [1, 2, 3, 4];
export const RATING_NAMES: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

export const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483,
  0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

export interface MemoryState {
  /** Stability in days. */
  s: number;
  /** Difficulty 1–10. */
  d: number;
  /** Last review (ms since epoch). */
  last: number;
  /** When it is due (ms since epoch). */
  due: number;
  phase: "learning" | "review" | "relearning";
  /** Position in the learning steps. */
  step: number;
  reps: number;
  lapses: number;
}

export const DAY = 86400000;
const MIN = 60000;
/** Learning steps for new cards, and the relearning step after a lapse. */
const LEARN = [1 * MIN, 10 * MIN];
const RELEARN = 10 * MIN;

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const decay = (w = W) => w[20];
const factor = (w = W) => 0.9 ** (-1 / decay(w)) - 1;

/** Probability of recall `days` after the last review. */
export function forgetting(days: number, s: number, w = W): number {
  return (1 + (factor(w) * Math.max(0, days)) / s) ** -decay(w);
}

export function retrievability(state: MemoryState | null, now = Date.now(), w = W): number {
  if (!state) return 0;
  return forgetting((now - state.last) / DAY, state.s, w);
}

/** Days until recall is expected to fall to `retention`. */
export function intervalDays(s: number, retention = 0.9, w = W): number {
  return (s / factor(w)) * (retention ** (-1 / decay(w)) - 1);
}

const initS = (g: Rating, w = W) => Math.max(0.1, w[g - 1]);
const initD = (g: Rating, w = W) => clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);

function nextD(d: number, g: Rating, w = W) {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // linear damping: changes shrink near 10
  return clampD(w[7] * initD(4, w) + (1 - w[7]) * damped); // mean reversion
}

function recallS(s: number, d: number, r: number, g: Rating, w = W) {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * s ** -w[9] * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy + 1);
}

function forgetS(s: number, d: number, r: number, w = W) {
  const next = w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(next, s / Math.exp(w[17] * w[18]));
}

/** Same-day review: stability changes a little, and never shrinks on a pass. */
function shortTermS(s: number, g: Rating, w = W) {
  let inc = Math.exp(w[17] * (g - 3 + w[18])) * s ** -w[19];
  if (g >= 3) inc = Math.max(inc, 1);
  return s * inc;
}

/** Applies one review. `state` is null for a new card. */
export function review(state: MemoryState | null, g: Rating, now = Date.now(), retention = 0.9, w = W): MemoryState {
  const graduate = (s: number, d: number, reps: number, lapses: number): MemoryState => {
    const days = Math.max(1, Math.round(intervalDays(s, retention, w)));
    return { s, d, last: now, due: now + days * DAY, phase: "review", step: 0, reps, lapses };
  };
  if (!state) {
    const s = initS(g, w),
      d = initD(g, w);
    if (g === 4) return graduate(s, d, 1, 0);
    const step = g === 3 ? 1 : 0;
    const wait = g === 1 ? LEARN[0] : g === 2 ? (LEARN[0] + LEARN[1]) / 2 : LEARN[1];
    return { s, d, last: now, due: now + wait, phase: "learning", step, reps: 1, lapses: 0 };
  }
  const days = (now - state.last) / DAY;
  const r = forgetting(days, state.s, w);
  const d = nextD(state.d, g, w);
  const sameDay = days < 1;
  if (state.phase === "review") {
    if (g === 1) {
      const s = sameDay ? shortTermS(state.s, g, w) : forgetS(state.s, state.d, r, w);
      return {
        s,
        d,
        last: now,
        due: now + RELEARN,
        phase: "relearning",
        step: 0,
        reps: state.reps + 1,
        lapses: state.lapses + 1,
      };
    }
    const s = sameDay ? shortTermS(state.s, g, w) : recallS(state.s, state.d, r, g, w);
    return graduate(s, d, state.reps + 1, state.lapses);
  }
  // learning or relearning: short steps until the card is passed with Good (or Easy)
  const s = sameDay
    ? shortTermS(state.s, g, w)
    : g === 1
      ? forgetS(state.s, state.d, r, w)
      : recallS(state.s, state.d, r, g, w);
  if (g === 1)
    return {
      ...state,
      s,
      d,
      last: now,
      due: now + (state.phase === "learning" ? LEARN[0] : RELEARN),
      step: 0,
      reps: state.reps + 1,
    };
  if (g === 2)
    return {
      ...state,
      s,
      d,
      last: now,
      due: now + (state.phase === "learning" ? (LEARN[0] + LEARN[1]) / 2 : RELEARN),
      reps: state.reps + 1,
    };
  if (g === 4 || state.phase === "relearning" || state.step + 1 >= LEARN.length)
    return graduate(s, d, state.reps + 1, state.lapses);
  return { ...state, s, d, last: now, due: now + LEARN[state.step + 1], step: state.step + 1, reps: state.reps + 1 };
}

/** The share of a Good review that using a memory, without reviewing it, is worth. */
export const CREDIT = 0.3;

/** Part of a review, for a memory used without being reviewed (a card on an idea that builds on this
 * one, recalled after a wait): `share` of the stability a Good review now would add. The clock isn't
 * reset, so a card coming due is put off, while one long overdue stays due. Only a known card (in
 * review), and not on the day of its last review. */
export function credit(state: MemoryState, now: number, share = CREDIT, retention = 0.9, w = W): MemoryState {
  const days = (now - state.last) / DAY;
  if (state.phase !== "review" || days < 1) return state;
  const good = recallS(state.s, state.d, forgetting(days, state.s, w), 3, w);
  const s = state.s + share * Math.max(0, good - state.s);
  const due = state.last + Math.max(1, Math.round(intervalDays(s, retention, w))) * DAY;
  return { ...state, s, due: Math.max(state.due, due) };
}

/** What each button would do now, for labels like "1m · 6m · 10m · 4d". */
export function preview(state: MemoryState | null, now = Date.now(), retention = 0.9): Record<Rating, number> {
  return Object.fromEntries(RATINGS.map((g) => [g, review(state, g, now, retention).due - now])) as Record<
    Rating,
    number
  >;
}

export function humanInterval(ms: number): string {
  const m = ms / MIN;
  if (m < 60) return `${Math.max(1, Math.round(m))}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

/** Rebuilds a card's state from its reviews (oldest first). */
export function replay(reviews: { ts: number; rating: Rating }[], retention = 0.9): MemoryState | null {
  let state: MemoryState | null = null;
  for (const r of reviews) state = review(state, r.rating, r.ts, retention);
  return state;
}
