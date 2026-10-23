// Cards asked a new way: a card known for weeks is asked as a fresh question (written by a stand-in
// model, a batch at a time and once), a young one never; the review is logged as one, the next shows
// the card again; a changed card's question is written again; a failed call writes nothing.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-variants-"));
process.env.DATA_DIR = dir;

// the stand-in model answers with whatever the test sets (or throws it), and keeps the prompt it was given
let reply: unknown = {};
const prompts: string[] = [];
vi.mock("../server/llm/index.ts", () => ({
  structured: async (options: { prompt: string }) => {
    prompts.push(options.prompt);
    if (reply instanceof Error) throw reply;
    return { data: reply };
  },
  text: async () => {
    throw new Error("no model in tests");
  },
  agent: async () => {
    throw new Error("no model in tests");
  },
  llmLoad: () => 0,
}));

const DAY = 86400000;
const MIN = 60000;
const LATER = Date.now() + 3650 * DAY; // when every card reviewed here is due
let V: typeof import("../server/vault/index.ts");
let K: typeof import("../server/learn/cards.ts");
let D: typeof import("../server/learn/docs.ts");

/** Reviews a card Good, starting long ago, until FSRS says it is known for `days`, all in the past. */
function knownFor(id: string, days: number) {
  let t = Date.now() - 400 * DAY;
  V.logReview({ card: id, ts: t, rating: 3 });
  for (let s = K.cardState(id)!; s.phase !== "review" || s.s < days; s = K.cardState(id)!) {
    t = s.due;
    V.logReview({ card: id, ts: t, rating: 3 });
  }
  expect(t).toBeLessThan(Date.now());
}
const queued = (id: string) => K.reviewQueue({ at: LATER }).cards.find((c) => c.id === id);
const asked = (id: string, question = "Q", answer = "A") => ({ card: id, question, answer });

let old: import("../shared/vault-types.ts").Card;
let young: import("../shared/vault-types.ts").Card;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  K = await import("../server/learn/cards.ts");
  D = await import("../server/learn/docs.ts");
  await V.saveProfile({ name: "Ada", interests: ["cycling"], onboarded: true });
  old = K.saveCard({ front: "Heat flows from {{hot to cold}} on its own.", back: "Second law", type: "cloze" });
  young = K.saveCard({ front: "What is entropy?", back: "A measure of the ways a state can be arranged." });
  knownFor(old.id, 30);
  V.logReview({ card: young.id, ts: Date.now() - 5 * DAY, rating: 3 });
  V.logReview({ card: young.id, ts: Date.now() - 5 * DAY + 10 * MIN, rating: 3 });
});

describe("a card known for weeks", () => {
  it("is asked a new way, and a young one by its face", () => {
    expect(queued(old.id)).toMatchObject({ askNewWay: true });
    expect(queued(old.id)?.variant).toBeUndefined();
    expect(queued(young.id)).toBeDefined();
    expect(queued(young.id)?.askNewWay).toBeUndefined();
  });

  it("gets its question written, for this learner", async () => {
    reply = {
      questions: [asked(old.id, "Your coffee cools on the bike rack. Why?", "Heat flows hot to cold"), asked("k-none")],
    };
    const found = await K.cardVariants([old.id, young.id]);
    expect(found).toEqual({
      [old.id]: { question: "Your coffee cools on the bike rack. Why?", answer: "Heat flows hot to cold" },
    });
    const prompt = prompts.at(-1)!;
    expect(prompt).toContain("Heat flows from [hot to cold] on its own.");
    expect(prompt).toContain("cycling");
    expect(prompt).not.toContain("What is entropy?");
    expect(queued(old.id)?.variant?.question).toBe("Your coffee cools on the bike rack. Why?");
  });

  it("is written once, even when asked for twice at the same time", async () => {
    const count = prompts.length;
    await K.cardVariants([old.id]);
    expect(prompts.length).toBe(count);
    const other = K.saveCard({ front: "What does a heat engine need?", back: "A hot and a cold reservoir" });
    knownFor(other.id, 25);
    reply = { questions: [asked(other.id)] };
    const [a, b] = await Promise.all([K.cardVariants([other.id]), K.cardVariants([other.id])]);
    expect(prompts.length).toBe(count + 1);
    expect(a[other.id]).toEqual(b[other.id]);
  });

  it("is never written for a card that isn't known for weeks", async () => {
    const count = prompts.length;
    expect(await K.cardVariants([young.id, "k-missing"])).toEqual({});
    expect(prompts.length).toBe(count);
  });

  it("is rated as itself, logged as asked a new way, and shown by its face next time", () => {
    K.rateCard(old.id, 3, 7, true);
    expect(V.reviews().at(-1)).toMatchObject({ card: old.id, rating: 3, took: 7, variant: true });
    expect(queued(old.id)?.askNewWay).toBeUndefined();
    K.rateCard(old.id, 3);
    expect(V.reviews().at(-1)?.variant).toBeUndefined();
    // asked a new way again, with a question still to be written: the last one was used
    expect(queued(old.id)).toMatchObject({ askNewWay: true });
    expect(queued(old.id)?.variant).toBeUndefined();
  });

  it("gets a new question once the card is changed", async () => {
    reply = { questions: [asked(old.id, "First")] };
    await K.cardVariants([old.id]);
    D.updateDoc(old.id, { back: "The second law of thermodynamics" });
    expect(queued(old.id)?.variant).toBeUndefined();
    reply = { questions: [asked(old.id, "Second")] };
    expect((await K.cardVariants([old.id]))[old.id].question).toBe("Second");
  });

  it("gets nothing from a call that fails, and is tried again later", async () => {
    const card = K.saveCard({ front: "What is a reversible process?", back: "One that leaves no trace when undone" });
    knownFor(card.id, 25);
    reply = new Error("the model is unavailable");
    await expect(K.cardVariants([card.id])).rejects.toThrow(/unavailable/);
    expect(queued(card.id)?.variant).toBeUndefined();
    reply = { questions: [asked(card.id)] };
    expect(await K.cardVariants([card.id])).toEqual({ [card.id]: { question: "Q", answer: "A" } });
  });
});
