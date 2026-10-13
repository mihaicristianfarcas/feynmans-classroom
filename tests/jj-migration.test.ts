// A vault that git kept before the move to Jujutsu: jj adopts it with its history (colocated, so git
// still works), drops the branches agents used under git, and carries on. Runs where jj and git are.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const has = (bin: string) => spawnSync(bin, ["--version"]).status === 0;
const dir = mkdtempSync(join(tmpdir(), "classroom-jj-migration-"));
process.env.DATA_DIR = dir;
const vault = join(dir, "vault");
const git = (...args: string[]) =>
  spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: vault, encoding: "utf8" });

let V: typeof import("../server/vault/index.ts");
beforeAll(async () => {
  if (!has("jj") || !has("git")) return;
  mkdirSync(join(vault, "notes"), { recursive: true });
  writeFileSync(join(vault, "notes", "Before jj.md"), "Written when git kept the vault.\n");
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "note Before jj");
  git("branch", "agent/r1234");
  V = await import("../server/vault/index.ts");
  V.initVault();
});

describe.skipIf(!has("jj") || !has("git"))("a git vault moving to jj", () => {
  it("keeps its history, colocated with git", () => {
    V.checkpoint();
    const subjects = V.vaultHistory(10).map((v) => v.subject);
    expect(subjects).toContain("note Before jj");
    expect(git("log", "--format=%s", "main").stdout).toContain("note Before jj");
  });
  it("drops the branches agents used under git", () => {
    const bookmarks = V.jj(["bookmark", "list", "-T", 'name ++ "\\n"']).stdout;
    expect(bookmarks).not.toContain("agent/r1234");
    expect(bookmarks).toContain("main");
  });
  it("carries on: a new edit becomes a new version of the note", () => {
    const note = V.notes.byPath("notes/Before jj.md")!;
    V.notes.save({ ...note, body: "Written when git kept the vault, edited under jj." });
    V.checkpoint();
    expect(V.fileHistory("notes/Before jj.md").map((v) => v.subject)).toEqual([
      "edit notes/Before jj.md",
      "note Before jj",
    ]);
  });
});
