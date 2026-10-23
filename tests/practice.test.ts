// Worked examples, then practice: an answer that is plainly right is checked without a model (and
// nothing is called wrong without one); a session is written from a passage or a concept (a stand-in
// model), kept as a note of exercises with folded solutions, and counted toward its concept.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { numberOf, sameAnswer } from "../shared/practice.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-practice-"));
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

let V: typeof import("../server/vault/index.ts");
let P: typeof import("../server/learn/practice.ts");
let S: typeof import("../server/learn/study.ts");
let C: typeof import("../server/learn/concepts.ts");
let mastery: typeof import("../server/learn/context.ts").conceptMastery;

const problem = (n: number) => ({
  problem: `Add $\\frac{1}{${n}}$ and $\\frac{1}{${n + 1}}$.`,
  answer: `${2 * n + 1}/${n * (n + 1)}`,
  accept: [],
  steps: [
    { label: "Find the common denominator", work: `$${n} \\cdot ${n + 1} = ${n * (n + 1)}$` },
    { label: "Rewrite both fractions", work: "…" },
    { label: "Add the numerators", work: "…" },
  ],
});
const SESSION = {
  title: "Adding fractions with different denominators",
  concept: "Adding fractions",
  example: problem(2),
  problems: [problem(3), problem(4), problem(5), problem(6)],
  easier: { ...problem(1), problem: "Add $\\frac{1}{2}$ and $\\frac{1}{2}$.", answer: "1" },
};

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  P = await import("../server/learn/practice.ts");
  S = await import("../server/learn/study.ts");
  C = await import("../server/learn/concepts.ts");
  ({ conceptMastery: mastery } = await import("../server/learn/context.ts"));
  await V.saveProfile({ name: "Ada", interests: ["cycling"], onboarded: true });
});

describe("checking an answer without a model", () => {
  it("accepts the answer however it is plainly written", () => {
    expect(sameAnswer("3/4", "0.75")).toBe(true);
    expect(sameAnswer("x = 5", "5")).toBe(true);
    expect(sameAnswer("1,000", "1000")).toBe(true);
    expect(sameAnswer("50%", "0.5")).toBe(true);
    expect(sameAnswer("−2", "-2")).toBe(true);
    expect(sameAnswer(" Mitochondria. ", "mitochondria")).toBe(true);
    expect(sameAnswer("$\\frac{3}{4}$", "3/4", ["\\frac{3}{4}"])).toBe(true);
  });
  it("leaves anything else to the grader", () => {
    expect(sameAnswer("4", "5")).toBe(false);
    expect(sameAnswer("1,2", "12")).toBe(false);
    expect(sameAnswer("", "0")).toBe(false);
    expect(sameAnswer("2x", "2*x")).toBe(false);
    expect(numberOf("3/0")).toBeNull();
  });
});

describe("a practice session", () => {
  it("is written from a passage, for this learner", async () => {
    reply = SESSION;
    const p = await P.makePractice({ passage: "To add fractions, first find a common denominator." });
    expect(p.id).toMatch(/^p/);
    expect(p.problems).toHaveLength(4);
    const prompt = prompts.at(-1)!;
    expect(prompt).toContain("To add fractions, first find a common denominator.");
    expect(prompt).toContain("what it achieves");
    expect(prompt).toContain("cycling");
  });

  it("practises a known concept under its own name", async () => {
    C.upsertConcept({ name: "Fraction addition", summary: "Adding fractions by a common denominator." });
    reply = { ...SESSION, concept: "Adding fractions" };
    const p = await P.makePractice({ concept: "fraction addition" });
    expect(p.concept).toBe("Fraction addition");
    expect(prompts.at(-1)).toContain("The concept to practise: Fraction addition.");
  });

  it("refuses an empty worked example, and an empty request", async () => {
    reply = { ...SESSION, example: { ...SESSION.example, steps: [] } };
    await expect(P.makePractice({ passage: "Something." })).rejects.toThrow(/came back empty/);
    await expect(P.makePractice({})).rejects.toThrow(/passage or a concept/);
  });

  it("is kept as a note of exercises, its solutions folded", () => {
    const note = P.savePractice({ ...SESSION, id: "p1" });
    expect(note).toMatchObject({
      type: "exercises",
      tags: ["practice"],
      title: "Practice — Adding fractions with different denominators",
    });
    const text = readFileSync(join(V.VAULT, note.path), "utf8");
    expect(text).toContain("## Worked example");
    expect(text).toContain("**1. Find the common denominator**");
    expect(text).toContain("> [!exercise] Problem 1\n> Add $\\frac{1}{3}$ and $\\frac{1}{4}$.");
    expect(text).toContain("> [!solution]-\n> **1. Find the common denominator**");
    expect(text).toContain("> [!exercise] A gentler one");
    expect(text).toContain("About [[Adding fractions]].");
    expect(note.concepts).toEqual([C.findConcept("Adding fractions")!.id]);
  });

  it("counts toward its concept, logged as practice", () => {
    S.recordQuiz({
      title: SESSION.title,
      mode: "practice",
      score: 1,
      total: 2,
      concepts: ["Adding fractions"],
      answers: [
        { concept: "Adding fractions", score: 0 },
        { concept: "Adding fractions", score: 1 },
      ],
    });
    expect(V.activity().at(-1)?.text).toBe(`Practice: ${SESSION.title} · 1/2`);
    expect(mastery(C.findConcept("Adding fractions")!.id)).toBeCloseTo(0.5, 2);
  });
});
