// Notes and links: documents as files, Obsidian links, renames that carry links along, folders, and
// the generated indexes.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { inlineTags, parseWikiLinks, rewriteLinks } from "../shared/links.ts";

const dir = mkdtempSync(join(tmpdir(), "classroom-v2-"));
process.env.DATA_DIR = dir;
const vault = join(dir, "vault");

// a vault with a note, a concept and a book in it (as the app, or a person, would have written them)
function fixture() {
  mkdirSync(join(vault, "notes"), { recursive: true });
  mkdirSync(join(vault, "concepts"), { recursive: true });
  writeFileSync(
    join(vault, "notes", "My first note.md"),
    "---\nid: n1\nmood: curious\n---\n\nAbout [[replication-lag]] and [[Leader election]].\n",
  );
  writeFileSync(
    join(vault, "concepts", "Replication lag.md"),
    "---\nid: replication-lag\nkind: concept\nsummary: The delay before a follower has a write.\n---\n\nBody.\n",
  );
  const folder = join(vault, "library", "designing-data-intensive-applications");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "book.json"),
    JSON.stringify({
      id: "b0000ddia",
      title: "Designing Data-Intensive Applications",
      format: "text",
      file: "source.md",
      toc: [
        {
          id: "c1",
          title: "Reliable, Scalable, and Maintainable",
          start: { block: 0 },
          end: { block: 2 },
          sections: [],
        },
      ],
      createdAt: "2026-10-01T00:00:00.000Z",
      status: "ready",
      blockCount: 2,
    }),
  );
  writeFileSync(
    join(folder, "blocks.json"),
    JSON.stringify([
      { id: 0, chapter: 0, tag: "p", html: "Data systems", text: "Data systems are everywhere." },
      { id: 1, chapter: 0, tag: "p", html: "x", text: "Reliability means continuing to work." },
    ]),
  );
}

let V: typeof import("../server/vault/index.ts");
let S: typeof import("../server/books/store.ts");
let L: typeof import("../server/vault/links.ts");
let N: typeof import("../server/learn/notes.ts");
let D: typeof import("../server/learn/docs.ts");
let I: typeof import("../server/vault/indexes.ts");
let X: typeof import("../server/vault/library.ts");

beforeAll(async () => {
  fixture();
  S = await import("../server/books/store.ts");
  V = await import("../server/vault/index.ts");
  V.initVault();
  L = await import("../server/vault/links.ts");
  N = await import("../server/learn/notes.ts");
  D = await import("../server/learn/docs.ts");
  I = await import("../server/vault/indexes.ts");
  X = await import("../server/vault/library.ts");
  X.exportMissingBooks();
});

describe("links", () => {
  it("parses Obsidian links and skips code", () => {
    const text =
      "See [[A]], [[B|shown]] and ![[pic.png]].\n```\n[[not a link]]\n```\nAlso `[[nope]]` and [[C#Heading]] and [[library/x/source.pdf#page=12]].";
    const links = parseWikiLinks(text);
    expect(links.map((l) => l.target)).toEqual(["A", "B", "pic.png", "C", "library/x/source.pdf"]);
    expect(links[1].alias).toBe("shown");
    expect(links[2].embed).toBe(true);
    expect(links[3].sub).toBe("Heading");
    expect(links[4]).toMatchObject({ sub: "page=12", line: 5 });
  });
  it("rewrites targets and keeps aliases and headings", () => {
    expect(
      rewriteLinks("[[Old]] [[old|x]] [[Old#h]] [[Other]]", (t) => (t.toLowerCase() === "old" ? "New" : null)),
    ).toBe("[[New]] [[New|x]] [[New#h]] [[Other]]");
  });
  it("finds inline tags but not headings or code", () => {
    expect(inlineTags("# Title\nA #idea and #todo/later, not `#code` or #123.")).toEqual(["idea", "todo/later"]);
  });
});

