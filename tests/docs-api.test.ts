// The documents API (/api/docs): every kind made, listed, read with its links, changed, added to and
// deleted through the same routes, with the file in the vault as the result; and the history every
// kind gets from that (a card's versions, as a note's).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-docs-"));
process.env.DATA_DIR = dir;
const vault = join(dir, "vault");
const hasJj = spawnSync(process.env.JJ_BIN || "jj", ["--version"]).status === 0;

let V: typeof import("../server/vault/index.ts");
let app: ReturnType<typeof import("../server/app.ts").createApp>;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  app = (await import("../server/app.ts")).createApp();
});

// biome-ignore lint/suspicious/noExplicitAny: the answers are checked field by field
type Json = any;
async function send(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const get = (path: string) => send("GET", path);
const post = (path: string, body?: unknown) => send("POST", path, body);
const patch = (path: string, body: unknown) => send("PATCH", path, body);
const file = (rel: string) => readFileSync(join(vault, rel), "utf8");

describe("/api/docs", () => {
  it("makes a note in its folder, named by its title", async () => {
    const { status, json: note } = await post("/api/docs", {
      title: "Leaders and followers",
      folder: "DDIA",
      body: "Writes go to the [[Leader]] first.",
    });
    expect(status).toBe(200);
    expect(note).toMatchObject({ kind: "note", type: "note", path: "notes/DDIA/Leaders and followers.md" });
    expect(file(note.path)).toContain("Writes go to the [[Leader]] first.");
  });

  it("makes a card with its concepts given by name, and reads its sides from the file", async () => {
    const { json: card } = await post("/api/docs", {
      kind: "card",
      front: "What does a follower apply?",
      back: "The leader's replication log.",
      deck: "DDIA",
      concepts: ["Leader"],
    });
    expect(card).toMatchObject({ kind: "card", type: "basic", deck: "DDIA", concepts: ["leader"] });
    expect(card.path).toMatch(/^cards\/.+\.md$/);
    // its title is made from the front, so the file doesn't keep one
    expect(card.title).toBe("What does a follower apply?");
    expect(file(card.path)).not.toMatch(/^title:/m);
    expect(file(card.path)).toMatch(
      /## Front\s+What does a follower apply\?\s+## Back\s+The leader's replication log\./,
    );
    const { json: concept } = await get("/api/docs/leader");
    expect(concept).toMatchObject({ kind: "concept", title: "Leader", path: "concepts/Leader.md" });
  });

  it("doesn't make annotations or sessions: what they come from does", async () => {
    for (const kind of ["annotation", "session"]) {
      const { status } = await post("/api/docs", { kind, title: "x" });
      expect(status).toBe(400);
    }
  });

  it("lists by kind and subtype, the most recently changed first", async () => {
    await post("/api/docs", { title: "Check yourself", type: "quiz", body: "```quiz\ntitle: x\n```" });
    const notes = (await get("/api/docs?kind=note")).json as { title: string }[];
    expect(notes.map((n) => n.title)).toEqual(["Check yourself", "Leaders and followers"]);
    const quizzes = (await get("/api/docs?kind=note&type=quiz")).json as { title: string }[];
    expect(quizzes.map((n) => n.title)).toEqual(["Check yourself"]);
    expect((await get("/api/docs?kind=card")).json).toHaveLength(1);
    expect((await get("/api/docs?concept=leader")).json.map((d: { kind: string }) => d.kind)).toEqual(["card"]);
  });

  it("reads one with its links in and out, by id or by path", async () => {
    const { json: concept } = await get("/api/docs/leader");
    expect(concept.backlinks.map((b: { title: string }) => b.title)).toContain("Leaders and followers");
    const { json: note } = await get(`/api/docs/-?path=${encodeURIComponent("notes/DDIA/Leaders and followers.md")}`);
    expect(note.title).toBe("Leaders and followers");
    expect(note.outgoing).toEqual([expect.objectContaining({ target: "Leader", kind: "link", to: "concept:leader" })]);
    expect((await get("/api/docs/nothing-here")).status).toBe(404);
  });

  it("renames a concept's file with its title, and the links to it follow", async () => {
    const { json: concept } = await patch("/api/docs/leader", { title: "Leader node" });
    expect(concept.path).toBe("concepts/Leader node.md");
    expect(existsSync(join(vault, "concepts", "Leader.md"))).toBe(false);
    expect(file("notes/DDIA/Leaders and followers.md")).toContain("[[Leader node]]");
  });

  it("keeps a card's sides in step with its body, and a card's title in its frontmatter", async () => {
    const [card] = (await get("/api/docs?kind=card")).json as { id: string; path: string }[];
    const { json: changed } = await patch(`/api/docs/${card.id}`, {
      body: "## Front\n\nWho takes the writes?\n\n## Back\n\nThe leader.",
      title: "Writes",
    });
    expect(changed).toMatchObject({ front: "Who takes the writes?", back: "The leader.", title: "Writes" });
    expect(changed.path).toBe(card.path);
    expect(file(card.path)).toContain("title: Writes");
  });

  it("adds to a document's body", async () => {
    const [note] = (await get("/api/docs?kind=note&folder=DDIA")).json as { id: string; path: string }[];
    const { json } = await post(`/api/docs/${note.id}/append`, { markdown: "> A passage from the book." });
    expect(json.body).toMatch(/first\.\n\n> A passage from the book\.$/);
    expect((await post(`/api/docs/${note.id}/append`, { markdown: " " })).status).toBe(400);
  });

  it("leaves a card's file alone when it is reviewed (its schedule is in the review log)", async () => {
    const [card] = (await get("/api/docs?kind=card")).json as { id: string; path: string }[];
    const before = file(card.path);
    const { json: rated } = await post(`/api/review/${card.id}`, { rating: 3 });
    expect(rated.state.reps).toBe(1);
    expect(file(card.path)).toBe(before);
  });

  it("deletes one: its file goes to the trash, and it's gone from the lists", async () => {
    const { json: note } = await post("/api/docs", { title: "Scratch" });
    expect((await send("DELETE", `/api/docs/${note.id}`)).json).toEqual({ ok: true });
    expect(existsSync(join(vault, note.path))).toBe(false);
    expect(existsSync(join(vault, ".trash"))).toBe(true);
    expect((await get(`/api/docs/${note.id}`)).status).toBe(404);
    expect((await send("DELETE", `/api/docs/${note.id}`)).json).toEqual({ ok: false });
  });
});

describe.skipIf(!hasJj)("/api/docs versions", () => {
  it("keeps a card's versions as it does a note's, and brings one back", async () => {
    const { json: card } = await post("/api/docs", { kind: "card", front: "First front", back: "Back" });
    V.checkpoint();
    await patch(`/api/docs/${card.id}`, { front: "Second front" });
    V.checkpoint();
    const { json: versions } = await get(`/api/docs/${card.id}/versions`);
    expect(versions).toHaveLength(2);
    const { json: old } = await get(`/api/docs/${card.id}/versions/${versions[1].commit}`);
    expect(old.body).toContain("First front");
    const { json: restored } = await post(`/api/docs/${card.id}/restore`, { commit: versions[1].commit });
    expect(restored.front).toBe("First front");
  });
});
