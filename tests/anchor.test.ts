import { describe, expect, it } from "vitest";
import { chapterRange, locateInBlocks, locateInPages, squash } from "../server/anchor.ts";
import type { Block, PageText } from "../server/types.ts";

const pages: PageText[] = [
  { n: 1, w: 400, h: 600, lines: [{ y: 0.1, x: 0.1, s: 12, t: "CHAPTER I." }, { y: 0.2, x: 0.1, s: 10, t: "Some words about nothing in particular." }] },
  {
    n: 2,
    w: 400,
    h: 600,
    lines: [
      { y: 0.1, x: 0.1, s: 10, t: "Suppose we make x to vary, that is to say, we either alter it or imag-" },
      { y: 0.13, x: 0.1, s: 10, t: "ine it to be altered, by adding to it a bit which we call dx. We are" },
      { y: 0.5, x: 0.1, s: 10, t: "thus causing x to become x + dx." },
    ],
  },
];

describe("squash", () => {
  it("keeps letters and digits only, so hyphenation and Markdown don't matter", () => {
    expect(squash("imag-\nine *it*  — to be")).toBe("imagineittobe");
    expect(squash("Café dx²")).toBe("cafedx2");
  });
});

describe("locateInPages", () => {
  it("finds an exact quote across a hyphenated line break", () => {
    const hit = locateInPages(pages, "we either alter it or imagine it to be altered");
    expect(hit?.loc).toEqual({ page: 2, y: 0.1 });
    expect(hit?.score).toBe(1);
  });
  it("finds the line a later quote starts on", () => {
    expect(locateInPages(pages, "thus causing x to become x + dx")?.loc).toEqual({ page: 2, y: 0.5 });
  });
  it("tolerates a quote that drifts at its edges", () => {
    const hit = locateInPages(pages, "adding to it a bit which we call dx, and so we are thus causing x to grow");
    expect(hit?.loc.page).toBe(2);
    expect(hit!.score).toBeGreaterThan(0.34);
  });
  it("returns null for text that isn't there", () => {
    expect(locateInPages(pages, "a completely different sentence about chemistry")).toBeNull();
  });
  it("respects the page range", () => {
    expect(locateInPages(pages, "Some words about nothing in particular", { from: 2, to: 2 })).toBeNull();
  });
});

describe("chapter edges on a shared page", () => {
  it("doesn't anchor into the next chapter's part of a boundary page", () => {
    // page 2 holds the end of chapter A (y < 0.5) and the start of chapter B (y >= 0.5)
    expect(locateInPages(pages, "thus causing x to become x + dx", { from: 1, to: 2, toY: 0.5 })).toBeNull();
    expect(locateInPages(pages, "thus causing x to become x + dx", { from: 2, to: 2, fromY: 0.5 })?.loc).toEqual({ page: 2, y: 0.5 });
  });
});

describe("locateInBlocks", () => {
  const blocks: Block[] = ["Lecture one.", "The candle flame is hollow.", "Air rushes in at the bottom of the flame."].map((text, id) => ({ id, chapter: 0, tag: "p", html: text, text }));
  it("finds the block a quote starts in", () => {
    expect(locateInBlocks(blocks, "Air rushes in at the bottom")?.loc).toEqual({ block: 2 });
  });
});

describe("chapterRange", () => {
  it("covers pages for PDFs and blocks for reflowable books", () => {
    expect(chapterRange({ id: "c1", title: "", start: { page: 20, y: 0.1 }, end: { page: 28, y: 0.4 }, sections: [] })).toEqual({ from: 20, to: 28, fromY: 0.1, toY: 0.4 });
    expect(chapterRange({ id: "c1", title: "", start: { block: 4 }, end: { block: 9 }, sections: [] })).toEqual({ from: 4, to: 9 });
  });
});
