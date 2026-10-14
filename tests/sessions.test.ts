// Tutoring sessions: each conversation with the tutor about a book is a Markdown file beside it, saved
// after every reply, read back as it was (by the app, by Obsidian, by an agent), written up as a note
// that links both ways (with a stand-in model), and deletable.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makePdf } from "./helpers/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-sessions-"));
process.env.DATA_DIR = dir;

// the stand-in model writes this note, and keeps the prompt it was given
const prompts: string[] = [];
vi.mock("../server/llm/index.ts", () => ({
  structured: async (options: { prompt: string }) => {
    prompts.push(options.prompt);
    return {
      data: { title: "Why a pendulum stops", body: "Friction and air take its energy.", concepts: ["Damping"] },
    };
  },
  text: async () => {
    throw new Error("no model in tests");
  },
  agent: async () => {
    throw new Error("no model in tests");
  },
  llmLoad: () => 0,
}));

let V: typeof import("../server/vault/index.ts");
let S: typeof import("../server/learn/sessions.ts");
let book: import("../server/books/types.ts").Book;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  const { ingestBook } = await import("../server/ingest/index.ts");
  const { exportBook } = await import("../server/vault/library.ts");
  await import("../server/annotations/index.ts"); // tells the vault which folder each book has
  S = await import("../server/learn/sessions.ts");
  book = await ingestBook({
    name: "Tiny Physics.pdf",
    data: makePdf([["Energy is conserved in every closed system.", "A pendulum trades height for speed."]]),
  });
  exportBook(book);
});

describe("tutoring sessions", () => {
  let id = "";

  it("are saved beside the book after a reply, named by the first question", () => {
    const session = S.recordExchange({
      messages: [
        { role: "user", text: "Why does a pendulum slow down?" },
        { role: "tutor", text: "Friction and air.\n\n## A heading in the answer\n\nStill the answer." },
      ],
      passage: "A pendulum trades height for speed.",
      source: { bookId: book.id, chapterId: book.toc[0]?.id, page: 1, y: 0.2, quote: "A pendulum trades" },
      mode: "socratic",
    });
    expect(session).not.toBeNull();
    id = session!.id;
    expect(session!.path).toMatch(
      /^library\/tiny-physics\/sessions\/\d{4}-\d{2}-\d{2} Why does a pendulum slow down\.md$/,
    );
    const text = readFileSync(join(V.VAULT, session!.path), "utf8");
    expect(text).toMatch(/^kind: tutor$/m);
    expect(text).toMatch(/^mode: socratic$/m);
    expect(text).toContain("> [!quote] p. 1\n> A pendulum trades height for speed.");
    expect(text).toContain("## You\n\nWhy does a pendulum slow down?\n\n## Tutor\n\nFriction and air.");
  });

  it("carry on in the same file, and read back as they were", () => {
    const before = S.getSession(id);
    const next = S.recordExchange({
      sessionId: id,
      messages: [
        ...before.messages,
        { role: "user", text: "And without air?" },
        { role: "tutor", text: "It swings on." },
      ],
      source: { bookId: book.id },
    });
    expect(next!.path).toBe(before.path);
    // read from the file again, as after a restart
    V.sessions.load();
    const read = S.getSession(id);
    expect(read.messages.map((m) => m.role)).toEqual(["user", "tutor", "user", "tutor"]);
    expect(read.messages[1].text).toBe("Friction and air.\n\n## A heading in the answer\n\nStill the answer.");
    expect(read.passage).toEqual({
      text: "A pendulum trades height for speed.",
      source: expect.objectContaining({ bookId: book.id, page: 1, y: 0.2, quote: "A pendulum trades" }),
    });
    expect(read.mode).toBe("socratic");
    expect(S.listSessions(book.id).map((s) => s.id)).toEqual([id]);
  });

  it("can be written by hand, and are listed with the book's", () => {
    const rel = "library/tiny-physics/sessions/by hand.md";
    writeFileSync(join(V.VAULT, rel), `---\nbook_id: ${book.id}\n---\n\n## You\n\nHello?\n\n## Tutor\n\nHi.\n`);
    V.sessions.loadFile(rel);
    const mine = S.listSessions(book.id);
    expect(mine).toHaveLength(2);
    expect(mine.find((s) => s.path === rel)).toMatchObject({ title: "Hello?", mode: "answer" });
  });

  it("are found by ⌘K, and a link to one opens it", async () => {
    const { search } = await import("../server/learn/search.ts");
    const { resolveLink } = await import("../server/vault/links.ts");
    const hit = search("without air").find((h) => h.kind === "session");
    expect(hit).toMatchObject({
      id,
      bookId: book.id,
      title: "Tutor: Why does a pendulum slow down?",
      loc: { page: 1 },
    });
    const path = S.getSession(id).path;
    expect(resolveLink(path.replace(/\.md$/, ""))).toMatchObject({ kind: "session", id, bookId: book.id });
  });

  it("aren't made without a book or a message", () => {
    expect(S.recordExchange({ messages: [], source: { bookId: book.id } })).toBeNull();
    expect(S.recordExchange({ messages: [{ role: "user", text: "x" }] })).toBeNull();
  });

  it("are written up as a note that links back, and know their note while it's there", async () => {
    const N = await import("../server/learn/notes.ts");
    const { note, session } = await S.noteFromSession(id);
    expect(prompts.at(-1)).toContain("Learner: And without air?");
    expect(prompts.at(-1)).toContain("<passage>\nA pendulum trades height for speed.");
    expect(note).toMatchObject({ type: "session", title: "Why a pendulum stops", tags: ["tutor"] });
    expect(note.path).toBe("notes/Why a pendulum stops.md");
    expect(note.body).toContain(`From [[${session.path.replace(/\.md$/, "")}|a session with the tutor]]`);
    const file = readFileSync(join(V.VAULT, session.path), "utf8");
    expect(file).toMatch(/^note: "\[\[Why a pendulum stops\]\]"$/m);
    expect(file).toMatch(new RegExp(`^note_id: ${note.id}$`, "m"));
    V.sessions.load();
    expect(S.getSession(id).note).toEqual({ id: note.id, title: "Why a pendulum stops" });
    // the note's page names the session it links to, and lists the session's link back
    const detail = N.noteDetail(N.listNotes({}).find((n) => n.id === note.id)!);
    expect(detail.outgoing.map((o) => o.title)).toContain("Tutor: Why does a pendulum slow down?");
    expect(detail.backlinks).toContainEqual(
      expect.objectContaining({ from: `session:${id}`, title: "Tutor: Why does a pendulum slow down?" }),
    );
    // renamed, it is still the session's note; deleted, it no longer is
    N.updateNote(note.id, { title: "Damping" });
    expect(S.listSessions(book.id).find((s) => s.id === id)?.note?.title).toBe("Damping");
    expect(readFileSync(join(V.VAULT, session.path), "utf8")).toMatch(/^note: "\[\[Damping\]\]"$/m);
    N.deleteNote(note.id);
    expect(S.getSession(id).note).toBeUndefined();
  });

  it("are deleted to the trash", () => {
    const path = S.getSession(id).path;
    expect(S.deleteSession(id)).toBe(true);
    expect(existsSync(join(V.VAULT, path))).toBe(false);
    expect(() => S.getSession(id)).toThrow(/not found/);
  });
});
