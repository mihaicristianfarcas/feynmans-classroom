/* The sandboxes agents run in. Both CLIs confine a shell with the operating system's own sandbox
 * (Seatbelt on macOS, bubblewrap/Landlock on Linux); these build their settings so an agent can read
 * only its folder (plus system files and tools), write there only when allowed, never touch the
 * version control inside it (.jj, .git), and reach no network. tests/agent-sandbox.test.ts runs real commands under the Codex profile. */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
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
