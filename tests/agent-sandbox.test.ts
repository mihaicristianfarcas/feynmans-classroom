// The agents' sandboxes: the settings each CLI gets, and real shell commands under Codex's sandbox and
// in OpenCode's sandboxed shell (reads and writes inside the folder work; the home folder, .jj, .git,
// the live vault and the network don't).
// The live parts run only where Codex is installed, and where the OS sandbox OpenCode's shell uses is.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { bwrapArgs, claudeSandbox, codexProfile, sandboxedShell, seatbeltProfile } from "../server/llm/sandbox.ts";

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
  it("give OpenCode's shell a Seatbelt profile that denies by default, with .jj and .git kept out of its writes", () => {
    const profile = seatbeltProfile({ cwd: "/vault-copy", write: true, readRoots: ["/vault"] }, "/run/tmp");
    expect(profile).toMatch(/^\(version 1\)\n\(deny default\)/);
    expect(profile).not.toMatch(/network/);
    expect(profile).toMatch(/\(allow file-read\* [^\n]*\(subpath "\/vault"\)[^\n]*\(subpath "\/vault-copy"\)/);
    expect(profile).toContain('(allow file-write* (subpath "/run/tmp"))');
    expect(profile).toContain(
      '(allow file-write* (require-all (require-any (subpath "/vault-copy")) (require-not (subpath "/vault-copy/.jj")) (require-not (subpath "/vault-copy/.git"))))',
    );
    // the folders above are looked up, not listed
    expect(profile).toMatch(/\(allow file-read-metadata [^\n]*\(literal "\/"\)/);
    // read-only: the temp folder is all it may write
    expect(seatbeltProfile({ cwd: "/vault" }, "/run/tmp").match(/allow file-write\*/g)).toHaveLength(1);
  });
  it("give it bubblewrap arguments with no network, the folder writable only if allowed, .jj and .git locked", () => {
    const args = bwrapArgs({ cwd: "/vault-copy", write: true, readRoots: ["/vault"] }, "/tmp/run/tmp").join(" ");
    expect(args).toContain("--unshare-all");
    expect(args).not.toContain("--share-net");
    expect(args).toContain("--ro-bind /vault /vault");
    expect(args).toContain("--bind /vault-copy /vault-copy");
    expect(args).toContain("--ro-bind-try /vault-copy/.jj /vault-copy/.jj");
    expect(args).toContain("--ro-bind-try /vault-copy/.git /vault-copy/.git");
    // a fresh /tmp first, then the run's temp folder inside it
    expect(args.indexOf("--tmpfs /tmp")).toBeLessThan(args.indexOf("--bind /tmp/run/tmp /tmp/run/tmp"));
    expect(args).not.toContain(homedir());
    expect(bwrapArgs({ cwd: "/vault" }, "/t").join(" ")).toContain("--ro-bind /vault /vault");
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
  it("cannot look around the home folder, or at Codex's login", () => {
    // denied (macOS), or empty but for the way to Codex's helper links and to the agent's folder, when
    // it is in the home folder (Linux: bubblewrap makes empty folders on the way to those it binds)
    const r = run('for d in "$HOME" "$HOME/.codex" "$HOME/.codex/tmp"; do ls -A "$d" 2>&1; done; echo DONE');
    expect(r.stdout).toContain("DONE");
    const onTheWay = relative(homedir(), folder).split(sep)[0];
    const seen = r.stdout.split("\n").filter((line) => line && line !== "DONE" && line !== onTheWay);
    expect(seen.filter((line) => !/^(\.codex|tmp|arg0)$|Operation not permitted|No such file/.test(line))).toEqual([]);
  });
  it("cannot reach the network", () => {
    const r = run("curl -sS -m 5 -o /dev/null https://example.com && echo REACHED || echo BLOCKED");
    expect(r.stdout).toContain("BLOCKED");
  });
});

// OpenCode's sandboxed shell, run as OpenCode runs it (`<shell> -c <command>`, in the agent's folder).
const hasSandbox =
  process.platform === "darwin"
    ? existsSync("/usr/bin/sandbox-exec")
    : spawnSync("which", ["bwrap"], { encoding: "utf8" }).status === 0;
describe.skipIf(!hasSandbox)("an agent's shell under OpenCode's sandbox", () => {
  const cache = join(process.cwd(), "node_modules", ".cache");
  mkdirSync(cache, { recursive: true });
  const folder = realpathSync(mkdtempSync(join(cache, "classroom-opencode-sandbox-")));
  spawnSync(process.env.JJ_BIN || "jj", ["git", "init"], { cwd: folder });
  writeFileSync(join(folder, "note.md"), "hello\n");
  // the live vault the agent reads (as the books' text is linked into an agent's copy)
  const live = realpathSync(mkdtempSync(join(cache, "classroom-opencode-live-")));
  writeFileSync(join(live, "book.md"), "a book\n");
  symlinkSync(join(live, "book.md"), join(folder, "book.md"));
  const shells = (write: boolean) => {
    const run = realpathSync(mkdtempSync(join(tmpdir(), "classroom-opencode-run-")));
    mkdirSync(join(run, "tmp"));
    return sandboxedShell({ cwd: folder, write, readRoots: [live] }, run, join(run, "tmp"));
  };
  const writable = shells(true);
  const readOnly = shells(false);
  const run = (command: string, write = true) =>
    spawnSync(write ? writable : readOnly, ["-c", command], { cwd: folder, encoding: "utf8", timeout: 30000 });
  it("can read and write its own folder, and read the live vault", () => {
    const r = run("cat note.md book.md && echo ok > written.md && cat written.md && rg -l hello .");
    expect(r.stdout).toContain("hello");
    expect(r.stdout).toContain("a book");
    expect(r.stdout).toContain("ok");
    expect(r.stdout).toContain("note.md");
  });
  it("cannot write outside its folder (its temp folder aside), into .jj or .git, the live vault, or its own shell", () => {
    const outside = join(mkdtempSync(join(cache, "classroom-outside-")), "x.txt");
    const r = run(
      `echo x > "${outside}"; echo y > .git/planted; echo y > .jj/planted; echo z > book.md; echo w > "${writable}"; echo t > "$TMPDIR/t" && cat "$TMPDIR/t"`,
    );
    expect(r.stdout).toBe("t\n");
    expect(existsSync(outside)).toBe(false);
    expect(existsSync(join(folder, ".git", "planted"))).toBe(false);
    expect(existsSync(join(folder, ".jj", "planted"))).toBe(false);
    expect(readFileSync(join(live, "book.md"), "utf8")).toBe("a book\n");
    expect(readFileSync(writable, "utf8")).toMatch(/^#!\/bin\/sh/);
  });
  it("cannot write at all when read-only", () => {
    run("echo z > readonly.md", false);
    expect(existsSync(join(folder, "readonly.md"))).toBe(false);
  });
  it("cannot look around the real home folder, or follow a link out to it", () => {
    symlinkSync(homedir(), join(folder, "home"));
    const r = run(`find "${homedir()}" 2>&1; ls -A home/ 2>&1; echo DONE`);
    expect(r.stdout).toContain("DONE");
    // bubblewrap makes empty folders on the way to those it binds, so on Linux the home folder shows
    // the way to the agent's folders (and what is in them), and nothing else
    const mine = (path: string) =>
      [folder, live].some((own) => own === path || own.startsWith(`${path}/`) || path.startsWith(`${own}/`));
    const onTheWay = [folder, live].map((own) => relative(homedir(), own).split(sep)[0]);
    const seen = r.stdout.split("\n").filter((line) => line && line !== "DONE");
    expect(
      seen.filter(
        (line) =>
          !/Operation not permitted|No such file|Permission denied/.test(line) &&
          !mine(line) &&
          !onTheWay.includes(line),
      ),
    ).toEqual([]);
  });
  it("gets none of the server's environment", () => {
    const r = spawnSync(writable, ["-c", "env"], {
      cwd: folder,
      encoding: "utf8",
      env: { ...process.env, CLASSROOM_SECRET: "s3cret" },
    });
    expect(r.stdout).not.toContain("s3cret");
    expect(r.stdout).toContain("PATH=");
  });
  it("cannot reach the network", () => {
    const r = run("curl -sS -m 5 -o /dev/null https://example.com && echo REACHED || echo BLOCKED");
    expect(r.stdout).toContain("BLOCKED");
  });
});
