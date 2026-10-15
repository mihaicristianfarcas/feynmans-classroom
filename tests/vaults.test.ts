// Outside vaults (Obsidian's): adding several, links resolved as Obsidian does, backlinks, embeds of a
// section, tags, attachments, renames that carry links along, the trash, and edits made outside the
// app (as in Obsidian) reaching the index and the event stream by themselves.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vaults-"));
process.env.DATA_DIR = join(dir, "data");
process.env.VAULTS_POLL_MS = "100000";
const obsidian = join(dir, "Obsidian");
const other = join(dir, "Plain notes");

const { createApp } = await import("../server/app.ts");
const { subscribe } = await import("../server/events.ts");
const { removeVault } = await import("../server/vaults/index.ts");
const app = createApp();

// biome-ignore lint/suspicious/noExplicitAny: the answers are checked field by field
type Json = any;

const call = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as Json };
};
const write = (root: string, rel: string, text: string) => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), text);
};
const until = async (check: () => Promise<boolean> | boolean, ms = 4000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

let id = "";
let second = "";

beforeAll(async () => {
  write(obsidian, ".obsidian/app.json", JSON.stringify({ attachmentFolderPath: "assets" }));
  write(
    obsidian,
    "Home.md",
    '---\ntags: [start, area/physics]\naliases: [Start page]\nrelated: "[[Ideas/Energy]]"\n---\n# Home\n\nSee [[Energy]], [[Energy#Kinetic|moving]] and [[Missing note]].\nA picture: ![[diagram.png|200]] and [the PDF](assets/paper%20one.pdf).\n\n```\n[[not a link]]\n```\n#inbox\n',
  );
  write(
    obsidian,
    "Ideas/Energy.md",
    "# Energy\n\nIntro.\n\n## Kinetic\n\nHalf m v squared. ^ke\n\n## Potential\n\nm g h.\n\nBack to the Home page.\n",
  );
  write(obsidian, "Archive/Energy.md", "An older note with the same name.\n");
  write(obsidian, "assets/diagram.png", "png");
  write(obsidian, "assets/paper one.pdf", "%PDF");
  write(obsidian, ".trash/old.md", "deleted already");
  write(other, "readme.md", "Plain [link](sub/page.md).\n");
  write(other, "sub/page.md", "A page ![[readme#nothing]].\n");
});
afterAll(() => {
  for (const v of [id, second]) if (v) removeVault(v);
  rmSync(dir, { recursive: true, force: true });
});

describe("outside vaults", () => {
  it("adds more than one, and refuses a folder that isn't there or is already added", async () => {
    const a = await call("POST", "/api/vaults", { path: obsidian });
    expect(a.status).toBe(200);
    id = a.data.id;
    const b = await call("POST", "/api/vaults", { path: other, name: "Plain" });
    second = b.data.id;
    expect((await call("POST", "/api/vaults", { path: join(obsidian, "Ideas") })).status).toBe(400);
    expect((await call("POST", "/api/vaults", { path: join(dir, "nowhere") })).status).toBe(400);
    const list = (await call("GET", "/api/vaults")).data;
    expect(list.map((v: Json) => v.name)).toEqual(["Obsidian", "Plain"]);
    expect(list[0]).toMatchObject({ status: "ready", obsidian: true, notes: 3, files: 2 });
  });

  it("lists files and folders, leaving hidden ones out", async () => {
    const tree = (await call("GET", `/api/vaults/${id}/tree`)).data;
    expect(tree.folders).toEqual(["Archive", "Ideas", "assets"]);
    expect(tree.files.map((f: Json) => f.path).sort()).toEqual([
      "Archive/Energy.md",
      "Home.md",
      "Ideas/Energy.md",
      "assets/diagram.png",
      "assets/paper one.pdf",
    ]);
  });

  it("reads a note with its properties, tags, links (resolved as Obsidian does) and backlinks", async () => {
    const note = (await call("GET", `/api/vaults/${id}/note?path=Home.md`)).data;
    expect(note.tags.sort()).toEqual(["area/physics", "inbox", "start"]);
    expect(note.aliases).toEqual(["Start page"]);
    const out = Object.fromEntries(note.outgoing.map((o: Json) => [`${o.target}${o.sub ? `#${o.sub}` : ""}`, o.path]));
    // two notes are called Energy: the shorter path wins
    expect(out.Energy).toBe("Ideas/Energy.md");
    expect(out["Energy#Kinetic"]).toBe("Ideas/Energy.md");
    expect(out["Missing note"]).toBeNull();
    expect(out["diagram.png"]).toBe("assets/diagram.png");
    expect(out["assets/paper one.pdf"]).toBe("assets/paper one.pdf");
    expect(out["Ideas/Energy"]).toBe("Ideas/Energy.md");
    expect(out["not a link"]).toBeUndefined();
    const energy = (await call("GET", `/api/vaults/${id}/note?path=${encodeURIComponent("Ideas/Energy.md")}`)).data;
    expect(energy.backlinks.filter((b: Json) => b.path === "Home.md").length).toBe(3);
    expect(energy.headings.map((h: Json) => h.text)).toEqual(["Energy", "Kinetic", "Potential"]);
    // "Home" named in plain text, not linked
    const home = (await call("GET", `/api/vaults/${id}/note?path=Home.md`)).data;
    expect(home.mentions.map((m: Json) => m.path)).toEqual(["Ideas/Energy.md"]);
  });

  it("resolves embeds to a heading's section or a block", async () => {
    const section = (await call("GET", `/api/vaults/${id}/resolve?target=Energy&sub=Kinetic&from=Home.md&body=1`)).data;
    expect(section.body).toBe("## Kinetic\n\nHalf m v squared. ^ke\n");
    const block = (await call("GET", `/api/vaults/${id}/resolve?target=Energy&sub=%5Eke&body=1`)).data;
    expect(block.body).toBe("Half m v squared.");
    expect((await call("GET", `/api/vaults/${id}/resolve?target=Start%20page`)).data.path).toBe("Home.md");
    expect((await call("GET", `/api/vaults/${id}/resolve?target=Nowhere`)).data).toEqual({ path: null });
    // Markdown links are relative to the note
    const md = (await call("GET", `/api/vaults/${second}/resolve?target=sub/page.md&from=readme.md&md=1`)).data;
    expect(md.path).toBe("sub/page.md");
  });

  it("serves attachments as content only, with ranges, and nothing outside the vault", async () => {
    const res = await app.request(`http://localhost/api/vaults/${id}/file?path=assets/paper%20one.pdf`, {
      headers: { host: "localhost", range: "bytes=1-2" },
    });
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("PD");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const png = await app.request(`http://localhost/api/vaults/${id}/file?path=assets/diagram.png`, {
      headers: { host: "localhost" },
    });
    expect(png.headers.get("content-security-policy")).toContain("sandbox");
    for (const path of ["../Plain%20notes/readme.md", ".obsidian/app.json", ".trash/old.md"])
      expect((await call("GET", `/api/vaults/${id}/file?path=${path}`)).status).toBe(404);
  });

  it("lists tags (nested ones count for their parents) and searches", async () => {
    const tags = (await call("GET", `/api/vaults/${id}/tags`)).data;
    expect(tags).toContainEqual({ tag: "area", count: 1 });
    expect((await call("GET", `/api/vaults/${id}/search?q=%23area`)).data[0].path).toBe("Home.md");
    expect((await call("GET", `/api/vaults/${id}/search?q=squared`)).data[0].path).toBe("Ideas/Energy.md");
    const graph = (await call("GET", `/api/vaults/${id}/graph`)).data;
    expect(graph.edges).toContainEqual({ from: "Home.md", to: "Ideas/Energy.md" });
  });

  it("saves a note, and refuses to overwrite a change made on disk meanwhile", async () => {
    const base = readFileSync(join(obsidian, "Archive/Energy.md"), "utf8");
    const ok = await call("PUT", `/api/vaults/${id}/note`, { path: "Archive/Energy.md", text: "Edited.\n", base });
    expect(ok.status).toBe(200);
    writeFileSync(join(obsidian, "Archive/Energy.md"), "Changed in Obsidian.\n");
    const clash = await call("PUT", `/api/vaults/${id}/note`, {
      path: "Archive/Energy.md",
      text: "Mine.\n",
      base: "Edited.\n",
    });
    expect(clash.status).toBe(409);
    expect(clash.data.text).toBe("Changed in Obsidian.\n");
    expect((await call("PUT", `/api/vaults/${id}/note`, { path: "../x.md", text: "" })).status).toBe(400);
  });

  it("makes notes, folders and attachments where Obsidian's settings say", async () => {
    const made = (await call("POST", `/api/vaults/${id}/notes`, { title: "Missing note", from: "Home.md" })).data;
    expect(made.path).toBe("Missing note.md");
    const home = (await call("GET", `/api/vaults/${id}/note?path=Home.md`)).data;
    expect(home.outgoing.find((o: Json) => o.target === "Missing note").path).toBe("Missing note.md");
    const pic = (
      await call("POST", `/api/vaults/${id}/attachments`, {
        data: `data:image/png;base64,${Buffer.from("x").toString("base64")}`,
        name: "photo.png",
        note: "Home.md",
      })
    ).data;
    expect(pic).toMatchObject({ path: "assets/photo.png", link: "photo.png", embed: "![[photo.png]]", kind: "image" });
    expect((await call("POST", `/api/vaults/${id}/folders`, { path: "Projects/2026" })).status).toBe(200);
    expect(existsSync(join(obsidian, "Projects/2026"))).toBe(true);
  });

  it("renames and moves, rewriting the links that pointed there", async () => {
    await call("POST", `/api/vaults/${id}/move`, { from: "Ideas/Energy.md", to: "Ideas/Work and energy" });
    const home = readFileSync(join(obsidian, "Home.md"), "utf8");
    expect(home).toContain("[[Work and energy]]");
    expect(home).toContain("[[Work and energy#Kinetic|moving]]");
    expect(home).toContain('related: "[[Work and energy]]"');
    await call("POST", `/api/vaults/${id}/move`, { from: "assets", to: "media" });
    const after = readFileSync(join(obsidian, "Home.md"), "utf8");
    expect(after).toContain("![[diagram.png|200]]");
    expect(after).toContain("[the PDF](media/paper%20one.pdf)");
    const note = (await call("GET", `/api/vaults/${id}/note?path=Home.md`)).data;
    expect(note.outgoing.filter((o: Json) => !o.path).map((o: Json) => o.target)).toEqual([]);
  });

  it("moves to the vault's trash", async () => {
    await call("POST", `/api/vaults/${id}/trash`, { path: "Archive" });
    expect(existsSync(join(obsidian, ".trash", "Archive", "Energy.md"))).toBe(true);
    const tree = (await call("GET", `/api/vaults/${id}/tree`)).data;
    expect(tree.folders).not.toContain("Archive");
  });

  it("picks up edits made outside the app (in Obsidian) by itself, and announces them", async () => {
    const seen: Json[] = [];
    const off = subscribe("global", (e) => e.type === "vaults" && seen.push(e.data));
    write(obsidian, "From Obsidian.md", "New note linking [[Home]].\n");
    expect(await until(() => seen.some((s) => s.path === "From Obsidian.md" && s.change === "added"))).toBe(true);
    const home = (await call("GET", `/api/vaults/${id}/note?path=Home.md`)).data;
    expect(home.backlinks.map((b: Json) => b.path)).toContain("From Obsidian.md");
    // a rename in Obsidian: the old path goes, the new one comes
    renameSync(join(obsidian, "From Obsidian.md"), join(obsidian, "Renamed.md"));
    expect(
      await until(async () => {
        const tree = (await call("GET", `/api/vaults/${id}/tree`)).data;
        const paths = tree.files.map((f: Json) => f.path);
        return paths.includes("Renamed.md") && !paths.includes("From Obsidian.md");
      }),
    ).toBe(true);
    writeFileSync(join(obsidian, "Renamed.md"), "Now about #physics.\n");
    expect(
      await until(async () => (await call("GET", `/api/vaults/${id}/note?path=Renamed.md`)).data.tags[0] === "physics"),
    ).toBe(true);
    off();
  });

  it("forgets a vault without touching its files", async () => {
    await call("DELETE", `/api/vaults/${second}`);
    second = "";
    expect((await call("GET", "/api/vaults")).data.length).toBe(1);
    expect(existsSync(join(other, "readme.md"))).toBe(true);
  });
});
