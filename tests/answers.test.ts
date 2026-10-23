// Grading short quiz answers: a grader that fails scores nothing, and its scores stay between 0 and 1
// (with a stand-in model).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-answers-"));
process.env.DATA_DIR = dir;

// the stand-in model answers with whatever the test sets
let reply: unknown = {};
vi.mock("../server/llm/index.ts", () => ({
  structured: async () => ({ data: reply }),
  text: async () => {
    throw new Error("no model in tests");
  },
  agent: async () => {
    throw new Error("no model in tests");
  },
  llmLoad: () => 0,
}));

let S: typeof import("../server/learn/study.ts");

beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  S = await import("../server/learn/study.ts");
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
