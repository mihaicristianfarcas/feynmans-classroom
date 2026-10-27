// Adding books (web/src/lib/addBooks.ts): which of the files chosen are books, and sending them one at a
// time, so one that fails doesn't stop the rest, Stop leaves those waiting, and only a book added on its
// own opens. The server is stood in for; each test waits on the store's own changes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BOOK_BYTES } from "../shared/book-files.ts";

const { upload, announce } = vi.hoisted(() => ({ upload: vi.fn(), announce: vi.fn() }));
vi.mock("../web/src/api/index.ts", () => ({ api: { upload } }));
vi.mock("../web/src/lib/a11y.ts", () => ({ announce }));
Object.assign(globalThis, { location: { hash: "#/" } });

const { addBooks, adding, onBookSent, sortPicked, stopAdding, subscribe, summary } = await import(
  "../web/src/lib/addBooks.ts"
);

const file = (path: string, size = 10) => ({ file: new File(["x".repeat(size)], path.split("/").pop()!), path });
/** Resolves once what is being added satisfies `cond` (at once if it does already). */
const until = (cond: () => boolean) =>
  new Promise<void>((resolve) => {
    if (cond()) return resolve();
    const off = subscribe(() => {
      if (!cond()) return;
      off();
      resolve();
    });
  });
const idle = () => until(() => adding().current === null);

/** Uploads wait until the test answers them, in the order they were sent. */
let sent: { name: string; ok: (id: string) => void; fail: (message: string) => void }[] = [];
beforeEach(() => {
  sent = [];
  location.hash = "#/";
  announce.mockClear();
  upload.mockReset();
  upload.mockImplementation(
    (f: File) =>
      new Promise((resolve, reject) =>
        sent.push({ name: f.name, ok: (id) => resolve({ id }), fail: (m) => reject(new Error(m)) }),
      ),
  );
});

describe("choosing what to send", () => {
  it("keeps the books, in the order of their paths, and passes over hidden files", () => {
    const { books, failed, leftOut } = sortPicked([
      file("Physics/Lecture 10.pdf"),
      file("Physics/Lecture 2.epub"),
      file("Physics/cover.jpg"),
      file("Physics/metadata.opf"),
      file("Physics/._Lecture 2.epub"),
      file("Physics/.git/notes.md"),
      file(".DS_Store"),
      file("notes.md"),
    ]);
    expect(books.map((b) => b.path)).toEqual(["notes.md", "Physics/Lecture 2.epub", "Physics/Lecture 10.pdf"]);
    expect(failed).toEqual([]);
    expect(leftOut).toBe(2);
  });

  it("says why a file chosen on its own can't be added", () => {
    const huge = { file: { name: "atlas.pdf", size: MAX_BOOK_BYTES + 1 } as File, path: "atlas.pdf" };
    const { books, failed } = sortPicked([file("essay.docx"), huge]);
    expect(books).toEqual([]);
    expect(failed).toEqual([
      { name: "essay.docx", error: "It isn't a PDF, EPUB, Markdown or plain-text file." },
      { name: "atlas.pdf", error: "It's larger than 200 MB." },
    ]);
  });
});

describe("adding", () => {
  it("opens a book added on its own", async () => {
    addBooks([file("feynman.pdf")]);
    expect(sent.map((s) => s.name)).toEqual(["feynman.pdf"]);
    expect(adding()).toMatchObject({ current: "feynman.pdf", total: 1 });
    sent[0].ok("b1");
    await idle();
    expect(location.hash).toBe("#/book/b1");
    expect(adding()).toMatchObject({ sent: 1, added: 1, failed: [] });
    expect(announce).not.toHaveBeenCalled();
  });

  it("sends several one at a time in the library, going on past one that fails", async () => {
    const each = vi.fn();
    const off = onBookSent(each);
    addBooks([file("a.pdf"), file("b.epub"), file("c.md")]);
    expect(location.hash).toBe("#/library");
    expect(sent.map((s) => s.name)).toEqual(["a.pdf"]);
    sent[0].ok("b1");
    await until(() => adding().sent === 1);
    expect(sent.map((s) => s.name)).toEqual(["a.pdf", "b.epub"]);
    sent[1].fail("The EPUB has no readable text.");
    await until(() => adding().sent === 2);
    sent[2].ok("b3");
    await idle();
    off();
    expect(each).toHaveBeenCalledTimes(3);
    expect(location.hash).toBe("#/library");
    expect(adding()).toMatchObject({
      total: 3,
      added: 2,
      failed: [{ name: "b.epub", error: "The EPUB has no readable text." }],
    });
    expect(announce).toHaveBeenCalledWith("Added 2 books. 1 file couldn't be added.");
  });

  it("adds files chosen meanwhile to the same round, and then opens none", async () => {
    addBooks([file("a.pdf")]);
    addBooks([file("Shelf/b.pdf"), file("Shelf/cover.png")]);
    expect(adding()).toMatchObject({ total: 2, leftOut: 1 });
    sent[0].ok("b1");
    await until(() => adding().sent === 1);
    sent[1].ok("b2");
    await idle();
    expect(location.hash).toBe("#/library");
    expect(announce).toHaveBeenCalledWith("Added 2 books. Left out 1 file that isn't a book.");
  });

  it("stops after the one being read, and goes on with files chosen after", async () => {
    addBooks([file("a.pdf"), file("b.pdf"), file("c.pdf")]);
    stopAdding();
    expect(adding()).toMatchObject({ total: 1, unsent: 2 });
    sent[0].ok("b1");
    await idle();
    expect(sent).toHaveLength(1);
    // stopped short of the rest, so the one that went in doesn't open on its own
    expect(location.hash).toBe("#/library");
    expect(announce).toHaveBeenCalledWith("Added 1 book, then stopped (2 not sent).");

    addBooks([file("d.pdf"), file("e.pdf")]);
    stopAdding();
    addBooks([file("f.pdf")]);
    expect(adding()).toMatchObject({ total: 2, unsent: 1 });
    sent[1].ok("b4");
    await until(() => adding().sent === 1);
    expect(sent.map((s) => s.name)).toEqual(["a.pdf", "d.pdf", "f.pdf"]);
    sent[2].ok("b6");
    await idle();
    expect(announce).toHaveBeenLastCalledWith("Added 2 books, then stopped (1 not sent).");
  });

  it("starts a new round afresh, and says so when a folder holds no book", () => {
    addBooks([file("Photos/cat.jpg"), file("Photos/dog.png")]);
    expect(sent).toEqual([]);
    expect(adding()).toMatchObject({
      current: null,
      total: 0,
      unsent: 0,
      failed: [{ name: "Photos", error: "Nothing in it is a PDF, EPUB, Markdown or plain-text file." }],
    });
    addBooks([file(".DS_Store")]);
    expect(adding().failed).toEqual([
      { name: "", error: "Nothing chosen is a PDF, EPUB, Markdown or plain-text file." },
    ]);
  });

  it("puts what each round came to in a sentence", () => {
    const round = { current: null, total: 5, sent: 5, added: 4, leftOut: 0, unsent: 0 };
    expect(summary({ ...round, failed: [{ name: "x", error: "y" }] })).toBe("Added 4 books. 1 file couldn't be added.");
    expect(summary({ ...round, added: 1, total: 1, failed: [] })).toBe("Added 1 book.");
  });
});
