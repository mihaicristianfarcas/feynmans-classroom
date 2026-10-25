// Vaults: making, opening, renaming and deleting them from the app (/api/vaults), and books two vaults
// share kept once (hard links: one file on disk), whether made with the vault, brought in from another
// vault or uploaded again. Work begun in a vault that has been closed can't reach the one open now.
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makePdf } from "./helpers/pdf.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-vaults-"));
process.env.DATA_DIR = dir;

let V: typeof import("../server/vault/index.ts");
let S: typeof import("../server/books/store.ts");
let E: typeof import("../server/events.ts");
let app: ReturnType<typeof import("../server/app.ts").createApp>;

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  S = await import("../server/books/store.ts");
  E = await import("../server/events.ts");
  app = (await import("../server/app.ts")).createApp();
});

// biome-ignore lint/suspicious/noExplicitAny: the answers are checked field by field
type Json = any;
async function send(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Json }> {
  const form = body instanceof FormData;
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", ...(form ? {} : { "content-type": "application/json" }), ...headers },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const get = (path: string) => send("GET", path);
const post = (path: string, body?: unknown) => send("POST", path, body);

const pdf = (title: string) =>
  makePdf([
    [`${title}: energy is conserved in every closed system.`, "A pendulum trades height for speed."],
    ["Momentum is mass times velocity.", "In a collision the total momentum stays the same."],
  ]);
function upload(name: string, data: Buffer) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(data)], name, { type: "application/pdf" }));
  return post("/api/books", form);
}
/** The same file on disk (one inode), seen from two paths. */
const sameFile = (a: string, b: string) => {
  const x = statSync(a);
  const y = statSync(b);
  return x.ino === y.ino && x.dev === y.dev;
};
const library = (vaultDir: string) => join(vaultDir, "library");
const bookFolderIn = (vaultDir: string, id: string) =>
  readdirSync(library(vaultDir))
    .map((name) => join(library(vaultDir), name))
    .find(
      (folder) => existsSync(join(folder, "book.json")) && readFileSync(join(folder, "book.json"), "utf8").includes(id),
    );

let book: Json;
let physics: Json;
const main = join(dir, "vault");

