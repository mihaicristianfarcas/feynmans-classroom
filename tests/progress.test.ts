// Progress through a book and an honest pace: how far a position is through a PDF or a reflowable book,
// rough durations, an estimate only from two or more days of recent reading that got somewhere (and a
// slower one for a book begun since), the end of a book, the line Today shows and the progress beside each of
// its books, and when a book was last touched.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Book } from "../server/books/types.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-progress-"));
process.env.DATA_DIR = dir;

const DAY = 86400000;
let V: typeof import("../server/vault/index.ts");
let P: typeof import("../server/learn/progress.ts");
let saveBook: typeof import("../server/books/store.ts").saveBook;
let today: typeof import("../server/learn/journey.ts").today;

const book = (id: string, extra: Partial<Book> = {}): Book => {
  const b: Book = {
    id,
    title: `Book ${id}`,
    format: "pdf",
    file: "book.pdf",
    pageCount: 100,
    toc: [],
    createdAt: new Date(Date.now() - 60 * DAY).toISOString(),
    status: "ready",
    ...extra,
  };
  saveBook(b);
  return b;
};
/** A sitting that ended `daysAgo` at `share` (0–1) of a 100-page PDF. */
const read = (bookId: string, daysAgo: number, share: number, chapter = "Chapter 2") =>
  V.logActivity({
    type: "read",
    bookId,
    ts: Date.now() - daysAgo * DAY,
    text: "Read 20 min",
    data: { minutes: 20, chapter, position: 1 + share * 100 },
  });

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  P = await import("../server/learn/progress.ts");
  ({ saveBook } = await import("../server/books/store.ts"));
  ({ today } = await import("../server/learn/journey.ts"));
});

describe("how far through a book", () => {
  it("is the page (from 1) of a PDF, or the block (from 0) of another book, over its length", () => {
    const pdf = book("pdf1");
    expect(P.fractionOf(pdf, 1)).toBe(0);
    expect(P.fractionOf(pdf, 51)).toBe(0.5);
    expect(P.fractionOf(pdf, 101)).toBe(1);
    const epub = book("epub1", { format: "epub", pageCount: undefined, blockCount: 200 });
    expect(P.fractionOf(epub, 50)).toBe(0.25);
    expect(P.fractionOf(book("unknown", { pageCount: undefined }), 10)).toBeNull();
  });

  it("is said roughly", () => {
    expect(P.roughly(2)).toBe("a few days");
    expect(P.roughly(7)).toBe("about a week");
    expect(P.roughly(35)).toBe("about 5 weeks");
    expect(P.roughly(90)).toBe("about 3 months");
    expect(P.roughly(400)).toBe("more than a year");
  });
});

describe("the pace", () => {
  it("is nothing for a book never read", () => {
    book("unread");
    expect(P.bookProgress("unread")).toBeNull();
  });

  it("isn't estimated from one day of reading", () => {
    book("one-day");
    read("one-day", 1, 0.3);
    read("one-day", 1.1, 0.25);
    expect(P.bookProgress("one-day")).toEqual({ fraction: 0.3 });
  });

  it("comes from the headway of the last two weeks", () => {
    book("steady");
    read("steady", 20, 0.2);
    read("steady", 10, 0.3);
    read("steady", 2, 0.4);
    // 20% in 14 days, 60% to go: 42 days
    expect(P.bookProgress("steady")).toEqual({ fraction: 0.4, finishIn: "about 6 weeks" });
  });

  it("leaves out the first sitting of a book begun since, so it is slower, never flattering", () => {
    book("begun");
    read("begun", 5, 0.1);
    read("begun", 1, 0.24);
    // 14% in 14 days, 76% to go: 76 days
    expect(P.bookProgress("begun")).toEqual({ fraction: 0.24, finishIn: "about 3 months" });
  });

  it("isn't estimated when the place went back", () => {
    book("back");
    read("back", 20, 0.5);
    read("back", 6, 0.3);
    read("back", 1, 0.35);
    expect(P.bookProgress("back")).toEqual({ fraction: 0.35 });
  });

  it("ends at the end", () => {
    book("done");
    read("done", 3, 0.6);
    read("done", 1, 0.98);
    expect(P.bookProgress("done")).toEqual({ fraction: 1 });
  });
});

describe("Today", () => {
  it("says where you are in the last book you read, and when you'd finish it", () => {
    book("latest", { title: "Thermodynamics" });
    read("latest", 20, 0.2, "Chapter 1");
    read("latest", 10, 0.3, "Chapter 2");
    read("latest", 0.01, 0.4, "Chapter 3");
    const next = today().suggestions.find((s) => s.kind === "read");
    expect(next).toMatchObject({
      title: "Continue Thermodynamics",
      detail:
        "You were in Chapter 3, 40% of the way through. At your pace over the last two weeks, about 6 weeks to the end.",
    });
    expect(today().books.find((b) => b.id === "latest")?.progress).toEqual({
      fraction: 0.4,
      finishIn: "about 6 weeks",
    });
  });
});

describe("where you were in a book", () => {
  it("is where you last read, whatever was done with the book since", () => {
    book("since", { title: "Optics" });
    read("since", 2, 0.3, "Chapter 4");
    V.logActivity({ type: "highlight", bookId: "since", ts: Date.now() - 1000, text: "Highlighted" });
    expect(today().books.find((b) => b.id === "since")).toMatchObject({ chapter: "Chapter 4", position: 31 });
  });
});

describe("when a book was last touched", () => {
  it("is the latest thing done with it, of any kind", () => {
    book("touched");
    expect(P.lastTouched("touched")).toBeNull();
    read("touched", 3, 0.1);
    const ts = Date.now() - DAY;
    V.logActivity({ type: "highlight", bookId: "touched", ts, text: "Highlighted" });
    expect(P.lastTouched("touched")).toBe(ts);
  });
});
