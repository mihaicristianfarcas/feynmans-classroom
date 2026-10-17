// Notes made while reading land in the active vault (the first without one): the book's note (found again, not made twice), a tutor
// session's note (which the session then knows), and a note made with a body, linking the book and concepts.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makePdf } from "./helpers/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-reading-"));
process.env.DATA_DIR = join(dir, "data");
process.env.VAULTS_POLL_MS = "100000";
const root = join(dir, "Physics");
mkdirSync(root, { recursive: true });

vi.mock("../server/llm/index.ts", () => ({
  structured: async () => ({
    data: { title: "Why a pendulum stops", body: "Friction and air take its energy.", concepts: ["Damping"] },
  }),
  text: async () => {
    throw new Error("no model in tests");
  },
  agent: async () => {
    throw new Error("no model in tests");
  },
  llmLoad: () => 0,
}));

let app: ReturnType<typeof import("../server/app.ts").createApp>;
let bookId = "";
let vaultId = "";

// biome-ignore lint/suspicious/noExplicitAny: the answers are checked field by field
type Json = any;
const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as Json };
};

beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  const { ingestBook } = await import("../server/ingest/index.ts");
  const { exportBook } = await import("../server/vault/library.ts");
  const book = await ingestBook({
    name: "Tiny Physics.pdf",
    data: makePdf([["A pendulum trades height for speed."]]),
  });
  exportBook(book);
  bookId = book.id;
  app = (await import("../server/app.ts")).createApp();
  vaultId = (await call("POST", "/api/vaults", { path: root })).data.id;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("notes made while reading, with a vault active", () => {
  it("makes the book's note in the vault, linking the book, and finds it again", async () => {
    const first = (await call("POST", `/api/books/${bookId}/note?vault=${vaultId}`)).data;
    expect(first).toMatchObject({ vault: vaultId, path: "Tiny Physics — notes.md", title: "Tiny Physics — notes" });
    const text = readFileSync(join(root, first.path), "utf8");
    expect(text).toMatch(/^---\nsource: "\[\[Tiny Physics\]\]"\n---\n/);
    const again = (await call("POST", `/api/books/${bookId}/note?vault=${vaultId}`)).data;
    expect(again.path).toBe(first.path);
    // without a vault named, the first vault's
    expect((await call("POST", `/api/books/${bookId}/note`)).data).toEqual(first);
  });

  it("writes a tutor session's note in the vault, and the session knows it", async () => {
    const S = await import("../server/learn/sessions.ts");
    const session = S.recordExchange({
      messages: [
        { role: "user", text: "Why does a pendulum slow down?" },
        { role: "tutor", text: "Friction and air." },
      ],
      source: { bookId },
      mode: "answer",
    })!;
    const out = (await call("POST", `/api/sessions/${session.id}/note?vault=${vaultId}`)).data;
    expect(out.note).toBeUndefined();
    expect(out.vaultNote).toMatchObject({ vault: vaultId, path: "Why a pendulum stops.md" });
    expect(out.session.note).toEqual({
      vault: vaultId,
      path: "Why a pendulum stops.md",
      title: "Why a pendulum stops",
    });
    const text = readFileSync(join(root, "Why a pendulum stops.md"), "utf8");
    expect(text).toContain('about:\n  - "[[Damping]]"');
    expect(text).toContain("From a session with the tutor on [[Tiny Physics]].");
    expect(S.getSession(session.id).note?.vault).toBe(vaultId);
  });

  it("makes a note with a body that links the book and its concepts", async () => {
    const made = (
      await call("POST", `/api/vaults/${vaultId}/notes`, {
        title: "Clocks",
        body: "A pendulum keeps time.",
        bookId,
        about: ["Damping"],
      })
    ).data;
    const text = readFileSync(join(root, made.path), "utf8");
    expect(text).toBe('---\nsource: "[[Tiny Physics]]"\nabout:\n  - "[[Damping]]"\n---\n\nA pendulum keeps time.\n');
    const note = (await call("GET", `/api/vaults/${vaultId}/note?path=${encodeURIComponent(made.path)}`)).data;
    expect(note.outgoing.map((o: Json) => o.app?.kind)).toEqual(expect.arrayContaining(["book", "concept"]));
  });
});
