// Vault writes must reject symlink escapes through any existing ancestor, including Obsidian's
// configured folders; a stale editor must never recreate a note moved or deleted since it opened.
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-vault-paths-"));
process.env.DATA_DIR = join(dir, "data");
const { Vault } = await import("../server/vaults/vault.ts");
const { saveAttachment, createFolder, createNote, move, saveNote, trash } = await import("../server/vaults/edit.ts");
const root = join(dir, "inside");
const outside = join(dir, "outside");
mkdirSync(root);
mkdirSync(outside);
symlinkSync(outside, join(root, "linked"));
symlinkSync(join(outside, "missing"), join(root, "dangling"));
const vault = new Vault("paths", root);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("vault write boundaries", () => {
  it("resolves the nearest existing ancestor before creating missing folders", () => {
    expect(vault.abs("linked/new/deeper/note.md")).toBeNull();
    expect(vault.abs("dangling/new/note.md")).toBeNull();
    expect(() => createFolder(vault, "linked/new/deeper")).toThrow(/outside/);
    expect(() => createNote(vault, { folder: "linked/new", title: "Escape" })).toThrow(/outside/);
    expect(existsSync(join(outside, "new"))).toBe(false);
    expect(createNote(vault, { folder: "valid/new", title: "Inside" }).path).toBe("valid/new/Inside.md");
  });

  it("applies the same boundary to Obsidian's configured note and attachment folders", () => {
    mkdirSync(join(root, ".obsidian"));
    writeFileSync(
      join(root, ".obsidian", "app.json"),
      JSON.stringify({
        newFileLocation: "folder",
        newFileFolderPath: "linked/notes/new",
        attachmentFolderPath: "linked/assets/new",
      }),
    );
    expect(() => createNote(vault, { title: "Configured" })).toThrow(/outside/);
    expect(() => saveAttachment(vault, "data:image/png;base64,cG5n", "image.png")).toThrow(/outside/);
    expect(existsSync(join(outside, "assets"))).toBe(false);
  });

  it("refuses late autosaves after trash or move, and allows explicit recreation", () => {
    const note = createNote(vault, { title: "Delete", folder: "", text: "base" });
    trash(vault, note.path);
    expect(() => saveNote(vault, note.path, "late edit", "base")).toThrow(/moved or deleted/);
    expect(existsSync(join(root, note.path))).toBe(false);
    saveNote(vault, note.path, "restore deliberately");
    move(vault, note.path, "Moved.md");
    expect(() => saveNote(vault, note.path, "late edit", "restore deliberately")).toThrow(/moved or deleted/);
    expect(existsSync(join(root, note.path))).toBe(false);
    expect(vault.files.get("Moved.md")?.text).toBe("restore deliberately");
  });
});
