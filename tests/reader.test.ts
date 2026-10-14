// The reader's helpers: finding words in a book (across hyphenated lines, ignoring case and accents),
// numbering figures as the book numbers its chapters, the conversation kept on a margin card, and a
// conversation as text for a model.
import { describe, expect, it } from "vitest";
import { findInBlocks, findInPages } from "../server/books/find.ts";
import { chapterNumber, figurePrefix } from "../shared/chapters.ts";
import { followUpsOf, threadOf, transcript, withFollowUp } from "../shared/thread.ts";

const page = (n: number, lines: string[]) => ({
  n,
  w: 400,
  h: 600,
  lines: lines.map((t, i) => ({ t, y: 0.1 + i * 0.05, x: 0.1, s: 11 })),
});

describe("finding in a book", () => {
  const pages = [
    page(1, [
      "All through the calculus we are dealing with quantities that are grow-",
      "ing, and with rates of growth.",
    ]),
    page(2, ["A ﬁnal word on Café Growth.", "Nothing here."]),
  ];

  it("finds a word hyphenated across two lines, whole, with the line it starts on", () => {
    const hits = findInPages(pages, "growing");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ page: 1, quote: "growing" });
    expect(hits[0].y).toBeCloseTo(0.08);
    expect(hits[0].suffix).toMatch(/^, and with rates/);
  });

  it("ignores case, accents and ligatures", () => {
    expect(findInPages(pages, "cafe growth").map((h) => h.quote)).toEqual(["Café Growth"]);
    expect(findInPages(pages, "final").map((h) => [h.page, h.quote])).toEqual([[2, "ﬁnal"]]);
    expect(findInPages(pages, "GROWTH")).toHaveLength(2);
  });

  it("needs two letters, and stops at the limit", () => {
    expect(findInPages(pages, "a")).toEqual([]);
    expect(findInPages(pages, "th", 2)).toHaveLength(2);
  });

  it("finds in a reflowable book's blocks", () => {
    const blocks = [
      { id: 0, chapter: 0, tag: "p", html: "", text: "Replication means keeping a copy." },
      { id: 1, chapter: 0, tag: "p", html: "", text: "Leaders and followers keep copies too." },
    ];
    expect(findInBlocks(blocks, "cop").map((h) => [h.block, h.quote, h.prefix])).toEqual([
      [0, "cop", "Replication means keeping a "],
      [1, "cop", "Leaders and followers keep "],
    ]);
  });
});

describe("figure numbers", () => {
  it("read a chapter's own number from its title", () => {
    expect(chapterNumber("Chapter III. On Relative Growings")).toBe(3);
    expect(chapterNumber("CHAPTER XIV")).toBe(14);
    expect(chapterNumber("5. Replication")).toBe(5);
    expect(chapterNumber("Lecture 12: Waves")).toBe(12);
    expect(chapterNumber("I Am a Strange Loop")).toBeNull();
    expect(chapterNumber("Preface")).toBeNull();
  });

  it("number a chapter's figures under its own number, else its place, else a letter", () => {
    const numbered = [{ title: "Preface" }, { title: "Prologue" }, { title: "Chapter I" }, { title: "Chapter II" }];
    expect(figurePrefix(numbered, 3)).toBe("2");
    expect(figurePrefix(numbered, 0)).toBe("P");
    expect(figurePrefix([{ title: "Intro" }, { title: "Waves" }], 1)).toBe("2");
  });
});

describe("a margin card's conversation", () => {
  const body = withFollowUp(withFollowUp("The answer.", "Why?  Because\nI ask", "Since **so**."), "And?", "Then this.");

  it("is kept as follow-up sections, and read back as turns", () => {
    expect(body).toBe(
      "The answer.\n\n## Follow-up: Why? Because I ask\n\nSince **so**.\n\n## Follow-up: And?\n\nThen this.",
    );
    expect(threadOf(body)).toEqual({
      answer: "The answer.",
      turns: [
        { role: "user", text: "Why? Because I ask" },
        { role: "tutor", text: "Since **so**." },
        { role: "user", text: "And?" },
        { role: "tutor", text: "Then this." },
      ],
    });
  });

  it("can be carried over to a redrawn answer", () => {
    expect(followUpsOf(body)).toMatch(/^## Follow-up: Why\?/);
    expect(followUpsOf("Just an answer.")).toBe("");
    expect(threadOf("Just an answer.")).toEqual({ answer: "Just an answer.", turns: [] });
  });
});

describe("a conversation as text", () => {
  const turns = [
    { role: "user" as const, text: "Why is the sky blue?" },
    { role: "tutor" as const, text: "Blue scatters most. ".repeat(20) },
    { role: "user" as const, text: "And sunsets?" },
    { role: "tutor" as const, text: "The light crosses more air, so the blue is scattered away." },
  ];

  it("names who says what", () => {
    expect(transcript(turns.slice(2))).toBe(
      "Learner: And sunsets?\n\nTutor: The light crosses more air, so the blue is scattered away.",
    );
  });

  it("keeps the first question and the end when it is too long", () => {
    const short = transcript(turns, 200);
    expect(short.length).toBeLessThanOrEqual(200);
    expect(short.startsWith("Learner: Why is the sky blue?\n\n[…]\n\nLearner: And sunsets?")).toBe(true);
    expect(short.endsWith("so the blue is scattered away.")).toBe(true);
  });
});
