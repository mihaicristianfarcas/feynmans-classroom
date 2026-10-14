// The library's bookcase: each book's look fixed by its id (its topic's pastel, a thickness from its
// length), sorting and the runs labelled under the planks, and where books stand: in runs left to right,
// a new shelf when one is full, and labels that never meet. And the topics' tags.
import { describe, expect, it } from "vitest";
import { cleanTags, isTopic, topicOf } from "../shared/topics.ts";
import type { Book } from "../web/src/api/types.ts";
import {
  AREA,
  arrange,
  groupOf,
  labelWidth,
  lookOf,
  minutesOf,
  PAD,
  PITCH,
  sortBooks,
} from "../web/src/library/shelf.ts";

const book = (id: string, over: Partial<Book> = {}): Book => ({
  id,
  title: `Book ${id}`,
  format: "text",
  toc: [],
  createdAt: "2026-10-01T10:00:00.000Z",
  status: "ready",
  words: 23000,
  ...over,
});

describe("a book's look", () => {
  it("is the same every time, in its topic's pastel, and thicker the longer it is", () => {
    const a = book("b1", { topic: "physics" });
    expect(lookOf(a)).toEqual(lookOf({ ...a }));
    expect(lookOf(a).tone).toBe("sky");
    expect(lookOf(book("b1")).tone).toBe("paper");
    expect(lookOf(book("b2", { words: 900 })).w).toBeLessThan(lookOf(book("b2", { words: 200000 })).w);
    expect(lookOf(book("b3", { words: 1e7 })).w).toBe(68);
    expect(minutesOf(book("b4", { words: 2300 }))).toBe(10);
  });
});

describe("sorting the shelf", () => {
  const books = [
    book("a", { topic: "history", title: "The Zebra", createdAt: "2026-09-01T00:00:00Z", words: 90000 }),
    book("b", { topic: "math", title: "An Apple", createdAt: "2026-10-05T00:00:00Z", words: 2000 }),
    book("c", { title: "Middle", createdAt: "2026-10-01T00:00:00Z", words: 20000 }),
  ];
  it("by topic in the topics' order (unsorted last), by date, title (without articles) and length", () => {
    expect(sortBooks(books, "topic").map((b) => b.id)).toEqual(["b", "a", "c"]);
    expect(sortBooks(books, "recent").map((b) => b.id)).toEqual(["b", "c", "a"]);
    expect(sortBooks(books, "title").map((b) => b.id)).toEqual(["b", "c", "a"]);
    expect(sortBooks(books, "length").map((b) => b.id)).toEqual(["b", "c", "a"]);
  });
  it("labels runs by topic, month or length", () => {
    expect(groupOf(books[1], "topic")).toMatchObject({ label: "Mathematics", topic: "math" });
    expect(groupOf(books[2], "topic")).toMatchObject({ label: "Being sorted" });
    expect(groupOf(books[0], "recent")?.label).toBe("September 2026");
    expect(groupOf(books[1], "length")?.label).toBe("A sitting");
    expect(groupOf(books[1], "title")).toBeNull();
  });
});

describe("where books stand", () => {
  it("stands runs left to right on a plank, a gap between them, and wraps to a new shelf", () => {
    const books = Array.from({ length: 30 }, (_, i) => book(`x${i}`, { topic: i < 15 ? "math" : "physics" }));
    const { spots, labels, rows } = arrange(books, 900, "topic");
    expect(rows).toBeGreaterThan(1);
    const first = spots.get("x0")!;
    expect(first.x).toBe(PAD);
    // every book's foot is on its plank
    for (const b of books) {
      const s = spots.get(b.id)!;
      expect(s.y + lookOf(b).h).toBe(s.row * PITCH + AREA);
      expect(s.x + lookOf(b).w).toBeLessThanOrEqual(900 - PAD);
    }
    expect(labels.map((l) => l.label)).toEqual(["Mathematics", "Physics"]);
  });
  it("keeps labels on one shelf from meeting, however short their runs", () => {
    const keys = ["math", "physics", "chemistry", "biology", "medicine", "mind", "computing", "ai"];
    const books = keys.map((topic, i) => book(`t${i}`, { topic, words: 500 }));
    const { labels } = arrange(books, 1200, "topic");
    for (let i = 1; i < labels.length; i++)
      if (labels[i].row === labels[i - 1].row)
        expect(labels[i].x).toBeGreaterThanOrEqual(labels[i - 1].x + labelWidth(labels[i - 1]));
  });
});

describe("topics", () => {
  it("knows its topics, calls anything else Other, and keeps tags short and few", () => {
    expect(isTopic("physics")).toBe(true);
    expect(isTopic("astrology")).toBe(false);
    expect(topicOf("astrology").key).toBe("other");
    expect(
      cleanTags(
        ["Quantum Mechanics", "physics", "quantum mechanics", "a".repeat(40), "waves!", "light", "extra"],
        "physics",
      ),
    ).toEqual(["quantum mechanics", "waves", "light"]);
  });
});
