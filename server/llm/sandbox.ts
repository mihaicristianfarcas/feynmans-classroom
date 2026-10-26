/* The sandboxes agents run in. Codex and Claude Code confine a shell with the operating system's own
 * sandbox (Seatbelt on macOS, bubblewrap/Landlock on Linux), and these build their settings; OpenCode
 * has none of its own, so its agents' shell is a script that runs each command under Seatbelt or
 * bubblewrap with a profile built here. Either way an agent can read only its folder (plus system
 * files and tools), write there only when allowed, never touch the version control inside it (.jj,
 * .git), and reach no network. tests/agent-sandbox.test.ts runs real commands under the Codex profile
 * and the OpenCode shell. */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { CODEX } from "../config.ts";

/** What an agent may touch: its folder (`cwd`), writable only with `write`, and more folders to read. */
export interface Confinement {
  cwd: string;
  write?: boolean;
  readRoots?: string[];
}

const toml = (s: string) => JSON.stringify(s);

/** Where the Codex binary and its tools live: the sandbox must let it run itself (and rg). */
export function codexToolRoots(): string[] {
  const roots = new Set<string>();
  const bin = CODEX.bin;
  const which = bin.includes("/") ? bin : spawnSync("which", [bin], { encoding: "utf8" }).stdout.trim();
  for (const path of [which, which && existsSync(which) ? realpathSync(which) : ""]) {
    if (!path) continue;
    const brew = /^(\/opt\/homebrew|\/usr\/local|\/home\/linuxbrew\/\.linuxbrew)\//.exec(path);
    roots.add(brew ? brew[1] : dirname(dirname(path)));
  }
  // on Linux Codex starts its sandbox helper from links in here (not the rest of CODEX_HOME: the login)
  if (process.platform === "linux")
    roots.add(realPath(resolve(process.env.CODEX_HOME || join(homedir(), ".codex"), "tmp", "arg0")));
  return [...roots].filter((r) => r && r !== "/");
}

/** Version control inside an agent's folder: readable, never writable (Codex guards .git itself, not .jj). */
const LOCKED = [".jj", ".git"];

/** Where a path really is: the sandboxes match real paths, and /tmp is /private/tmp on macOS. */
function realPath(path: string) {
  try {
    return realpathSync(path);
  } catch {
    try {
      return join(realpathSync(dirname(path)), basename(path));
    } catch {
      return path;
    }
  }
}
/** The version-control folders in `cwd`, as given and as they really are (a symlink must not unlock them). */
const lockedIn = (cwd: string) => [...new Set(LOCKED.flatMap((dir) => [join(cwd, dir), realPath(join(cwd, dir))]))];

/** A Codex permission profile: system files and tools readable, `cwd` readable (or writable, but not
 * its .jj and .git), nothing else. */
export function codexProfile(options: Confinement): string[] {
  const fs: Record<string, string> = { ":minimal": "read" };
  for (const root of codexToolRoots()) fs[root] = "read";
  for (const root of options.readRoots || []) fs[root] = "read";
  fs[":project_roots"] = options.write ? "write" : "read";
  if (options.write) for (const path of lockedIn(options.cwd)) fs[path] = "read";
  fs[":tmpdir"] = "write";
  const table = Object.entries(fs)
    .map(([k, v]) => `${toml(k)}=${toml(v)}`)
    .join(", ");
  return [
    'default_permissions="classroom"',
    `permissions.classroom.filesystem={${table}}`,
    'shell_environment_policy.inherit="core"',
  ];
}

/** Claude Code sandbox settings: reads confined to `cwd` (and `readRoots`), writes to `cwd` only if allowed, .jj and .git locked, no network. */
export function claudeSandbox(options: Confinement) {
  const read = [options.cwd, ...(options.readRoots || [])];
  return {
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      failIfUnavailable: true,
      filesystem: {
        denyRead: ["~/"],
        allowRead: read,
        allowWrite: options.write ? [options.cwd] : [],
        denyWrite: [...lockedIn(options.cwd), ...(options.readRoots || [])],
      },
      network: { allowedDomains: [] },
    },
    permissions: {
      blockReadsOutsideWorkingDirectories: true,
      // the file tools follow the same rule as the shell: only the agent's own folder is writable
      deny: [
        ...(options.readRoots || []).flatMap((r) => [`Edit(/${r}/**)`, `Write(/${r}/**)`]),
        ...lockedIn(options.cwd).flatMap((path) => [`Edit(/${path}/**)`, `Write(/${path}/**)`]),
      ],
    },
  };
}

/** System files and tools an OpenCode agent's commands may read on macOS: enough for sh, rg, sed, jq,
 * sqlite3, node, and git and python3 (which run from the developer tools). */
const MAC_SYSTEM = [
  "/usr",
  "/bin",
  "/sbin",
  "/System",
  "/Library",
  "/private/etc",
  "/private/var/select",
  "/private/var/db/timezone",
  "/opt/homebrew",
  "/dev",
];
/** The same on Linux, bound read-only into an otherwise empty root (those missing are skipped). */
const LINUX_SYSTEM = [
  "/usr",
  "/bin",
  "/sbin",
  "/lib",
  "/lib32",
  "/lib64",
  "/libx32",
  "/etc",
  "/opt",
  "/nix/store",
  "/run/current-system",
  "/home/linuxbrew/.linuxbrew",
];

