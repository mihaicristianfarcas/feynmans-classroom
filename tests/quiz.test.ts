// Quizzes written in notes: the ```quiz YAML format people and agents write, and the attempt that
// is added under it, with the corrections.
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { attemptMarkdown, quizBlocks, quizFromData } from "../shared/quiz.ts";

const NOTE = `# Replication

\`\`\`quiz
title: Replication, check yourself
questions:
  - q: Which setup lets any replica accept writes?
    choices: [Single-leader, Multi-leader, Leaderless]
    answer: 3
    why: Writes go to several replicas directly.
  - q: What is replication lag?
    answer: The delay before a write on the leader reaches a follower.
\`\`\`

After.
`;

describe("quizzes in notes", () => {
  it("are found in a note and read from their YAML", () => {
    const blocks = quizBlocks(NOTE);
    expect(blocks).toHaveLength(1);
    const quiz = quizFromData(parse(blocks[0]));
    expect(quiz.title).toBe("Replication, check yourself");
    expect(quiz.questions[0]).toMatchObject({ kind: "mcq", answer: 2, ideal: "Leaderless" });
    expect(quiz.questions[1]).toMatchObject({ kind: "short", ideal: expect.stringContaining("delay") });
  });
  it("accept the right choice by its text, and explain what's wrong", () => {
    const quiz = quizFromData({ questions: [{ q: "2 + 2?", choices: ["3", "4"], answer: "4" }] });
    expect(quiz.questions[0].answer).toBe(1);
    expect(() => quizFromData({ questions: [{ q: "2 + 2?", choices: ["3", "4"], answer: 5 }] })).toThrow(/1 to 2/);
    expect(() => quizFromData({ questions: [{ q: "Why?" }] })).toThrow(/model answer/);
    expect(() => quizFromData({ title: "Empty" })).toThrow(/at least one question/);
  });
  it("record an attempt as a folded callout with the corrections", () => {
    const quiz = quizFromData(parse(quizBlocks(NOTE)[0]));
    const md = attemptMarkdown(
      quiz,
      [
        { choice: 0, score: 0 },
        { text: "lag", score: 1 },
      ],
      new Date("2026-10-13T10:00:00Z"),
    );
    expect(md.split("\n")[0]).toBe("> [!attempt]- 2026-10-13 · 1/2 · Replication, check yourself");
    expect(md).toContain("> 1. ✗ Which setup lets any replica accept writes?");
    expect(md).toContain(">    - Mine: Single-leader");
    expect(md).toContain(">    - Correct: Leaderless. Writes go to several replicas directly.");
    expect(md).toContain("> 2. ✓ What is replication lag?");
  });
});
