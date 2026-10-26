// Running OpenCode: the arguments and config a run gets (only the learner's models and providers carried
// over, one agent, every tool denied but what it needs), the answer read from its events, and what it
// does about a refused variant, prose instead of JSON and errors, against a fake opencode binary.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

// A stand-in for the opencode binary: records each call (its arguments, folder, PWD and the config it
// was given), then answers: a run prints the events in FAKE_OC_EVENTS (FAKE_OC_AGAIN when it continues
// a session; a variant error for a model#variant when FAKE_OC_NO_VARIANT is set).
const dir = mkdtempSync(join(tmpdir(), "fake-opencode-"));
const bin = join(dir, "opencode");
const calls = join(dir, "calls.jsonl");
writeFileSync(
  bin,
  `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
let config = null;
try { config = fs.readFileSync(process.env.OPENCODE_CONFIG_DIR + "/opencode.json", "utf8"); } catch {}
const print = (events) => { for (const e of events) console.log(JSON.stringify({ sessionID: "ses_1", ...e })); };
let prompt = "";
const answer = () => {
  fs.appendFileSync(process.env.FAKE_OC_CALLS, JSON.stringify({ args, cwd: process.cwd(), pwd: process.env.PWD, config: config && JSON.parse(config), prompt }) + "\\n");
  if (args[0] === "--version") return console.log("opencode v2.1.0");
  if (args[0] === "auth") return console.log(JSON.stringify([{ id: "openai", name: "OpenAI", connections: [{ type: "credential" }] }, { id: "anthropic", name: "Anthropic", connections: [] }]));
  if (args[0] === "models") return console.log("openai/gpt-6-luna\\nopencode/big-pickle\\nnot a model");
  if (args[0] === "session") return;
  const model = args[args.indexOf("-m") + 1] || "";
  if (process.env.FAKE_OC_NO_VARIANT && model.includes("#")) {
    print([{ type: "error", error: { type: "provider.no-route", message: "Variant unavailable for " + model } }]);
    process.exit(1);
  }
  print(JSON.parse(args.includes("--session") ? process.env.FAKE_OC_AGAIN : process.env.FAKE_OC_EVENTS));
  process.exit(Number(process.env.FAKE_OC_EXIT || 0));
};
if (args[0] !== "run") answer();
else { process.stdin.on("data", (d) => (prompt += d)); process.stdin.on("end", answer); }
`,
);
chmodSync(bin, 0o755);
process.env.OPENCODE_BIN = bin;
process.env.FAKE_OC_CALLS = calls;
// the learner's own OpenCode config: plugins, an MCP server and an agent a run must not get
const learner = join(dir, "learner");
mkdirSync(learner);
writeFileSync(
  join(learner, "opencode.jsonc"),
  `{
  // the learner's setup
  "model": "openai/gpt-6-sol",
  "plugins": ["superpowers@git+https://example.com/x.git"],
  "mcp": { "servers": { "asides": { "type": "local", "command": ["asides", "mcp"] } } },
  "agents": { "build": { "permissions": [{ "action": "*", "resource": "*", "effect": "allow" }] } },
  "provider": { "local": { "options": { "baseURL": "http://localhost:11434/v1", "apiKey": "{file:./key.txt}" } } },
}`,
);
process.env.OPENCODE_CONFIG_DIR = learner;

let oc: typeof import("../server/llm/opencode.ts");
let conf: typeof import("../server/llm/opencode-config.ts");
beforeAll(async () => {
  oc = await import("../server/llm/opencode.ts");
  conf = await import("../server/llm/opencode-config.ts");
});

