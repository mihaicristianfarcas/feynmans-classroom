// Reading books: Markdown and text, PDF line joining and chapter titles, page text, and EPUBs (with
// their cover pictures).
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { joinLines, pagesText, titleCase } from "../server/ingest/pdf.ts";
import { ingestText } from "../server/ingest/text.ts";

describe("ingestText", () => {
  it("turns Markdown headings into chapters and paragraphs into blocks", () => {
    const dir = mkdtempSync(join(tmpdir(), "classroom-test-"));
    const path = join(dir, "book.md");
    writeFileSync(
      path,
      "# A Small Book\n\n## One\n\nFirst *idea* here.\n\nMore text.\n\n## Two\n\n- a list item\n- another\n\nThe end.",
    );
    const book = ingestText(path, true);
    expect(book.title).toBe("A Small Book");
    expect(book.toc.map((c) => c.title)).toEqual(["One", "Two"]);
    expect(book.blocks.find((b) => b.text === "First idea here.")?.html).toBe("First <em>idea</em> here.");
    expect(book.blocks.filter((b) => b.tag === "li")).toHaveLength(2);
    // every block knows its chapter
    expect(book.blocks.at(-1)?.chapter).toBe(1);
  });
  it("detects CHAPTER lines in plain text and strips Gutenberg boilerplate", () => {
    const dir = mkdtempSync(join(tmpdir(), "classroom-test-"));
    const path = join(dir, "book.txt");
    writeFileSync(
      path,
      "Header junk\n\n*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\nCHAPTER I.\n\nIt was a dark night.\n\nCHAPTER II.\n\nMorning came.\n\n*** END OF THE PROJECT GUTENBERG EBOOK X ***\n\nLicense text",
    );
    const book = ingestText(path, false);
    expect(book.blocks.some((b) => b.text.includes("Header junk"))).toBe(false);
    expect(book.blocks.some((b) => b.text.includes("License"))).toBe(false);
    expect(book.toc.map((c) => c.title)).toEqual(["Chapter I", "Chapter II"]);
  });
});

describe("titleCase", () => {
  it("title-cases shouting headings but keeps roman numerals", () => {
    expect(titleCase("LECTURE III.")).toBe("Lecture III");
    expect(titleCase("ON DIFFERENT DEGREES OF SMALLNESS.")).toBe("On Different Degrees of Smallness");
    expect(titleCase("PRODUCTS: WATER FROM THE COMBUSTION—NATURE OF WATER")).toBe(
      "Products: Water from the Combustion—Nature of Water",
    );
  });
  it("leaves mixed-case titles alone", () => {
    expect(titleCase("Chapter One")).toBe("Chapter One");
  });
});

describe("joinLines", () => {
  it("rejoins words hyphenated at line ends", () => {
    expect(joinLines(["we either alter it or imag-", "ine it"])).toBe("we either alter it or imagine it");
  });
});

describe("pagesText", () => {
  const pages = [
    {
      n: 1,
      w: 400,
      h: 600,
      lines: [
        { y: 0.1, x: 0, s: 10, t: "end of the previous chapter" },
        { y: 0.5, x: 0, s: 14, t: "CHAPTER TWO" },
        { y: 0.6, x: 0, s: 10, t: "its first line" },
      ],
    },
    { n: 2, w: 400, h: 600, lines: [{ y: 0.1, x: 0, s: 10, t: "second page" }] },
  ];
  it("prefers the Markdown of whole pages", () => {
    expect(pagesText(pages, 2, 2, Infinity, ["", "## Second *page*"])).toContain("## Second *page*");
  });
  it("takes only the chapter's own lines from a page it starts halfway down", () => {
    const text = pagesText(pages, 1, 2, Infinity, ["whole page one", "whole page two"], { fromY: 0.5 });
    expect(text).not.toContain("previous chapter");
    expect(text).toContain("CHAPTER TWO");
    expect(text).toContain("whole page two");
  });
});

import JSZip from "jszip";
import { ingestEpub } from "../server/ingest/epub.ts";

describe("ingestEpub", () => {
  const epub = async (chapter: string, cover?: "epub3" | "epub2") => {
    const zip = new JSZip();
    zip.file(
      "META-INF/container.xml",
      '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
    );
    const meta = cover === "epub2" ? '<meta name="cover" content="pic"/>' : "";
    const pic = cover
      ? `<item id="pic" href="images/front.jpg" media-type="image/jpeg"${cover === "epub3" ? ' properties="cover-image"' : ""}/>`
      : "";
    zip.file(
      "OEBPS/book.opf",
      `<package><metadata><dc:title>Bomb</dc:title>${meta}</metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>${pic}</manifest><spine><itemref idref="c1"/></spine></package>`,
    );
    zip.file("OEBPS/c1.xhtml", chapter);
    if (cover) zip.file("OEBPS/images/front.jpg", Buffer.from("not really a jpeg"));
    const dir = mkdtempSync(join(tmpdir(), "classroom-epub-"));
    const path = join(dir, "book.epub");
    writeFileSync(path, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
    return { path, dir };
  };
  it("reads a minimal EPUB", async () => {
    const { path, dir } = await epub(
      "<html><body><h1>One</h1><p>A candle burns.</p><h1>Two</h1><p>Water forms.</p></body></html>",
    );
    const book = await ingestEpub(path, join(dir, "assets"), (a) => a);
    expect(book.blocks.map((b) => b.text)).toContain("A candle burns.");
  });
  it("names its cover picture, marked the EPUB 3 way or the EPUB 2 way", async () => {
    const body = "<html><body><h1>One</h1><p>A candle burns.</p></body></html>";
    for (const kind of ["epub3", "epub2"] as const) {
      const { path, dir } = await epub(body, kind);
      expect((await ingestEpub(path, join(dir, "assets"), (a) => a)).cover).toBe("OEBPS/images/front.jpg");
    }
    const { path, dir } = await epub(body);
    expect((await ingestEpub(path, join(dir, "assets"), (a) => a)).cover).toBeUndefined();
  });
  it("refuses an archive that inflates past its budget", async () => {
    const { path, dir } = await epub(`<html><body><p>${"a".repeat(70 * 1024 * 1024)}</p></body></html>`);
    await expect(ingestEpub(path, join(dir, "assets"), (a) => a)).rejects.toThrow(/unpacks to more than/);
  });
  it("refuses an EPUB without readable text", async () => {
    const { path, dir } = await epub("<html><body></body></html>");
    await expect(ingestEpub(path, join(dir, "assets"), (a) => a)).rejects.toThrow(/no readable text/);
  });
});
