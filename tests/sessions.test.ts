// Tutoring sessions: each conversation with the tutor about a book is a Markdown file beside it, saved
// after every reply, read back as it was (by the app, by Obsidian, by an agent), written up as a note
// that links both ways (with a stand-in model), and deletable.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    expect(text).toMatch(/^kind: session$/m);
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
    V.docs.load();
    const read = S.getSession(id);
    expect(read.messages.map((m) => m.role)).toEqual(["user", "tutor", "user", "tutor"]);
    expect(read.messages[1].text).toBe("Friction and air.\n\n## A heading in the answer\n\nStill the answer.");
    expect(read.source).toEqual(
      expect.objectContaining({ bookId: book.id, page: 1, y: 0.2, quote: "A pendulum trades height for speed." }),
    );
    expect(read.mode).toBe("socratic");
    expect(S.listSessions(book.id).map((s) => s.id)).toEqual([id]);
  });

  it("can be written by hand, and are listed with the book's", () => {
    const rel = "library/tiny-physics/sessions/by hand.md";
    writeFileSync(join(V.VAULT, rel), `---\nsource:\n  book: ${book.id}\n---\n\n## You\n\nHello?\n\n## Tutor\n\nHi.\n`);
    V.docs.loadFile(rel);
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
      title: "Why does a pendulum slow down?",
      loc: { page: 1 },
    });
    const path = S.getSession(id).path;
    expect(resolveLink(path.replace(/\.md$/, ""))).toMatchObject({ kind: "session", id, bookId: book.id });
  });

  it("aren't made without a book or a message", () => {
    expect(S.recordExchange({ messages: [], source: { bookId: book.id } })).toBeNull();
    expect(S.recordExchange({ messages: [{ role: "user", text: "x" }] })).toBeNull();
  });

  it("are written up as a note in the first vault (made when there's none), and know their note while it's there", async () => {
    const vaults = await import("../server/vaults/index.ts");
    const { vaultNote, session } = await S.noteFromSession(id);
    expect(prompts.at(-1)).toContain("Learner: And without air?");
    expect(prompts.at(-1)).toContain("<passage>\nA pendulum trades height for speed.");
    const [info] = vaults.listVaults();
    expect(info).toMatchObject({ name: "Notes", app: true });
    expect(vaultNote).toEqual({ vault: info.id, path: "Why a pendulum stops.md", title: "Why a pendulum stops" });
    const full = join(vaults.rootOf(info), vaultNote.path);
    expect(readFileSync(full, "utf8")).toContain(`From a session with the tutor on [[${book.title}]].`);
    expect(session.note).toEqual({ vault: info.id, path: vaultNote.path, title: "Why a pendulum stops" });
    // deleted, it no longer is the session's note
    rmSync(full);
    vaults.getVault(info.id).reconcile();
    expect(S.getSession(id).note).toBeUndefined();
  });

  it("are deleted to the trash", async () => {
    const D = await import("../server/learn/docs.ts");
    const path = S.getSession(id).path;
    expect(D.deleteDoc(id)).toBe(true);
    expect(existsSync(join(V.VAULT, path))).toBe(false);
    expect(() => S.getSession(id)).toThrow(/not found/);
  });
});
