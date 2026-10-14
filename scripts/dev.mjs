// Runs the API server (tsx watch) and the Vite dev server together, and stops them together: when
// either exits, or on Ctrl-C, both are stopped with everything they started (each runs in a process
// group of its own), and this exits only once they are gone, so neither is left running.
import { spawn } from "node:child_process";

const children = new Set();
let stopping = false;
let exitCode = 0;

/** Sends a signal to a server and everything it started. */
function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

/** Stops whatever is still running: asked first, then made to after 5 s (or at a second Ctrl-C). */
function stop(code) {
  if (stopping) {
    for (const child of children) signalGroup(child, "SIGKILL");
    return;
  }
  stopping = true;
  exitCode = code;
  for (const child of children) signalGroup(child, "SIGTERM");
  setTimeout(() => {
    for (const child of children) signalGroup(child, "SIGKILL");
  }, 5000).unref();
  if (!children.size) process.exit(code);
}

const run = (name, args) => {
  const child = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env, detached: true });
  children.add(child);
  const tag = (line) => `\x1b[2m[${name}]\x1b[0m ${line}`;
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) if (line) console.log(tag(line));
    });
  child.on("exit", (code, signal) => {
    console.log(tag(`exited with ${code ?? signal}`));
    children.delete(child);
    if (!stopping) stop(code ?? 1);
    if (!children.size) process.exit(exitCode);
  });
};
run("api", ["tsx", "watch", "--clear-screen=false", "--exclude", "data/**", "server/index.ts"]);
run("web", ["vite"]);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(0));