describe("vaults", () => {
  it("starts with one, the first, in DATA_DIR/vault", async () => {
    const { json } = await get("/api/vaults");
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ id: "main", name: "My vault", open: true, path: main });
  });

  it("makes a vault with a book of the open one, kept once, and the learner's profile", async () => {
    book = (await upload("Tiny Physics.pdf", pdf("Tiny Physics"))).json;
    expect(book.status).toBe("ready");
    await send("PUT", "/api/profile", { name: "Ada", onboarded: true });
    await post("/api/docs", { title: "A note in my vault" });

    const made = await post("/api/vaults", { name: "Physics", books: [book.id] });
    expect(made.status).toBe(200);
    physics = made.json;
    expect(physics).toMatchObject({ name: "Physics", dir: "vaults/physics" });
    const there = join(dir, "vaults", "physics");
    const mine = bookFolderIn(main, book.id)!;
    const theirs = bookFolderIn(there, book.id)!;
    expect(theirs).toBeTruthy();
    // the book itself is one file on disk, in both vaults
    for (const name of ["book.json", "source.pdf", "pages.json"])
      expect(sameFile(join(mine, name), join(theirs, name))).toBe(true);
    const text = readdirSync(join(mine, "text"));
    expect(text.length).toBeGreaterThan(0);
    for (const name of text) expect(sameFile(join(mine, "text", name), join(theirs, "text", name))).toBe(true);
    expect(readFileSync(join(there, "profile.md"), "utf8")).toMatch(/name: Ada/);

    const { json: list } = await get("/api/vaults");
    expect(list.map((v: Json) => [v.name, v.open, v.books])).toEqual([
      ["My vault", true, 1],
      ["Physics", false, 1],
    ]);
  });

  it("opens another vault: its own documents, the same book", async () => {
    const opened = await post(`/api/vaults/${physics.id}/open`);
    expect(opened.status).toBe(200);
    expect(V.currentVault().id).toBe(physics.id);
    expect(existsSync(join(dir, "vaults", "physics", ".jj"))).toBe(true);

    const { json: books } = await get("/api/books");
    expect(books.map((b: Json) => [b.id, b.alsoIn])).toEqual([[book.id, ["My vault"]]]);
    const { json: notes } = await get("/api/docs?kind=note");
    expect(notes.map((n: Json) => n.title)).not.toContain("A note in my vault");
    expect((await get("/api/profile")).json.name).toBe("Ada");

    await post("/api/docs", { title: "Pendulums" });
    expect(existsSync(join(dir, "vaults", "physics", "notes", "Pendulums.md"))).toBe(true);
    expect(existsSync(join(main, "notes", "Pendulums.md"))).toBe(false);
  });

  it("answers a page still showing the vault that was closed with 409", async () => {
    const stale = await send("GET", "/api/docs", undefined, { "x-vault": "main" });
    expect(stale.status).toBe(409);
    expect(stale.json.vault).toBe(physics.id);
    expect((await send("GET", "/api/docs", undefined, { "x-vault": physics.id })).status).toBe(200);
  });

  it("brings in a book another vault has, as the same book, and an upload of one it has", async () => {
    await post("/api/vaults/main/open");
    const second = (await upload("Waves.pdf", pdf("Waves"))).json;
    await post(`/api/vaults/${physics.id}/open`);

    const { json: elsewhere } = await get("/api/books/elsewhere");
    expect(elsewhere).toEqual([expect.objectContaining({ id: second.id, title: second.title, vaults: ["My vault"] })]);
    const brought = await post(`/api/books/elsewhere/${second.id}`);
    expect(brought.json.id).toBe(second.id);
    const there = join(dir, "vaults", "physics");
    expect(
      sameFile(join(bookFolderIn(main, second.id)!, "source.pdf"), join(bookFolderIn(there, second.id)!, "source.pdf")),
    ).toBe(true);
    expect((await get("/api/books/elsewhere")).json).toEqual([]);

    // the same file again: the book it already has, not a second copy
    const again = await upload("Waves (copy).pdf", pdf("Waves"));
    expect(again.json.id).toBe(second.id);
    expect(readdirSync(library(there)).filter((n) => existsSync(join(library(there), n, "book.json")))).toHaveLength(2);
  });

  it("gives the other vaults a book's new files when it changes", async () => {
    const mine = S.getBook(book.id)!;
    S.saveBook({ ...mine, title: "Tiny Physics, second edition" });
    const there = join(bookFolderIn(join(dir, "vaults", "physics"), book.id)!, "book.json");
    const back = join(bookFolderIn(main, book.id)!, "book.json");
    expect(sameFile(there, back)).toBe(true);
    expect(JSON.parse(readFileSync(back, "utf8")).title).toBe("Tiny Physics, second edition");
  });

  it("renames a vault, but not to a name another one has", async () => {
    const renamed = await send("PATCH", `/api/vaults/${physics.id}`, { name: "Mechanics" });
    expect(renamed.json.name).toBe("Mechanics");
    const taken = await send("PATCH", "/api/vaults/main", { name: "mechanics" });
    expect(taken.status).toBe(400);
    expect(taken.json.error).toMatch(/already a vault/);
  });

  it("deletes a vault (not the open one); a book it shared stays in the other", async () => {
    expect((await send("DELETE", `/api/vaults/${physics.id}`)).status).toBe(400);
    await post("/api/vaults/main/open");
    expect((await send("DELETE", `/api/vaults/${physics.id}`)).status).toBe(200);
    expect(existsSync(join(dir, "vaults", "physics"))).toBe(false);
    const source = join(bookFolderIn(main, book.id)!, "source.pdf");
    expect(statSync(source).nlink).toBe(1);
    expect((await get("/api/vaults")).json.map((v: Json) => v.name)).toEqual(["My vault"]);
    expect((await get("/api/books")).json.map((b: Json) => b.alsoIn)).toEqual([[], []]);
  });

  it("keeps work begun in a vault that was closed out of the one open now", async () => {
    const seen = V.vaultState(() => ({ marks: [] as string[] }));
    let go = () => {};
    const gate = new Promise<void>((resolve) => {
      go = resolve;
    });
    const heard: unknown[] = [];
    const off = E.subscribe("global", (event) => heard.push(event.type));
    // begun in "My vault" (as a request would), finished after another vault was opened
    const late = V.inVisit(async () => {
      seen().marks.push("before");
      await gate;
      seen().marks.push("after");
      E.publish("global", { type: "agent", data: {} });
      return V.vaultDir();
    });
    const other = (await post("/api/vaults", { name: "Other" })).json;
    await post(`/api/vaults/${other.id}/open`);
    go();
    await expect(late).rejects.toBeInstanceOf(V.VaultClosed);
    off();
    // its state stayed its own, and what it said never reached the open vault's pages
    expect(seen().marks).toEqual([]);
    expect(heard).not.toContain("agent");
    expect(V.vaultDir()).toBe(join(dir, "vaults", "other"));
  });
});
