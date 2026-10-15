// Two-up PDFs: telling facing pages on one sheet from a landscape page, and splitting them into single pages.
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { findGutter } from "../server/ingest/spreads.ts";
import { makePdf, makeSpreadPdf } from "./helpers/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-spreads-"));
process.env.DATA_DIR = dir;

const page = (tag: string) =>
  Array.from({ length: 24 }, (_, i) => `${tag}: sentence ${i + 1} of this page, about energy and motion.`);

let ingestBook: typeof import("../server/ingest/index.ts").ingestBook;
let store: typeof import("../server/books/store.ts");
beforeAll(async () => {
  ({ ingestBook } = await import("../server/ingest/index.ts"));
  store = await import("../server/books/store.ts");
});

describe("findGutter", () => {
  const column = (from: number, to: number) => Array.from({ length: 20 }, () => [from, to] as [number, number]);
  it("finds the clear band between two pages", () => {
    expect(findGutter([...column(0.06, 0.44), ...column(0.56, 0.94)])).toBeCloseTo(0.5, 1);
    // a scan that drifts off centre
    expect(findGutter([...column(0.04, 0.4), ...column(0.47, 0.9)])).toBeGreaterThan(0.4);
  });
  it("finds none on a landscape page whose text runs across the middle", () => {
    expect(findGutter(column(0.1, 0.9))).toBeNull();
    expect(findGutter(column(0.06, 0.44))).toBeNull();
  });
});

describe("ingesting a two-up PDF", () => {
  it("splits each sheet into its left page and its right page", async () => {
    const book = await ingestBook({
      name: "Facing Pages.pdf",
      data: makeSpreadPdf([
        [page("one"), page("two")],
        [page("three"), page("four")],
      ]),
    });
    expect(book.status).toBe("ready");
    expect(book.spreads).toBe(2);
    expect(book.pageCount).toBe(4);
    const pages = store.getPages(book.id);
    expect(pages.map((p) => [p.w, p.h])).toEqual(Array(4).fill([612, 792]));
    // each page holds its own text only, in its own lines, not the facing page's beside it
    for (const [i, tag] of ["one", "two", "three", "four"].entries()) {
      expect(pages[i].lines.length).toBeGreaterThan(20);
      expect(pages[i].lines.every((l) => l.t.startsWith(`${tag}:`))).toBe(true);
    }
    expect(store.getMarkdown(book.id)[1]).not.toMatch(/one:/);
    // the file as it came is kept
    expect(existsSync(join(store.bookDir(book.id), "original.pdf"))).toBe(true);
  });

  it("splits sheets stored turned (a portrait page at /Rotate 90) into upright pages", async () => {
    const book = await ingestBook({
      name: "Scanned Spreads.pdf",
      data: makeSpreadPdf([[page("one"), page("two")]], { turned: true }),
    });
    expect(book.spreads).toBe(1);
    const pages = store.getPages(book.id);
    expect(pages.map((p) => [p.w, p.h])).toEqual([
      [612, 792],
      [612, 792],
    ]);
    for (const [i, tag] of ["one", "two"].entries()) {
      expect(pages[i].lines.every((l) => l.t.startsWith(`${tag}:`) && l.y >= 0 && l.y <= 1)).toBe(true);
      expect(pages[i].lines[0].t).toBe(`${tag}: sentence 1 of this page, about energy and motion.`);
    }
    // upright: the pages carry no rotation for the reader's text layer to get wrong
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await getDocument({ data: new Uint8Array(readFileSync(join(store.bookDir(book.id), "source.pdf"))) })
      .promise;
    expect((await pdf.getPage(1)).rotate).toBe(0);
    await pdf.destroy();
  });

  it("leaves an ordinary book alone", async () => {
    const book = await ingestBook({ name: "Portrait.pdf", data: makePdf([page("a"), page("b")]) });
    expect(book.spreads).toBeUndefined();
    expect(book.pageCount).toBe(2);
    expect(existsSync(join(store.bookDir(book.id), "original.pdf"))).toBe(false);
  });

  it("leaves landscape pages alone when their text crosses the middle", async () => {
    const wide = Array.from(
      { length: 24 },
      (_, i) => `Row ${i + 1}: ${"a long line across the whole sheet ".repeat(4)}`,
    );
    const book = await ingestBook({ name: "Slides.pdf", data: makeSpreadPdf([[wide, []]]) });
    expect(book.spreads).toBeUndefined();
    expect(book.pageCount).toBe(1);
  });
});