let developer: string[] | null = null;
/** The app the developer tools are in (Xcode), which macOS's git and python3 start from. */
function developerApp(): string[] {
  if (developer === null) {
    const dir = spawnSync("xcode-select", ["-p"], { encoding: "utf8" }).stdout?.trim() || "";
    const app = /^(.*?\.app)\//.exec(dir)?.[1];
    developer = app ? [app] : [];
  }
  return developer;
}

/** Each path as given and as it really is. */
const both = (paths: string[]) => [...new Set(paths.flatMap((path) => [path, realPath(path)]))];
/** The folders above `path`, up to the root. */
function ancestors(path: string): string[] {
  const up: string[] = [];
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    up.push(dir);
    if (dir === dirname(dir)) return up;
  }
}
/** A path in a Seatbelt profile: a double-quoted string with backslash escapes, as JSON writes it. */
const sbpl = (path: string) => JSON.stringify(path);

/** A Seatbelt profile (macOS) for an OpenCode agent's commands: system files and tools, `cwd` and
 * `readRoots` readable, `cwd` writable only with `write` (never its .jj and .git), `tmp` writable, the
 * folders above them looked up but not listed, and no network. */
export function seatbeltProfile(options: Confinement, tmp: string): string {
  const read = both([...MAC_SYSTEM, ...developerApp(), ...(options.readRoots || []), options.cwd, tmp]);
  const each = (kind: string, paths: string[]) => paths.map((path) => `(${kind} ${sbpl(path)})`).join(" ");
  const lines = [
    "(version 1)",
    "(deny default)",
    "(allow process-exec process-fork)",
    "(allow signal (target same-sandbox))",
    "(allow process-info* (target same-sandbox))",
    "(allow sysctl-read)",
    "(allow user-preference-read)",
    "(allow ipc-posix-sem)",
    "(allow pseudo-tty)",
    '(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo") (global-name "com.apple.system.logger"))',
    `(allow file-read-metadata ${each("literal", [...new Set(read.flatMap(ancestors))])})`,
    // the root itself (programs' loader reads it) and its links into /private
    `(allow file-read* ${each("literal", ["/", "/etc", "/tmp", "/var"])} ${each("subpath", read)})`,
    '(allow file-write-data file-ioctl (literal "/dev/null") (literal "/dev/tty"))',
    `(allow file-write* ${each("subpath", both([tmp]))})`,
  ];
  if (options.write)
    lines.push(
      `(allow file-write* (require-all (require-any ${each("subpath", both([options.cwd]))}) ${lockedIn(options.cwd)
        .map((path) => `(require-not (subpath ${sbpl(path)}))`)
        .join(" ")}))`,
    );
  return `${lines.join("\n")}\n`;
}

/** bubblewrap's arguments (Linux) for the same: an empty root with the system folders, `readRoots` and
 * `cwd` bound read-only, `cwd` (but its .jj and .git) writable only with `write`, `tmp` writable, a fresh
 * /tmp, /dev and /proc, and no network. */
export function bwrapArgs(options: Confinement, tmp: string): string[] {
  const args = ["--die-with-parent", "--new-session", "--unshare-all"];
  for (const dir of LINUX_SYSTEM) args.push("--ro-bind-try", dir, dir);
  args.push("--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp");
  for (const root of options.readRoots || []) for (const path of both([root])) args.push("--ro-bind", root, path);
  for (const path of both([options.cwd])) args.push(options.write ? "--bind" : "--ro-bind", options.cwd, path);
  if (options.write) for (const path of lockedIn(options.cwd)) args.push("--ro-bind-try", path, path);
  args.push("--bind", tmp, tmp);
  return args;
}

/** What a sandboxed command inherits: the basics, none of the server's own variables (as Codex's "core"). */
const CORE_ENV = ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "USER", "LOGNAME"];
/** A word for /bin/sh, quoted. */
const shellWord = (word: string) => `'${word.replace(/'/g, `'\\''`)}'`;

/** Writes the shell OpenCode runs an agent's commands with (it calls `<shell> -c <command>`): a script in
 * `dir` that runs each one under the OS sandbox, with `tmp` as its temp folder. `dir` must be one the
 * commands can't write. Returns the script's path; throws where there is no sandbox to run them in. */
export function sandboxedShell(options: Confinement, dir: string, tmp: string): string {
  const env = ["/usr/bin/env", "-i", ...CORE_ENV.flatMap((k) => (process.env[k] ? [`${k}=${process.env[k]}`] : []))];
  // home is the temp folder too: tools that keep caches there (python) would otherwise make the real
  // home's path inside the agent's folder, where they can write
  env.push(`HOME=${tmp}`, `TMPDIR=${tmp}`, "SHELL=/bin/sh", "PYTHONDONTWRITEBYTECODE=1");
  let run: string[];
  if (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) {
    const profile = join(dir, "sandbox.sb");
    writeFileSync(profile, seatbeltProfile(options, tmp));
    run = [...env, "/usr/bin/sandbox-exec", "-f", profile, "/bin/sh"];
  } else if (process.platform === "linux") {
    const bwrap = spawnSync("which", ["bwrap"], { encoding: "utf8" }).stdout?.trim();
    if (!bwrap) throw new Error("OpenCode's agents run their commands in bubblewrap: install it (bwrap)");
    run = [...env, bwrap, ...bwrapArgs(options, tmp), "--", "/bin/sh"];
  } else throw new Error("OpenCode's agents need the sandbox of macOS or Linux to run commands");
  const script = join(dir, "shell");
  writeFileSync(script, `#!/bin/sh\nexec ${run.map(shellWord).join(" ")} "$@"\n`, { mode: 0o755 });
  return script;
}