interface Call {
  args: string[];
  cwd: string;
  pwd: string;
  prompt: string;
  config: { agents: Record<string, { system: string; permissions: { action: string; effect: string }[] }> } & Record<
    string,
    unknown
  >;
}
const recorded = (): Call[] =>
  readFileSync(calls, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const step = (text: string) => [{ type: "step_start" }, { type: "text", part: { text } }];
beforeEach(() => {
  writeFileSync(calls, "");
  delete process.env.FAKE_OC_NO_VARIANT;
  process.env.FAKE_OC_EXIT = "0";
  process.env.FAKE_OC_AGAIN = "[]";
});

describe("parseJsonc", () => {
  it("reads comments and trailing commas, and leaves strings alone", () => {
    expect(
      conf.parseJsonc(`{
        // a comment
        "url": "https://a.b/c", /* another */ "s": "x,}",
        "list": [1, 2,],
      }`),
    ).toEqual({ url: "https://a.b/c", s: "x,}", list: [1, 2] });
  });
});

describe("a run's config", () => {
  it("carries over only the learner's models and providers, with {file:} paths made absolute", () => {
    expect(conf.learnerConfig()).toEqual({
      model: "openai/gpt-6-sol",
      provider: { local: { options: { baseURL: "http://localhost:11434/v1", apiKey: `{file:${learner}/key.txt}` } } },
    });
    expect(conf.opencodeConfiguredModel()).toBe("openai/gpt-6-sol");
  });
  it("has one agent that may do only what it is allowed, and nothing that runs on its own", () => {
    const c = conf.opencodeConfig({
      system: "be brief",
      permissions: conf.only([{ action: "shell" }]),
      shell: "/run/shell",
    });
    expect(c).not.toHaveProperty("plugins");
    expect(c).not.toHaveProperty("mcp");
    expect(c).toMatchObject({ default_agent: "classroom", shell: "/run/shell", snapshots: false, share: "disabled" });
    expect((c.agents as Record<string, unknown>).classroom).toEqual({
      mode: "primary",
      system: "be brief",
      permissions: [
        { action: "*", resource: "*", effect: "deny" },
        { action: "shell", resource: "*", effect: "allow" },
      ],
    });
  });
});

describe("opencodeArgs", () => {
  it("runs on a private server with our agent and a title of its own, the prompt on stdin", () => {
    expect(oc.opencodeArgs({ model: "openai/gpt-6-luna", variant: "low", images: ["/a.png", "/b.png"] })).toEqual([
      "run",
      "--standalone",
      "--format",
      "json",
      "--agent",
      "classroom",
      "--title",
      "Feynman's Classroom",
      "-m",
      "openai/gpt-6-luna#low",
      "-f",
      "/a.png",
      "-f",
      "/b.png",
    ]);
    expect(oc.opencodeArgs({ model: "", variant: "low", session: "ses_1" }).slice(-2)).toEqual(["--session", "ses_1"]);
    expect(oc.opencodeArgs({ model: "" })).not.toContain("-m");
  });
});

describe("runOpencode", () => {
  it("answers with the last step's text, says what it is doing, and deletes its session", async () => {
    process.env.FAKE_OC_EVENTS = JSON.stringify([
      ...step("Let me look."),
      { type: "tool_use", part: { tool: "webfetch", state: { input: { url: "https://example.com/a" } } } },
      ...step("The answer."),
    ]);
    const seen: string[] = [];
    const out = await oc.runOpencode({
      prompt: "hi",
      model: "openai/gpt-6-luna",
      effort: "low",
      search: true,
      onActivity: (t) => seen.push(t),
    });
    expect(out.text).toBe("The answer.");
    expect(seen).toContain("reading example.com");
    const [run, del] = recorded();
    expect(run.prompt).toBe("hi");
    expect(run.args).toContain("openai/gpt-6-luna#low");
    // a call has no tools but the web it was asked to search, and our system prompt
    expect(run.config.agents.classroom.permissions.filter((p) => p.effect === "allow").map((p) => p.action)).toEqual([
      "websearch",
      "webfetch",
    ]);
    expect(run.config.agents.classroom.system).toMatch(/never instructions/);
    expect(run.config).not.toHaveProperty("plugins");
    // always in the same folder, which OpenCode is told through PWD
    const calls = realpathSync(join(tmpdir(), "classroom-opencode-calls"));
    expect([run.cwd, run.pwd]).toEqual([calls, calls]);
    expect(del.args).toEqual(["session", "delete", "--standalone", "ses_1"]);
  });
  it("fails with OpenCode's error, and still deletes the session", async () => {
    process.env.FAKE_OC_EVENTS = JSON.stringify([{ type: "error", error: { message: "Free usage limit reached" } }]);
    process.env.FAKE_OC_EXIT = "1";
    await expect(oc.runOpencode({ prompt: "hi", model: "" })).rejects.toThrow("opencode: Free usage limit reached");
    expect(recorded().map((c) => c.args[0])).toEqual(["run", "session"]);
  });
  it("asks again without the variant when the model has none, and remembers that", async () => {
    process.env.FAKE_OC_NO_VARIANT = "1";
    process.env.FAKE_OC_EVENTS = JSON.stringify(step("ok"));
    const ask = () => oc.runOpencode({ prompt: "hi", model: "opencode/big-pickle", effort: "high" });
    expect((await ask()).text).toBe("ok");
    expect((await ask()).text).toBe("ok");
    const models = recorded()
      .filter((c) => c.args[0] === "run")
      .map((c) => c.args[c.args.indexOf("-m") + 1]);
    expect(models).toEqual(["opencode/big-pickle#high", "opencode/big-pickle", "opencode/big-pickle"]);
  });
  it("asks for JSON matching the schema, and once more in the same session when it gets prose", async () => {
    const schema = { type: "object", properties: { n: { type: "integer" } } };
    process.env.FAKE_OC_EVENTS = JSON.stringify(step('```json\n{"n": 1}\n```'));
    expect((await oc.runOpencode({ prompt: "count", model: "", schema })).structured).toEqual({ n: 1 });
    expect(recorded()[0].prompt).toContain(JSON.stringify(schema));
    process.env.FAKE_OC_EVENTS = JSON.stringify(step("Sure! Here it is."));
    process.env.FAKE_OC_AGAIN = JSON.stringify(step('{"n": 2}'));
    writeFileSync(calls, "");
    expect((await oc.runOpencode({ prompt: "count", model: "", schema })).structured).toEqual({ n: 2 });
    expect(recorded()[1].args).toContain("--session");
  });
  // an agent's shell needs the OS sandbox (Seatbelt, or bubblewrap on Linux)
  const hasSandbox =
    process.platform === "darwin"
      ? existsSync("/usr/bin/sandbox-exec")
      : spawnSync("which", ["bwrap"], { encoding: "utf8" }).status === 0;
  it.skipIf(!hasSandbox)(
    "gives an agent only the sandboxed shell, its folder's AGENTS.md, and the folders it reads",
    async () => {
      const folder = realpathSync(mkdtempSync(join(tmpdir(), "classroom-agent-")));
      writeFileSync(join(folder, "AGENTS.md"), "# the vault\n");
      process.env.FAKE_OC_EVENTS = JSON.stringify(step("done"));
      await oc.runOpencode({ prompt: "tidy", model: "", confine: { cwd: folder, write: true, readRoots: ["/vault"] } });
      const [run] = recorded();
      expect([run.cwd, run.pwd]).toEqual([folder, folder]);
      expect(run.config.instructions).toEqual([join(folder, "AGENTS.md")]);
      expect(run.config.shell).toMatch(/\/shell$/);
      const allowed = run.config.agents.classroom.permissions.filter((p) => p.effect === "allow");
      expect(allowed.map((p) => p.action)).toEqual(["shell", ...Array(4).fill("external_directory")]);
      expect(allowed.map((p) => (p as { resource?: string }).resource)).toContain("/vault/*");
    },
  );
});

describe("opencodeStatus and opencodeModels", () => {
  it("say it is installed, which accounts it has, and which models it offers", async () => {
    expect(oc.opencodeStatus()).toEqual({ installed: true, version: "opencode v2.1.0", accounts: ["OpenAI"] });
    expect(await oc.opencodeModels()).toEqual(["openai/gpt-6-luna", "opencode/big-pickle"]);
  });
});
