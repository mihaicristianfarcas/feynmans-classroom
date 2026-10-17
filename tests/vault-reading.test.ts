// Reading into a vault note: a passage sent from a book lands at the end of a note in an added vault,
// as a quote under a link to the book at its page, and that note is then listed among the book's notes.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makePdf } from "./helpers/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-reading-"));
process.env.DATA_DIR = join(dir, "data");
process.env.VAULTS_POLL_MS = "100000";
const root = join(dir, "Studies");
mkdirSync(root, { recursive: true });
writeFileSync(join(root, "Mechanics.md"), "My notes.\n");

let R: typeof import("../server/annotations/to-note.ts");
let reading: typeof import("../server/vaults/reading.ts");
let book: import("../server/books/types.ts").Book;
let vaultId = "";

beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  const { ingestBook } = await import("../server/ingest/index.ts");
  const { exportBook } = await import("../server/vault/library.ts");
  R = await import("../server/annotations/to-note.ts");
  reading = await import("../server/vaults/reading.ts");
  book = await ingestBook({
    name: "Tiny Physics.pdf",
    data: makePdf([["Energy is conserved in every closed system.", "A pendulum trades height for speed."]]),
  });
  exportBook(book);
  vaultId = (await import("../server/vaults/index.ts")).addVault(root).id;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("reading into a vault note", () => {
  it("adds the passage at the end, quoted under a link to the book's page", () => {
    expect(reading.vaultNotesOfBook(book.id)).toEqual([]);
    const out = R.sendToNote(book.id, {
      vault: vaultId,
      path: "Mechanics.md",
      mode: "passage",
      comment: "Like a swing.",
      anchor: { page: 1, quote: "A pendulum trades height for speed", rects: [{ x: 0.1, y: 0.1, w: 0.4, h: 0.02 }] },
    });
    expect(out).toMatchObject({ vaultNote: { vault: vaultId, path: "Mechanics.md" } });
    const text = readFileSync(join(root, "Mechanics.md"), "utf8");
    expect(text).toBe(
      `My notes.\n\n> [!quote] [[${book.title}#page=1|${book.title}, p. 1]]\n> A pendulum trades height for speed\n\nLike a swing.\n`,
    );
  });

  it("lists the note among the book's notes", () => {
    expect(reading.vaultNotesOfBook(book.id)).toEqual([
      expect.objectContaining({ vault: vaultId, path: "Mechanics.md", title: "Mechanics", page: 1 }),
    ]);
  });
});
