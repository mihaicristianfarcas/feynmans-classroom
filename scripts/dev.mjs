// Runs the API server (tsx watch) and the Vite dev server together.
import { spawn } from "node:child_process";

const run = (name, args) => {
  const child = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const tag = (line) => `\x1b[2m[${name}]\x1b[0m ${line}`;
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => String(chunk).split("\n").filter(Boolean).forEach((l) => console.log(tag(l))));
  child.on("exit", (code) => {
    console.log(tag(`exited with ${code}`));
    process.exit(code ?? 1);
  });
  return child;
};
const children = [run("api", ["tsx", "watch", "--clear-screen=false", "--exclude", "data/**", "server/index.ts"]), run("web", ["vite"])];
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => children.forEach((c) => c.kill(signal)));
