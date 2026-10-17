// Annotations: anchoring a selection (boxes, quote, context, the place in the book's Markdown), the
// annotation documents, sending passages to notes, and placing annotations an agent wrote by hand.
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
let D: typeof import("../server/learn/docs.ts");
let book: import("../server/books/types.ts").Book;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  const { ingestBook } = await import("../server/ingest/index.ts");
  const { exportBook } = await import("../server/vault/library.ts");
  A = await import("../server/annotations/index.ts");
  R = await import("../server/annotations/to-note.ts");
  D = await import("../server/learn/docs.ts");
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
      type: "highlight",
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
    expect(text).toMatch(/^kind: annotation$/m);
    expect(text).toMatch(/^type: highlight$/m);
    expect(text).not.toMatch(/^title:/m);
    expect(text).toMatch(new RegExp(`^source:\\n  book: ${book.id}\\n  chapter: `, "m"));
    expect(text).toMatch(/rects:\n\s+- \[0\.118, 0\.124, 0\.42, 0\.02\]/);
    expect(text).toMatch(/> \[!quote\] p\. 1\n> A pendulum trades height for speed/);
    // found in the book's Markdown text, with its line
    expect(a.source.md?.file).toMatch(/^library\/tiny-physics\/text\/01-.*\.md$/);
    const chapter = readFileSync(join(V.VAULT, a.source.md!.file), "utf8").split("\n");
    expect(chapter[a.source.md!.line - 1]).toContain("pendulum trades height");
    // and read back the same
    V.docs.load();
    const back = V.docs.get(a.id, "annotation")!;
    expect(back.source.rects).toEqual([{ x: 0.118, y: 0.124, w: 0.42, h: 0.02 }]);
    expect(back.source.quote).toBe("A pendulum trades height for speed");
    expect(back.source.bookId).toBe(book.id);
    expect(back.body).toBe("");
  });
  it("find their height on the page from the quote alone (as an agent would write them)", () => {
    const a = A.createAnnotation(book.id, {
      type: "comment",
      anchor: { page: 2, quote: "In a collision the total momentum stays the same." },
      body: "Check this against the 2D case.",
    });
    expect(a.source.y).toBeGreaterThan(0.05);
    expect(a.source.y).toBeLessThan(0.25);
    expect(a.body).toBe("Check this against the 2D case.");
  });
  it("trade a highlight for a comment and back, but keep what was asked of the model", () => {
    const a = A.createAnnotation(book.id, {
      type: "highlight",
      anchor: { page: 2, quote: "In a collision the total momentum stays the same." },
    });
    expect(D.updateDoc(a.id, { type: "comment", body: "Even in 2D?" })).toMatchObject({ type: "comment" });
    expect(readFileSync(join(V.VAULT, a.path), "utf8")).toMatch(/^type: comment$/m);
    expect(D.updateDoc(a.id, { type: "highlight", body: "" })).toMatchObject({ type: "highlight" });
    expect(D.updateDoc(a.id, { type: "explain" })).toMatchObject({ type: "highlight" });
  });
  it("keep a figure as a fenced block", () => {
    const scene = { kind: "plot", title: "Energy", caption: "Height and speed trade.", params: [] } as never;
    const body = A.figureBody(scene);
    expect(body).toMatch(/^## Energy\n\nHeight and speed trade\.\n\n```figure\n/);
    expect(A.figureOf({ body } as never)).toMatchObject({ title: "Energy" });
  });
  it("go into notes as a reference, a quote, or embedded", async () => {
    const a = V.docs.list("annotation").find((x) => x.type === "highlight")!;
    const link = a.path.replace(/\.md$/, "");
    expect(R.noteMarkdown(a, "reference")).toBe(
      `[[${link}|Tiny Physics, p. 1: “A pendulum trades height for speed…”]]`,
    );
    expect(R.noteMarkdown(a, "passage")).toBe(
      `> [!quote] [[${link}|Tiny Physics · p. 1]]\n> A pendulum trades height for speed`,
    );
    expect(R.noteMarkdown(a, "embed")).toBe(`![[${link}]]`);
    // sent without a note named, into the book's note in the first vault (made when there's none)
    const { listVaults, rootOf } = await import("../server/vaults/index.ts");
    const first = R.sendToNote(book.id, { annotationId: a.id, mode: "passage" });
    expect(first.vaultNote.path).toBe("Tiny Physics — notes.md");
    const [info] = listVaults();
    expect(readFileSync(join(rootOf(info), first.vaultNote.path), "utf8")).toContain(
      "> [!quote] [[Tiny Physics#page=1|",
    );
    expect(R.sendToNote(book.id, { annotationId: a.id, mode: "reference" }).vaultNote).toEqual(first.vaultNote);
  });
  it("written outside the app are picked up and placed", async () => {
    const rel = "library/tiny-physics/annotations/p2-explain-agent.md";
    writeFileSync(
      join(V.VAULT, rel),
      // the way an agent might write one: its type as the kind, only a page and the quote
      `---\nid: aagent01\nkind: explain\nsource:\n  book: ${book.id}\n  page: 2\n  quote: Elastic collisions also keep kinetic energy.\n---\n\nThey bounce without losing energy to heat or sound.\n`,
    );
    V.reloadFile(rel);
    V.touched(rel);
    const a = V.docs.get("aagent01", "annotation")!;
    expect(a.type).toBe("explain");
    expect(a.source.y).toBeGreaterThan(0.1);
    expect(a.source.md?.file).toMatch(/text\/01-/);
    expect(a.body).toBe("They bounce without losing energy to heat or sound.");
  });
});
