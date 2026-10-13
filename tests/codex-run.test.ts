import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// A stand-in for the codex binary: prints the JSONL events named by FAKE_CODEX_EVENTS and exits.
const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
const bin = join(dir, "codex");
writeFileSync(
  bin,
  `#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.on("end",()=>{for(const e of JSON.parse(process.env.FAKE_CODEX_EVENTS))console.log(JSON.stringify(e));process.exit(Number(process.env.FAKE_CODEX_EXIT||0));});\n`,
);
chmodSync(bin, 0o755);
process.env.CODEX_BIN = bin;

let runCodex: typeof import("../server/codex.ts").runCodex;
beforeAll(async () => {
  ({ runCodex } = await import("../server/codex.ts"));
});
const run = (events: unknown[], exit = 0) => {
  process.env.FAKE_CODEX_EVENTS = JSON.stringify(events);
  process.env.FAKE_CODEX_EXIT = String(exit);
  return runCodex({ cwd: dir, prompt: "hi", sandbox: "read-only", ephemeral: true });
};

describe("runCodex event parsing", () => {
  it("treats a reconnect notice followed by a completed turn as success", async () => {
    const result = await run([
      { type: "thread.started", thread_id: "t1" },
      { type: "error", message: "Reconnecting... 2/5 (high demand)" },
      { type: "item.completed", item: { type: "agent_message", text: "DONE" } },
      { type: "turn.completed", usage: { input_tokens: 1 } },
    ]);
    expect(result.ok).toBe(true);
    expect(result.threadId).toBe("t1");
    expect(result.lastMessage).toBe("DONE");
  });
  it("fails a turn that failed, with its message", async () => {
    const result = await run([{ type: "turn.failed", error: { message: "the sandbox refused" } }], 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("the sandbox refused");
  });
  it("fails when an error is never followed by a completed turn", async () => {
    const result = await run([{ type: "error", message: "something broke" }], 1);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("something broke");
  });
});
