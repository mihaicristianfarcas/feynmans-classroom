// Vaults kept in the app, and no notes outside a vault: notes left in the app's notes/ folder move once
// into a vault kept in the app (with the attachments they embed), a vault is made when there's none, an
// app vault is made with a name and works like any other, and removing one puts its files aside (the
// last one gives way to a fresh, empty vault).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-app-"));
process.env.DATA_DIR = dir;
process.env.VAULTS_POLL_MS = "100000";

let app: ReturnType<typeof import("../server/app.ts").createApp>;
let V: typeof import("../server/vaults/index.ts");
let adopt: typeof import("../server/vaults/adopt.ts");
let docs: typeof import("../server/vault/index.ts").docs;

// biome-ignore lint/suspicious/noExplicitAny: checked field by field
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
  const vault = await import("../server/vault/index.ts");
  vault.initVault();
  docs = vault.docs;
  V = await import("../server/vaults/index.ts");
  adopt = await import("../server/vaults/adopt.ts");
  app = (await import("../server/app.ts")).createApp();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("vaults kept in the app", () => {
  it("take in the app's own notes, folders and pictures, once", () => {
    const own = join(dir, "vault", "notes");
    mkdirSync(join(own, "Physics"), { recursive: true });
    writeFileSync(join(own, "Physics", "Waves.md"), "---\ntags: [physics]\n---\n\nSee ![[wave.png]].\n");
    writeFileSync(join(own, "Loose.md"), "A loose note.\n");
    mkdirSync(join(dir, "vault", "attachments"), { recursive: true });
    writeFileSync(join(dir, "vault", "attachments", "wave.png"), "png");
    docs.load();
    expect(docs.list("note").length).toBe(2);

    const id = adopt.adoptOwnNotes()!;
    const info = V.listVaults().find((v) => v.id === id)!;
    expect(info).toMatchObject({ name: "Notes", app: true, path: "" });
    const root = V.rootOf(info);
    expect(readFileSync(join(root, "Physics", "Waves.md"), "utf8")).toContain("See ![[wave.png]].");
    expect(existsSync(join(root, "attachments", "wave.png"))).toBe(true);
    expect(existsSync(join(own, "Loose.md"))).toBe(false);
    expect(docs.list("note")).toEqual([]);
    const vault = V.getVault(id);
    expect(vault.resolve("wave.png", "Physics/Waves.md")).toBe("attachments/wave.png");
    // nothing left to move, and a vault is there: nothing is made
    expect(adopt.adoptOwnNotes()).toBeNull();
    expect(V.listVaults().length).toBe(1);
  });

  it("are made with a name, and work like any vault", async () => {
    const made = (await call("POST", "/api/vaults", { name: "Physics", app: true })).data;
    expect(made).toMatchObject({ name: "Physics", app: true, path: "" });
    const note = (await call("POST", `/api/vaults/${made.id}/notes`, { title: "Energy", body: "Kept." })).data;
    expect(note.path).toBe("Energy.md");
    const listed = (await call("GET", "/api/vaults")).data.find((v: Json) => v.id === made.id);
    expect(listed).toMatchObject({ status: "ready", notes: 1, app: true });
    expect((await call("POST", "/api/vaults", { name: " ", app: true })).status).toBe(400);
  });

  it("keep an explanation as a note, its grade counting toward the concept's mastery", async () => {
    const { saveExplanation } = await import("../server/learn/study.ts");
    const { conceptMastery } = await import("../server/learn/context.ts");
    const [notes] = V.listVaults();
    const note = saveExplanation({
      concept: "Entropy",
      explanation: "Disorder, counted.",
      score: 70,
      feedback: "Good.",
    });
    expect(note.vault).toBe(notes.id);
    const text = readFileSync(join(V.rootOf(notes), note.path), "utf8");
    expect(text).toContain('about:\n  - "[[Entropy]]"');
    expect(text).toContain("**Tutor (70/100):** Good.");
    const concept = docs.list("concept").find((c) => c.title === "Entropy")!;
    expect(conceptMastery(concept.id)).toBe(0.7);
  });

  it("are put aside when removed, and the last gives way to a fresh vault", async () => {
    const [notes, physics] = V.listVaults();
    expect((await call("DELETE", `/api/vaults/${physics.id}`)).status).toBe(200);
    expect(existsSync(V.rootOf(physics))).toBe(false);
    const aside = readdirSync(join(dir, "vaults", ".removed"));
    expect(aside.some((f) => f.startsWith(physics.id))).toBe(true);
    expect(existsSync(join(dir, "vaults", ".removed", aside[0], "Energy.md"))).toBe(true);
    await call("DELETE", `/api/vaults/${notes.id}`);
    const left = V.listVaults();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ name: "Notes", app: true });
    expect(left[0].id).not.toBe(notes.id);
    expect(V.getVault(left[0].id).counts().notes).toBe(0);
  });
});
