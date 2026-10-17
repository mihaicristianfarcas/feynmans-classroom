// The small edits the vaults page makes to a note's text: ticking a task from the text read (lines
// count after the properties), and turning an unlinked mention into a link.
import { describe, expect, it } from "vitest";
import { bodyOf, linkMention, toggleTaskAt } from "../web/src/vaults/text.ts";

describe("vault note text", () => {
  const text = "---\ntags: [a]\n---\n# Plan\n\n- [ ] buy milk\n- [x] call home\nplain line\n";

  it("drops the properties for reading", () => {
    expect(bodyOf(text).startsWith("# Plan")).toBe(true);
    expect(bodyOf("no properties")).toBe("no properties");
  });

  it("ticks and clears tasks by their line in the text read", () => {
    expect(toggleTaskAt(text, 3)).toContain("- [x] buy milk");
    expect(toggleTaskAt(text, 4)).toContain("- [ ] call home");
    expect(toggleTaskAt(text, 5)).toBeNull();
    expect(toggleTaskAt("1. [ ] first", 1)).toBe("1. [x] first");
  });

  it("links the first unlinked mention, keeping the words as written", () => {
    expect(linkMention("I read about energy today", 1, ["Energy"], "Energy")).toBe(
      "I read about [[Energy|energy]] today",
    );
    expect(linkMention("a\nEnergy matters", 2, ["Energy"], "Energy")).toBe("a\n[[Energy]] matters");
    expect(linkMention("energetic", 1, ["Energy"], "Energy")).toBeNull();
    expect(linkMention("see [[Energy]]", 1, ["Energy"], "Energy")).toBeNull();
    expect(linkMention("kinetic stuff", 1, ["Energy", "kinetic"], "Energy")).toBe("[[Energy|kinetic]] stuff");
  });
});
