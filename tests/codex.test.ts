// The arguments the server passes to `codex exec`, and how its commands read in the progress line.
import { describe, expect, it } from "vitest";
import { codexArgs } from "../server/llm/codex.ts";

describe("codexArgs", () => {
  it("starts a sandboxed, network-less build turn in the workspace", () => {
    const args = codexArgs({ cwd: "/w", prompt: "p", sandbox: "workspace-write", effort: "high" }, "/w/last.txt");
    expect(args.slice(0, 3)).toEqual(["exec", "--json", "--skip-git-repo-check"]);
    expect(args).toContain('sandbox_mode="workspace-write"');
    expect(args).toContain("sandbox_workspace_write.network_access=false");
    expect(args).toContain('model_reasoning_effort="high"');
    expect(args.slice(-4)).toEqual(["-C", "/w", "-o", "/w/last.txt"]);
  });
  it("plans read-only with a schema and no saved session", () => {
    const args = codexArgs(
      { cwd: "/t", prompt: "p", sandbox: "read-only", schema: "/t/s.json", ephemeral: true },
      "/t/l.txt",
    );
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--output-schema");
    expect(args).not.toContain("sandbox_workspace_write.network_access=false");
  });
  it("resumes a thread with screenshots attached and the prompt on stdin", () => {
    const args = codexArgs(
      { cwd: "/w", prompt: "p", sandbox: "workspace-write", resume: "abc", images: ["/a.png", "/b.png"] },
      "/w/l.txt",
    );
    const at = args.indexOf("resume");
    expect(args.slice(at)).toEqual(["resume", "abc", "-i", "/a.png", "-i", "/b.png", "-o", "/w/l.txt", "-"]);
  });
});

import { friendlyCommand } from "../server/llm/codex.ts";

describe("friendlyCommand", () => {
  it("turns Codex's shell commands into progress words", () => {
    expect(friendlyCommand(`/bin/zsh -lc "cat runtime/draw2d.js && rg -n 'idle' runtime/classroom.js"`)).toBe(
      "reading draw2d.js, classroom.js",
    );
    expect(friendlyCommand("/bin/zsh -lc 'node check.mjs'")).toBe("running the check");
    expect(friendlyCommand("/bin/zsh -lc 'ls'")).toBe("looking around the workspace");
  });
});
