// Quiz answers as evidence: each answer counts toward its concept's mastery, fading over time, a miss
// counting against it and a pretest not at all; cards and quizzes weigh the same; the mixed review asks
// about the weakest concepts first; and a grader that fails scores nothing (with a stand-in model).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-answers-"));
process.env.DATA_DIR = dir;

// the stand-in model answers with whatever the test sets, and keeps the prompt it was given
let reply: unknown = {};
const prompts: string[] = [];
vi.mock("../server/llm/index.ts", () => ({
  structured: async (options: { prompt: string }) => {
    prompts.push(options.prompt);
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
let V: typeof import("../server/vault/index.ts");
let S: typeof import("../server/learn/study.ts");
let mastery: typeof import("../server/learn/context.ts").conceptMastery;
let findConcept: typeof import("../server/learn/concepts.ts").findConcept;
let upsertConcept: typeof import("../server/learn/concepts.ts").upsertConcept;
let saveCard: typeof import("../server/learn/cards.ts").saveCard;
let rateCard: typeof import("../server/learn/cards.ts").rateCard;

const quiz = (mode: string, answers: { concept: string; score: number }[]) =>
  S.recordQuiz({
    title: "Thermodynamics",
    mode,
    score: answers.reduce((s, a) => s + a.score, 0),
    total: answers.length,
    concepts: [],
    answers,
  });
const idOf = (name: string) => findConcept(name)!.id;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  S = await import("../server/learn/study.ts");
  ({ conceptMastery: mastery } = await import("../server/learn/context.ts"));
  ({ findConcept, upsertConcept } = await import("../server/learn/concepts.ts"));
  ({ saveCard, rateCard } = await import("../server/learn/cards.ts"));
});

describe("quiz answers as evidence", () => {
  it("give a concept nothing else knows about a mastery, which fades", () => {
    quiz("check", [{ concept: "Entropy", score: 1 }]);
    const now = mastery(idOf("Entropy"))!;
    const month = mastery(idOf("Entropy"), Date.now() + 30 * DAY)!;
    expect(now).toBeGreaterThan(0.95);
    expect(month).toBeLessThan(0.8);
    expect(month).toBeGreaterThan(0.4);
    const logged = V.activity().at(-1)!;
    expect(logged.concepts).toEqual([idOf("Entropy")]);
    expect(logged.data?.answers).toEqual([{ concept: idOf("Entropy"), score: 1 }]);
  });

  it("count a miss against the concept, but not a pretest's", () => {
    quiz("pretest", [{ concept: "Enthalpy", score: 0 }]);
    expect(mastery(idOf("Enthalpy"))).toBeNull();
    quiz("check", [{ concept: "Enthalpy", score: 0 }]);
    expect(mastery(idOf("Enthalpy"))).toBe(0);
  });

  it("weigh the latest quizzes most, and average a quiz's answers on one concept", () => {
    const at = Date.now() - DAY;
    const log = (concept: string, scores: number[], ts: number) =>
      V.logActivity({
        type: "quiz",
        text: "Quiz",
        ts,
        data: { mode: "check", answers: scores.map((score) => ({ concept, score })) },
      });
    upsertConcept({ name: "Heat engine" });
    upsertConcept({ name: "Carnot cycle" });
    log(idOf("Heat engine"), [0], at - DAY);
    log(idOf("Heat engine"), [1, 1], at);
    log(idOf("Carnot cycle"), [1], at - DAY);
    log(idOf("Carnot cycle"), [1, 0, 0], at);
    // missed long ago, right since: better than right long ago, mostly missed since
    expect(mastery(idOf("Heat engine"))!).toBeGreaterThan(mastery(idOf("Carnot cycle"))!);
  });

  it("weigh the same as the concept's cards", () => {
    quiz("check", [{ concept: "Free energy", score: 0 }]);
    const card = saveCard({ front: "G = ?", back: "H − TS", concepts: [idOf("Free energy")] });
    rateCard(card.id, 3);
    expect(mastery(idOf("Free energy"))!).toBeCloseTo(0.5, 1);
  });

  it("put the weakest concepts first in a mixed review", async () => {
    reply = { title: "Mixed", questions: [] };
    await S.makeQuiz({ mode: "review" });
    const prompt = prompts.at(-1)!;
    const at = (name: string) => prompt.indexOf(`- ${name}:`);
    expect(at("Enthalpy")).toBeGreaterThan(-1);
    expect(at("Enthalpy")).toBeLessThan(at("Free energy"));
    expect(at("Free energy")).toBeLessThan(at("Entropy"));
  });
});

describe("a grader that fails", () => {
  const items = [
    { question: "What is entropy?", ideal: "A measure of disorder.", answer: "Disorder" },
    { question: "What is enthalpy?", ideal: "Heat content.", answer: "Heat" },
  ];
  it("is an error, not a zero, when it doesn't score every answer", async () => {
    reply = { results: [{ score: 1, feedback: "Right." }] };
    await expect(S.gradeShortAnswers(items)).rejects.toThrow(/didn't score every answer/);
    reply = {
      results: [
        { score: 1, feedback: "Right." },
        { score: Number.NaN, feedback: "?" },
      ],
    };
    await expect(S.gradeShortAnswers(items)).rejects.toThrow(/didn't score every answer/);
  });
  it("has its scores kept between 0 and 1", async () => {
    reply = {
      results: [
        { score: 85, feedback: "Right." },
        { score: -1, feedback: "No." },
      ],
    };
    expect((await S.gradeShortAnswers(items)).map((r) => r.score)).toEqual([1, 0]);
  });
});
