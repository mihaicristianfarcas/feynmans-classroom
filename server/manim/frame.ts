/* The page an animation plays in, inside a sandboxed frame: ManimGX's player (runtime/manim, bundled
 * here with esbuild on first use) with nothing else on it. Its policy lets it run its own script, its
 * Python worker and WebAssembly, and fetch only from the classroom's mirror (/api/manim/…): a scene is
 * code a model wrote, so it runs with an opaque origin (no cookies, no storage, no reading the app's
 * API) and can reach no other site. */
import { statSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { RUNTIME_DIR } from "../config.ts";
import { MANIMGX_VERSION } from "./mirror.ts";

const DIR = join(RUNTIME_DIR, "manim");
let bundle: { script: string; stamp: number } | null = null;

/** The newest change to the runtime's sources (so a development server rebuilds after an edit). */
const stampOf = () =>
  Math.max(
    ...["director.ts", "player.ts", "frame.ts", "protocol.ts", "engine.ts"].map((f) => statSync(join(DIR, f)).mtimeMs),
  );

/** The frame's script: the director bundled as a string for its worker, inside the bundled page script. */
async function script(): Promise<string> {
  const stamp = stampOf();
  if (bundle?.stamp === stamp) return bundle.script;
  const options = {
    bundle: true,
    format: "esm",
    minify: true,
    target: "es2022",
    write: false,
    legalComments: "none",
  } as const;
  // the director is a classic worker (an opaque origin can't start a module worker from a blob)
  const director = await build({ ...options, format: "iife", entryPoints: [join(DIR, "director.ts")] });
  const page = await build({
    ...options,
    entryPoints: [join(DIR, "frame.ts")],
    define: {
      DIRECTOR: JSON.stringify(director.outputFiles[0].text),
      MANIMGX_VERSION: JSON.stringify(MANIMGX_VERSION),
    },
  });
  bundle = { script: page.outputFiles[0].text, stamp };
  return bundle.script;
}

/** The policy for a frame loaded from `origin`: its own script and worker, WebAssembly, and the mirror. */
export function frameCsp(origin: string) {
  const mirror = `${origin}/api/manim/`;
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'wasm-unsafe-eval' blob: ${mirror}`,
    "worker-src blob:",
    `connect-src ${mirror}`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data: blob:",
    "media-src data: blob:",
    "sandbox allow-scripts",
  ].join("; ");
}

export async function framePage(): Promise<string> {
  const code = (await script()).replace(/<\/(script)/gi, "<\\/$1");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Animation</title><style>
html,body{margin:0;height:100%;overflow:hidden;background:#252529}
html[data-theme="light"],html[data-theme="light"] body{background:#ffffff}
manimgx-player{width:100%;height:100%;aspect-ratio:auto!important;background:transparent}
manimgx-player:focus-visible{outline:2px solid #8b7fe0;outline-offset:-2px}
</style></head><body><script type="module">${code}</script></body></html>`;
}