describe("the book", () => {
  it("lives in its folder of the library, its text exported by chapter", () => {
    expect(S.bookFolder("b0000ddia")).toBe("designing-data-intensive-applications");
    expect(
      existsSync(
        join(
          vault,
          "library",
          "designing-data-intensive-applications",
          "text",
          "01-reliable-scalable-and-maintainable.md",
        ),
      ),
    ).toBe(true);
  });
});

describe("notes", () => {
  it("are files named by their title, in folders, keeping unknown properties", () => {
    const note = D.createDoc({
      title: "Quorums: why w + r > n?",
      body: "Overlap guarantees a fresh read. #idea",
      folder: "DDIA/Chapter 5",
    });
    expect(note.path).toBe("notes/DDIA/Chapter 5/Quorums why w + r n.md");
    const text = readFileSync(join(vault, note.path), "utf8");
    expect(text).toMatch(/^---\nid: n\w+/);
    V.docs.save({ ...note, props: { rating: 5 } });
    V.docs.load();
    expect(V.docs.get(note.id)?.props).toEqual({ rating: 5 });
  });
  it("reads notes written elsewhere, without frontmatter", () => {
    writeFileSync(join(vault, "notes", "Plain thought.md"), "Just text linking [[My first note]].\n");
    const n = V.docs.loadFile("notes/Plain thought.md")!;
    expect(n.kind).toBe("note");
    expect(n.title).toBe("Plain thought");
    expect(n.id).toMatch(/^p[0-9a-f]{9}$/);
    expect(n.body).toBe("Just text linking [[My first note]].");
  });
  it("resolve links by title, alias, concept id and name, book and page", () => {
    L.invalidateLinks();
    expect(L.resolveLink("my first note")?.node).toBe("note:n1");
    expect(L.resolveLink("replication-lag")?.node).toBe("concept:replication-lag");
    expect(L.resolveLink("Replication lag")?.kind).toBe("concept");
    expect(L.resolveLink("Designing Data-Intensive Applications")?.node).toBe("book:b0000ddia");
    expect(L.resolveLink("library/designing-data-intensive-applications/source.md", "page=3")).toMatchObject({
      kind: "book",
      page: 3,
    });
    expect(L.resolveLink("Nothing like this")).toBeNull();
  });
  it("list backlinks with the line they sit on, and unlinked mentions", () => {
    const n1 = V.docs.get("n1")!;
    expect(n1).toMatchObject({ kind: "note", title: "My first note", props: { mood: "curious" } });
    const back = L.backlinks("note:n1");
    expect(back.map((b) => b.title)).toContain("Plain thought");
    expect(back.find((b) => b.title === "Plain thought")?.context).toBe("Just text linking [[My first note]].");
    D.createDoc({ title: "Mentions", body: "I wrote this in my first note yesterday." });
    expect(L.unlinkedMentions(n1).map((m) => m.title)).toContain("Mentions");
  });
  it("carry links along when renamed", () => {
    D.updateDoc("n1", { title: "Replication notes" });
    expect(existsSync(join(vault, "notes", "Replication notes.md"))).toBe(true);
    expect(V.docs.at("notes/Plain thought.md")?.body).toBe("Just text linking [[Replication notes]].");
    L.invalidateLinks();
    expect(L.resolveLink("Replication notes")?.node).toBe("note:n1");
  });
  it("rename concepts with their name and keep id links working", () => {
    D.updateDoc("replication-lag", { title: "Follower lag" });
    expect(existsSync(join(vault, "concepts", "Follower lag.md"))).toBe(true);
    L.invalidateLinks();
    expect(L.resolveLink("replication-lag")?.node).toBe("concept:replication-lag");
  });
  it("go to .trash when deleted", () => {
    const n = D.createDoc({ title: "Temporary" });
    D.deleteDoc(n.id);
    expect(existsSync(join(vault, n.path))).toBe(false);
    expect(readdirSync(join(vault, ".trash")).some((f) => f.endsWith("Temporary.md"))).toBe(true);
  });
});

