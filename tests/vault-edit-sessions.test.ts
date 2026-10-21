// Moving/trashing an open note waits for its editor, handles folders, isolates vaults, and resumes
// saving after a failed operation; obsolete paths remain suspended after successful mutations.
import { describe, expect, it } from "vitest";
import { mutateNotePath, registerEditSession } from "../web/src/vaults/editSessions.ts";

describe("editor sessions during moves and deletes", () => {
  it("waits for pending edits and suppresses subsequent cleanup saves on success", async () => {
    const events: string[] = [];
    let saving = true;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const unregister = registerEditSession("one", "folder/A.md", async () => {
      saving = false;
      await pending;
      events.push("flushed");
      return () => {
        saving = true;
      };
    });
    const operation = mutateNotePath("one", "folder", async () => {
      events.push("moved");
    });
    expect(events).toEqual([]);
    release();
    await operation;
    expect(events).toEqual(["flushed", "moved"]);
    expect(saving).toBe(false);
    unregister();
  });

  it("leaves unrelated editors alone and resumes the editor when the move fails", async () => {
    let saving = true;
    let unrelated = 0;
    const unregister = registerEditSession("one", "A.md", async () => {
      saving = false;
      return () => {
        saving = true;
      };
    });
    const other = registerEditSession("two", "A.md", async () => {
      unrelated++;
      return () => {};
    });
    await expect(
      mutateNotePath("one", "A.md", async () => {
        throw new Error("destination exists");
      }),
    ).rejects.toThrow("destination exists");
    expect(saving).toBe(true);
    expect(unrelated).toBe(0);
    unregister();
    other();
  });

  it("does not mutate a folder if one editor cannot flush", async () => {
    let resumed = false;
    let mutated = false;
    const first = registerEditSession("one", "folder/A.md", async () => () => {
      resumed = true;
    });
    const conflict = registerEditSession("one", "folder/B.md", async () => {
      throw new Error("conflict");
    });
    await expect(
      mutateNotePath("one", "folder", async () => {
        mutated = true;
      }),
    ).rejects.toThrow("conflict");
    expect(mutated).toBe(false);
    expect(resumed).toBe(true);
    first();
    conflict();
  });
});
