// The agents' sandboxes: the settings both CLIs get, and real shell commands under Codex's sandbox
// (reads and writes inside the folder work; the home folder, .jj, .git, the live vault and the
// network don't).
// The live part runs only where Codex is installed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeSandbox, codexProfile } from "../server/llm/sandbox.ts";

describe("the agents' sandbox settings", () => {
  it("give Codex a profile that reads only system files, its tools and its folders", () => {
    const args = codexProfile({ cwd: "/vault-copy", write: true, readRoots: ["/vault"] });
    expect(args[0]).toBe('default_permissions="classroom"');
    expect(args[1]).toMatch(/^permissions\.classroom\.filesystem=\{/);
    expect(args[1]).toContain('":minimal"="read"');
    expect(args[1]).toContain('"/vault"="read"');
    expect(args[1]).toContain('":project_roots"="write"');
    expect(args[1]).toContain('"/vault-copy/.jj"="read"');
    expect(args[1]).toContain('"/vault-copy/.git"="read"');
    expect(args).toContain('shell_environment_policy.inherit="core"');
    expect(codexProfile({ cwd: "/vault" }).join(" ")).toContain('":project_roots"="read"');
  });
  it("lock .jj and .git where they really are, behind a symlink too (/tmp is /private/tmp on macOS)", () => {
    const real = mkdtempSync(join(tmpdir(), "classroom-real-"));
    const link = `${real}-link`;
    symlinkSync(real, link);
    const table = codexProfile({ cwd: link, write: true })[1];
    expect(table).toContain(`"${join(link, ".jj")}"="read"`);
    expect(table).toContain(`"${join(realpathSync(real), ".jj")}"="read"`);
    expect(claudeSandbox({ cwd: link, write: true }).sandbox.filesystem.denyWrite).toContain(
      join(realpathSync(real), ".jj"),
    );
  });
  it("give Claude Code a sandbox with no network, writes only to its folder, and .jj and .git locked", () => {
    const s = claudeSandbox({ cwd: "/vault-copy", write: true, readRoots: ["/vault"] });
    expect(s.sandbox.enabled).toBe(true);
    expect(s.sandbox.allowUnsandboxedCommands).toBe(false);
    expect(s.sandbox.network.allowedDomains).toEqual([]);
    expect(s.sandbox.filesystem.denyRead).toEqual(["~/"]);
    expect(s.sandbox.filesystem.allowRead).toEqual(["/vault-copy", "/vault"]);
    expect(s.sandbox.filesystem.allowWrite).toEqual(["/vault-copy"]);
    expect(s.sandbox.filesystem.denyWrite).toEqual(["/vault-copy/.jj", "/vault-copy/.git", "/vault"]);
    expect(s.permissions.deny).toContain("Edit(//vault/**)");
    expect(s.permissions.deny).toContain("Write(//vault-copy/.jj/**)");
    expect(claudeSandbox({ cwd: "/vault" }).sandbox.filesystem.allowWrite).toEqual([]);
  });
});

// The real thing, without a model: run shell commands under Codex's own sandbox with our profile.
const hasCodex = spawnSync(process.env.CODEX_BIN || "codex", ["--version"], { encoding: "utf8" }).status === 0;
describe.skipIf(!hasCodex)("an agent's shell under the Codex profile", () => {
  // outside the temp folder (which agents may use as scratch space), as agents' copies are (DATA_DIR/agent-runs)
  const cache = join(process.cwd(), "node_modules", ".cache");
  mkdirSync(cache, { recursive: true });
  const folder = mkdtempSync(join(cache, "classroom-sandbox-"));
  // a jj repository colocated with git, as the vault (and its workspaces) are
  spawnSync(process.env.JJ_BIN || "jj", ["git", "init"], { cwd: folder });
  writeFileSync(join(folder, "note.md"), "hello\n");
  const run = (command: string, write = true) => {
    const flags = codexProfile({ cwd: folder, write }).flatMap((c) => ["-c", c]);
    return spawnSync(process.env.CODEX_BIN || "codex", ["sandbox", ...flags, "--", "sh", "-c", command], {
      cwd: folder,
      encoding: "utf8",
      timeout: 30000,
    });
  };
  it("can read and write its own folder", () => {
    const r = run("cat note.md && echo ok > written.md && cat written.md");
    expect(r.stdout).toContain("hello");
    expect(r.stdout).toContain("ok");
  });
  it("cannot write outside its folder (its temp folder aside), or into .jj or .git", () => {
    const outside = join(mkdtempSync(join(cache, "classroom-outside-")), "x.txt");
    run(`echo x > "${outside}"; echo y > .git/planted; echo y > .jj/planted`);
    expect(existsSync(outside)).toBe(false);
    expect(existsSync(join(folder, ".git", "planted"))).toBe(false);
    expect(existsSync(join(folder, ".jj", "planted"))).toBe(false);
  });
  it("cannot write at all when read-only", () => {
    run("echo z > readonly.md", false);
    expect(existsSync(join(folder, "readonly.md"))).toBe(false);
  });
  it("cannot look around the home folder", () => {
    const r = run('ls "$HOME" >/dev/null && echo LISTED || echo DENIED');
    expect(r.stdout).toContain("DENIED");
  });
  it("cannot reach the network", () => {
    const r = run("curl -sS -m 5 -o /dev/null https://example.com && echo REACHED || echo BLOCKED");
    expect(r.stdout).toContain("BLOCKED");
  });
});