describe("notes about things, and folders", () => {
  it("say what they are about, and the book lists them", () => {
    const note = D.createDoc({
      title: "Why systems fail",
      body: "Faults are not failures.",
      about: ["[[Designing Data-Intensive Applications]]"],
    });
    const text = readFileSync(join(vault, note.path), "utf8");
    expect(text).toMatch(/^about: \[.*"\[\[Designing Data-Intensive Applications\]\]"/m);
    expect(D.listDocs({ kind: "note", book: "b0000ddia" }).map((n) => n.id)).toContain(note.id);
    expect(L.backlinks("book:b0000ddia").find((b) => b.from === `note:${note.id}`)?.kind).toBe("about");
  });
  it("move with their folder, links following them", () => {
    const inside = D.createDoc({ title: "Partitioning", body: "Split the data.", folder: "DDIA/Part 2" });
    const deeper = D.createDoc({ title: "Rebalancing", body: "Move partitions.", folder: "DDIA/Part 2/Later" });
    const linking = D.createDoc({ title: "Index of DDIA", body: "See [[notes/DDIA/Part 2/Partitioning]]." });
    expect(N.moveFolder("DDIA/Part 2", "Data systems/Scaling")).toBe("Data systems/Scaling");
    expect(V.docs.get(inside.id)?.path).toBe("notes/Data systems/Scaling/Partitioning.md");
    expect(V.docs.get(deeper.id)?.path).toBe("notes/Data systems/Scaling/Later/Rebalancing.md");
    expect(existsSync(join(vault, "notes", "DDIA", "Part 2"))).toBe(false);
    expect(V.docs.get(linking.id)?.body).toContain("[[notes/Data systems/Scaling/Partitioning]]");
    expect(() => N.moveFolder("Data systems", "Data systems/Inside")).toThrow(/into itself/);
  });
  it("can be made empty, and deleted with their notes going to the trash", () => {
    expect(N.createFolder("Physics/Waves")).toBe("Physics/Waves");
    expect(N.noteTree().folders).toContain("Physics/Waves");
    const note = D.createDoc({ title: "Standing waves", body: "Nodes.", folder: "Physics/Waves" });
    expect(N.deleteFolder("Physics")).toBe(1);
    expect(V.docs.get(note.id)).toBeUndefined();
    expect(existsSync(join(vault, "notes", "Physics"))).toBe(false);
    expect(readdirSync(join(vault, ".trash")).some((f) => f.endsWith("Standing waves.md"))).toBe(true);
  });
});

describe("indexes", () => {
  it("are written for people and agents", () => {
    I.writeIndexes();
    const index = readFileSync(join(vault, "INDEX.md"), "utf8");
    expect(index).toMatch(/Generated by Feynman's Classroom/);
    expect(index).toMatch(/\| books \| 1 \|/);
    expect(readFileSync(join(vault, "library", "INDEX.md"), "utf8")).toMatch(
      /Designing Data-Intensive Applications .*designing-data-intensive-applications\//,
    );
    expect(readFileSync(join(vault, "library", "designing-data-intensive-applications", "README.md"), "utf8")).toMatch(
      /text\/01-reliable-scalable-and-maintainable\.md/,
    );
    expect(readFileSync(join(vault, "notes", "INDEX.md"), "utf8")).toMatch(/\[\[Replication notes\]\]/);
    const tsv = readFileSync(join(vault, "brain", "links.tsv"), "utf8");
    expect(tsv).toMatch(/notes\/Plain thought\.md\tnotes\/Replication notes\.md\tlink\t\d+/);
    // generated files are never read as notes
    V.docs.load();
    expect(V.docs.list().some((n) => n.title === "INDEX")).toBe(false);
  });
  it("are kept out of git, while annotations and book.json are versioned", () => {
    const ignore = readFileSync(join(vault, ".gitignore"), "utf8");
    expect(ignore).toMatch(/library\/\*\/text\//);
    expect(ignore).not.toMatch(/^library\/$/m);
  });
});
