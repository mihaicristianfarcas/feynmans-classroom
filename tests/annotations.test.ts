// Annotations: anchoring a selection (boxes, quote, context, the place in the book's Markdown), the
// annotation files, sending passages to notes, and placing annotations an agent wrote by hand.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makePdf } from "./helpers/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-annotations-"));
process.env.DATA_DIR = dir;

let V: typeof import("../server/vault/index.ts");
let A: typeof import("../server/annotations/index.ts");
let R: typeof import("../server/annotations/to-note.ts");
let N: typeof import("../server/learn/notes.ts");
let book: import("../server/books/types.ts").Book;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  const { ingestBook } = await import("../server/ingest/index.ts");
  const { exportBook } = await import("../server/vault/library.ts");
  A = await import("../server/annotations/index.ts");
  R = await import("../server/annotations/to-note.ts");
  N = await import("../server/learn/notes.ts");
  book = await ingestBook({
    name: "Tiny Physics.pdf",
    data: makePdf([
      [
        "Energy is conserved in every closed system.",
        "A pendulum trades height for speed and back again.",
        "Friction turns some of it into heat.",
      ],
      [
        "Momentum is mass times velocity.",
        "In a collision the total momentum stays the same.",
        "Elastic collisions also keep kinetic energy.",
      ],
    ]),
  });
  exportBook(book);
});

describe("annotations", () => {
  it("live beside the book, recording where the passage is", () => {
    expect(book.status).toBe("ready");
    const a = A.createAnnotation(book.id, {
      kind: "highlight",
      anchor: {
        page: 1,
        quote: "A pendulum trades height for speed",
        prefix: "every closed system. ",
        suffix: " and back again.",
        rects: [{ x: 0.118, y: 0.124, w: 0.42, h: 0.02 }],
      },
    });
    expect(a.path).toMatch(/^library\/tiny-physics\/annotations\/p1-highlight-a-pendulum-trades-height-for-\w{4}\.md$/);
    const text = readFileSync(join(V.VAULT, a.path), "utf8");
    expect(text).toMatch(/^kind: highlight$/m);
    expect(text).toMatch(/^book: tiny-physics$/m);
    expect(text).toMatch(/pdf: \{|pdf:\n/);
    expect(text).toMatch(/rects:\n\s+- \[0\.118, 0\.124, 0\.42, 0\.02\]/);
    expect(text).toMatch(/> \[!quote\] p\. 1\n> A pendulum trades height for speed/);
    // found in the book's Markdown text, with its line
    expect(a.anchor.md?.file).toMatch(/^library\/tiny-physics\/text\/01-.*\.md$/);
    const chapter = readFileSync(join(V.VAULT, a.anchor.md!.file), "utf8").split("\n");
    expect(chapter[a.anchor.md!.line - 1]).toContain("pendulum trades height");
    // and read back the same
    V.annotations.load();
    const back = V.annotations.get(a.id)!;
    expect(back.anchor.rects).toEqual([{ x: 0.118, y: 0.124, w: 0.42, h: 0.02 }]);
    expect(back.anchor.quote).toBe("A pendulum trades height for speed");
    expect(back.body).toBe("");
  });
  it("find their height on the page from the quote alone (as an agent would write them)", () => {
    const a = A.createAnnotation(book.id, {
      kind: "comment",
      anchor: { page: 2, quote: "In a collision the total momentum stays the same." },
      body: "Check this against the 2D case.",
    });
    expect(a.anchor.y).toBeGreaterThan(0.05);
    expect(a.anchor.y).toBeLessThan(0.25);
    expect(a.body).toBe("Check this against the 2D case.");
  });
  it("keep a figure as a fenced block", () => {
    const scene = { kind: "plot", title: "Energy", caption: "Height and speed trade.", params: [] } as never;
    const body = A.figureBody(scene);
    expect(body).toMatch(/^## Energy\n\nHeight and speed trade\.\n\n```figure\n/);
    expect(A.figureOf({ body } as never)).toMatchObject({ title: "Energy" });
  });
  it("go into notes as a reference, a quote, or embedded", () => {
    const a = V.annotations.list().find((x) => x.kind === "highlight")!;
    const link = a.path.replace(/\.md$/, "");
    expect(R.noteMarkdown(a, "reference")).toBe(
      `[[${link}|Tiny Physics, p. 1: “A pendulum trades height for speed…”]]`,
    );
    expect(R.noteMarkdown(a, "passage")).toBe(
      `> [!quote] [[${link}|Tiny Physics · p. 1]]\n> A pendulum trades height for speed`,
    );
    expect(R.noteMarkdown(a, "embed")).toBe(`![[${link}]]`);
    const note = N.bookNote(book.id);
    expect(note.title).toBe("Tiny Physics — notes");
    N.appendToNote(note.id, R.noteMarkdown(a, "passage"));
    expect(readFileSync(join(V.VAULT, note.path), "utf8")).toContain("> [!quote] [[library/tiny-physics/annotations/");
    expect(N.bookNote(book.id).id).toBe(note.id);
  });
  it("written outside the app are picked up and placed", async () => {
    const rel = "library/tiny-physics/annotations/p2-explain-agent.md";
    writeFileSync(
      join(V.VAULT, rel),
      `---\nid: aagent01\nkind: explain\nbook_id: ${book.id}\npage: 2\nanchor:\n  quote: Elastic collisions also keep kinetic energy.\n---\n\nThey bounce without losing energy to heat or sound.\n`,
    );
    V.reloadFile(rel);
    V.touched(rel);
    const a = V.annotations.get("aagent01")!;
    expect(a.kind).toBe("explain");
    expect(a.anchor.y).toBeGreaterThan(0.1);
    expect(a.anchor.md?.file).toMatch(/text\/01-/);
    expect(a.body).toBe("They bounce without losing energy to heat or sound.");
  });
});
