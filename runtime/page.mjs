// Builds the standalone HTML page that hosts one demo: anatomy CSS, runtime CSS, the bundled kit,
// the Classroom runtime and the demo script. Used by the server (iframe pages, browser checks) and by
// the Node check inside each Codex build workspace.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const cache = new Map();

function read(path) {
  if (!cache.has(path)) cache.set(path, readFileSync(path, "utf8"));
  return cache.get(path);
}

/** Locations of the runtime pieces; a Codex workspace overrides them with its own copies. */
export function runtimeFiles(root = HERE) {
  return {
    kit: join(root, "dist", "kit.js"),
    runtime: join(root, "classroom.js"),
    draw2d: join(root, "draw2d.js"),
    css: join(root, "classroom.css"),
    isoCss: [join(root, "iso.css"), join(root, "..", "vendor", "anatomy", "kit", "iso.css")],
  };
}

function isoCss(files) {
  for (const path of files.isoCss) {
    try {
      return read(path);
    } catch {}
  }
  throw new Error("iso.css not found; run npm run sync:kit");
}

const script = (source) => `<script>${String(source).replace(/<\/(script)/gi, "<\\/$1")}</script>`;
const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * @param {{ source: string, theme?: "light"|"dark", fig?: string, title?: string, predict?: boolean, autoplay?: boolean, files?: ReturnType<typeof runtimeFiles> }} options
 */
export function buildDemoPage({
  source,
  theme = "light",
  fig = "Fig 1",
  title = "Visualization",
  predict = true,
  autoplay = true,
  files = runtimeFiles(),
}) {
  const opts = { theme: theme === "dark" ? "dark" : "light", fig, predict, autoplay };
  const csp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><title>${escapeHtml(title)}</title><style>${isoCss(files)}${read(files.css)}</style></head><body class="iso" data-theme="${opts.theme}"><div id="classroom"></div>${script(`window.__CLASSROOM_OPTS=${JSON.stringify(opts)};`)}${script(read(files.kit))}${script(read(files.draw2d))}${script(read(files.runtime))}${script(source)}</body></html>`;
}
