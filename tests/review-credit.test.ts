// Part of a review for what an idea builds on: `credit` puts off a card coming due but leaves one long
// overdue due, and skips a card being learned or reviewed today; in the replay, a Good recall of a known
// card after a wait credits the cards on the concepts its own build on directly, never the other way,
// nor for Hard or Again, a same-day review or a card still being learned, and once a day at most; a
// builds-on link added or taken out later changes the replay at once.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CREDIT, credit, type MemoryState, type Rating, review } from "../shared/fsrs.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-review-credit-"));
process.env.DATA_DIR = dir;

const DAY = 86400000;
const T0 = Date.now() - 200 * DAY;
let V: typeof import("../server/vault/index.ts");
let C: typeof import("../server/learn/concepts.ts");
let K: typeof import("../server/learn/cards.ts");
let D: typeof import("../server/learn/docs.ts");

/** A concept (building on `buildsOn`) and a card on it, rated Easy at T0, so known from then on. */
function concept(name: string, buildsOn: string[] = []) {
  const c = C.upsertConcept({ name, summary: `About ${name}.`, buildsOn });
  return known(c.id, name);
}
function known(conceptId: string, name: string) {
  const card = K.saveCard({ front: `What is ${name}? (${Math.random()})`, back: name, concepts: [conceptId] });
  rate(card.id, 4, T0);
  return card.id;
}
const rate = (card: string, rating: Rating, ts: number) => V.logReview({ card, ts, rating });
const state = (card: string) => K.cardState(card)!;
/** What a card rated Easy at T0 is, with no reviews since. */
const fresh = () => review(null, 4, T0);

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  C = await import("../server/learn/concepts.ts");
  K = await import("../server/learn/cards.ts");
  D = await import("../server/learn/docs.ts");
});

describe("credit", () => {
  const known: MemoryState = review(null, 4, T0);
  it("puts off a card coming due, without resetting its clock", () => {
    const at = known.due - DAY;
    const next = credit(known, at);
    expect(next.s).toBeGreaterThan(known.s);
    expect(next.due).toBeGreaterThan(known.due);
    expect(next).toMatchObject({ last: known.last, reps: known.reps, lapses: known.lapses, d: known.d });
  });
  it("is part of what a Good review would add", () => {
    const at = known.due;
    const good = review(known, 3, at);
    expect(credit(known, at, 1).s).toBeCloseTo(good.s, 6);
    expect(credit(known, at).s - known.s).toBeCloseTo(CREDIT * (good.s - known.s), 6);
  });
  it("leaves a card long overdue due", () => {
    const at = T0 + 60 * DAY;
    const next = credit(known, at);
    expect(next.s).toBeGreaterThan(known.s);
    expect(next.due).toBeLessThanOrEqual(at);
  });
  it("skips a card being learned, and one reviewed today", () => {
    const learning = review(null, 3, T0);
    expect(credit(learning, T0 + 5 * DAY)).toBe(learning);
    expect(credit(known, T0 + DAY / 2)).toBe(known);
  });
});

describe("reviewing an idea credits what it builds on", () => {
  it("a Good recall of a known card puts off the cards on its foundations, only direct ones", () => {
    const probability = concept("Probability");
    const conditional = concept("Conditional probability", ["Probability"]);
    const bayes = concept("Bayes' rule", ["Conditional probability"]);
    const unrelated = concept("Entropy");
    const at = T0 + 5 * DAY;
    rate(bayes, 3, at);
    expect(state(conditional)).toEqual(credit(fresh(), at));
    expect(state(conditional).due).toBeGreaterThan(fresh().due);
    expect(state(probability)).toEqual(fresh());
    expect(state(unrelated)).toEqual(fresh());
    expect(state(bayes)).toEqual(review(fresh(), 3, at));
  });

  it("never the other way round", () => {
    const base = concept("Limit");
    const top = concept("Derivative", ["Limit"]);
    rate(base, 3, T0 + 5 * DAY);
    expect(state(top)).toEqual(fresh());
  });

  it("not for Hard or Again, a review the same day, or a card still being learned", () => {
    const base = concept("Vector");
    const top = concept("Dot product", ["Vector"]);
    rate(top, 2, T0 + 5 * DAY);
    rate(top, 1, T0 + 7 * DAY);
    expect(state(base)).toEqual(fresh());

    const base2 = concept("Set");
    const top2 = concept("Function", ["Set"]);
    rate(top2, 3, T0 + DAY / 2);
    expect(state(base2)).toEqual(fresh());

    const base3 = concept("Atom");
    const learning = K.saveCard({ front: "What is a molecule?", back: "Atoms bonded", concepts: [] });
    C.upsertConcept({ name: "Molecule", buildsOn: ["Atom"] });
    K.saveCard({ ...learning, concepts: [C.findConcept("Molecule")!.id] });
    rate(learning.id, 3, T0);
    rate(learning.id, 3, T0 + 5 * DAY); // its first review left it learning, so this graduates it
    expect(state(base3)).toEqual(fresh());
  });

  it("once a day at most", () => {
    const base = concept("Integer");
    const top = concept("Prime", ["Integer"]);
    const second = known(C.findConcept("Prime")!.id, "Prime");
    const at = T0 + 5 * DAY;
    rate(top, 3, at);
    rate(second, 3, at + 60 * 60000);
    const once = credit(fresh(), at);
    expect(state(base)).toEqual(once);
    rate(top, 3, at + DAY + 60000);
    expect(state(base)).toEqual(credit(once, at + DAY + 60000));
  });

  it("follows builds-on links added or taken out later, for every review so far", () => {
    const base = concept("Matrix");
    const top = concept("Determinant");
    const at = T0 + 5 * DAY;
    rate(top, 3, at);
    expect(state(base)).toEqual(fresh());
    C.upsertConcept({ name: "Determinant", buildsOn: ["Matrix"] });
    expect(state(base)).toEqual(credit(fresh(), at));
    D.updateDoc(C.findConcept("Determinant")!.id, { buildsOn: [] });
    expect(state(base)).toEqual(fresh());
  });
});
