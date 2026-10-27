// Changing a book's details from the app (PATCH /api/books/:id): its title, author and chapter names are
// saved in book.json, its text by chapter is written again, links to its old title follow it (and links
// that meant something else of that name don't), its folder keeps its name, and another vault that
// has the book is given the new details.
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-edit-book-"));
process.env.DATA_DIR = dir;
const vault = join(dir, "vault");

let app: ReturnType<typeof import("../server/app.ts").createApp>;

beforeAll(async () => {
  (await import("../server/vault/index.ts")).initVault();
  app = (await import("../server/app.ts")).createApp();
});

// biome-ignore lint/suspicious/noExplicitAny: the answers are checked field by field
type Json = any;
async function send(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const form = body instanceof FormData;
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", ...(form ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
const get = (path: string) => send("GET", path);
const post = (path: string, body?: unknown) => send("POST", path, body);
const patch = (path: string, body: unknown) => send("PATCH", path, body);

const BOOK = [
  "# Tiny Mechanics",
  "",
  "## Energy",
  "",
  "Energy is conserved in every closed system.",
  "",
  "## Momentum",
  "",
  "Momentum is mass times velocity.",
  "",
].join("\n");

let book: Json;
let folder: string;

describe("editing a book's details", () => {
  it("saves a new title, author and chapter name, keeping the folder", async () => {
    const form = new FormData();
    form.append("file", new File([BOOK], "tiny-mechanics.md", { type: "text/markdown" }));
    book = (await post("/api/books", form)).json;
    expect(book).toMatchObject({ status: "ready", title: "Tiny Mechanics" });
    folder = (await get(`/api/books/${book.id}`)).json.folder;
    expect(book.toc.map((t: Json) => t.title)).toEqual(["Energy", "Momentum"]);

    const { status, json } = await patch(`/api/books/${book.id}`, {
      title: "  Mechanics,\nMade Tiny ",
      author: "A. Learner",
      chapters: [{ id: book.toc[1].id, title: "Momentum and Collisions" }],
    });
    expect(status).toBe(200);
    expect(json).toMatchObject({ title: "Mechanics, Made Tiny", author: "A. Learner", folder });
    expect(json.toc.map((t: Json) => t.title)).toEqual(["Energy", "Momentum and Collisions"]);

    const saved = JSON.parse(readFileSync(join(vault, "library", folder, "book.json"), "utf8"));
    expect(saved).toMatchObject({ title: "Mechanics, Made Tiny", author: "A. Learner" });
    // its text by chapter, as agents read it, says the new names
    const text = readdirSync(join(vault, "library", folder, "text")).sort();
    expect(text).toEqual(["01-energy.md", "02-momentum-and-collisions.md"]);
    expect(readFileSync(join(vault, "library", folder, "text", text[1]), "utf8")).toMatch(
      /^# Momentum and Collisions\n\nMechanics, Made Tiny, A\. Learner/,
    );
  });

  it("takes the author away when it is left empty, and refuses an empty title", async () => {
    expect((await patch(`/api/books/${book.id}`, { author: "  " })).json.author).toBeUndefined();
    const empty = await patch(`/api/books/${book.id}`, { title: " " });
    expect(empty.status).toBe(400);
    expect(empty.json.error).toMatch(/title/);
    expect((await get(`/api/books/${book.id}`)).json.title).toBe("Mechanics, Made Tiny");
    expect((await patch("/api/books/bnothere00", { title: "x" })).status).toBe(404);
  });

  it("carries links to the old title along, and leaves a link that meant a note of that name", async () => {
    const note = (
      await post("/api/docs", {
        title: "Reading list",
        body: "Start with [[Mechanics, Made Tiny]], then [[Mechanics, Made Tiny#page=2|its second part]].",
      })
    ).json;
    await patch(`/api/books/${book.id}`, { title: "Mechanics for Beginners" });
    expect((await get(`/api/docs/${note.id}`)).json.body).toBe(
      "Start with [[Mechanics for Beginners]], then [[Mechanics for Beginners#page=2|its second part]].",
    );

    // a note of the book's name: [[that name]] means the note, so it stays when the book is renamed
    await post("/api/docs", { title: "Mechanics for Beginners", body: "A note that happens to share a name." });
    const other = (await post("/api/docs", { title: "About the note", body: "See [[Mechanics for Beginners]]." })).json;
    await patch(`/api/books/${book.id}`, { title: "Mechanics, Second Edition" });
    expect((await get(`/api/docs/${other.id}`)).json.body).toBe("See [[Mechanics for Beginners]].");
    expect((await get(`/api/docs/${note.id}`)).json.body).toMatch(/^Start with \[\[Mechanics for Beginners\]\]/);
  });

  it("gives the new details to another vault that has the book", async () => {
    const made = (await post("/api/vaults", { name: "Physics", books: [book.id] })).json;
    await patch(`/api/books/${book.id}`, { author: "B. Teacher" });
    const theirs = join(dir, made.dir, "library", folder);
    expect(JSON.parse(readFileSync(join(theirs, "book.json"), "utf8"))).toMatchObject({
      title: "Mechanics, Second Edition",
      author: "B. Teacher",
    });
    // still one file on disk for both vaults
    const mine = statSync(join(vault, "library", folder, "book.json"));
    expect(statSync(join(theirs, "book.json")).ino).toBe(mine.ino);
    expect(readFileSync(join(theirs, "text", "01-energy.md"), "utf8")).toMatch(
      /Mechanics, Second Edition, B\. Teacher/,
    );
    expect(existsSync(join(theirs, "text", "02-momentum-and-collisions.md"))).toBe(true);
  });
});
