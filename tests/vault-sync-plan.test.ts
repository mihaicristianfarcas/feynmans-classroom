// The sync plan for a synced vault: which side's change wins for each file, given the folder on disk,
// the server's copy, and both sides as they were after the last sync.
import { describe, expect, it } from "vitest";
import { conflictName, plan, type Stat } from "../web/src/vaults/sync/plan.ts";

const m = (o: Record<string, Stat>) => new Map(Object.entries(o));

describe("sync plan", () => {
  it("copies everything up the first time", () => {
    expect(plan(m({ "a.md": [1, 1], "img/b.png": [2, 2] }), m({}), {})).toEqual([
      ["a.md", "upload"],
      ["img/b.png", "upload"],
    ]);
  });

  it("carries a change from whichever side made it", () => {
    const base = {
      "a.md": { d: [1, 1] as Stat, c: [1, 10] as Stat },
      "b.md": { d: [1, 1] as Stat, c: [1, 10] as Stat },
    };
    expect(plan(m({ "a.md": [2, 5], "b.md": [1, 1] }), m({ "a.md": [1, 10], "b.md": [3, 20] }), base)).toEqual([
      ["a.md", "upload"],
      ["b.md", "download"],
    ]);
  });

  it("carries deletes both ways, and new files made in the app down", () => {
    const base = {
      "a.md": { d: [1, 1] as Stat, c: [1, 10] as Stat },
      "b.md": { d: [1, 1] as Stat, c: [1, 10] as Stat },
    };
    expect(plan(m({ "b.md": [1, 1] }), m({ "a.md": [1, 10], "new.md": [4, 30] }), base)).toEqual([
      ["b.md", "delete-disk"],
      ["a.md", "delete-copy"],
      ["new.md", "download"],
    ]);
  });

  it("compares when both sides changed, and lets a changed file beat a delete", () => {
    const base = {
      "a.md": { d: [1, 1] as Stat, c: [1, 10] as Stat },
      "b.md": { d: [1, 1] as Stat, c: [1, 10] as Stat },
    };
    expect(plan(m({ "a.md": [2, 2], "b.md": [5, 5] }), m({ "a.md": [3, 11] }), base)).toEqual([
      ["a.md", "compare"],
      ["b.md", "upload"],
    ]);
    expect(plan(m({ "a.md": [1, 1] }), m({ "a.md": [1, 1] }), {})).toEqual([["a.md", "compare"]]);
  });

  it("does nothing when nothing changed, and forgets what's gone from both", () => {
    const base = {
      "a.md": { d: [1, 1] as Stat, c: [1, 10] as Stat },
      "gone.md": { d: [1, 1] as Stat, c: [1, 1] as Stat },
    };
    expect(plan(m({ "a.md": [1, 1] }), m({ "a.md": [1, 10] }), base)).toEqual([["gone.md", "forget"]]);
  });

  it("names the app's version of a file both sides changed", () => {
    expect(conflictName("Ideas/Energy.md", () => false)).toBe("Ideas/Energy (app copy).md");
    expect(conflictName("v1.0/README", (p) => p === "v1.0/README (app copy)")).toBe("v1.0/README (app copy 2)");
  });
});
