/* The classroom's own copy of what an animation needs to run in the browser: Pyodide (Python compiled
 * to WebAssembly) and ManimGX with the few packages it depends on, from PyPI. Each file is fetched once,
 * on first use, and kept in DATA_DIR/.cache/manimgx, so animations play offline afterwards and the
 * sandboxed frames they run in reach no other site (an opaque origin's frames share no browser cache,
 * so a file served from here, on this machine, is what keeps each frame fast).
 *
 *   /api/manim/pyodide/<file>         Pyodide's distribution (its index URL)
 *   /api/manim/pypi/<package>/json    PyPI's JSON API for the allowed packages, links pointing here
 *   /api/manim/files/packages/…       the packages' files, from files.pythonhosted.org
 *
 * Only these packages are served, and only files with the names those places use. Everything here is
 * public, so it is served to any origin (the frames have none). */
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Context, Hono } from "hono";
import { DATA_DIR } from "../config.ts";
import { sendFile } from "../http.ts";

export const PYODIDE_VERSION = "314.0.7";
export const MANIMGX_VERSION = "0.1.1";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const CACHE = join(DATA_DIR, ".cache", "manimgx");

/** What ManimGX needs in the browser, and what a scene may add (networkx, for graphs). */
const PACKAGES = new Set([
  "manimgx",
  "manimgx-fonts",
  "isosurfaces",
  "svgelements",
  "typing-extensions",
  "numpy",
  "pillow",
  "networkx",
  "packaging",
]);

const TYPES: Record<string, string> = {
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".json": "application/json",
  ".zip": "application/zip",
  ".whl": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
};
const typeOf = (name: string) =>
  TYPES[/\.[a-z0-9]+$/i.exec(name)?.[0].toLowerCase() || ""] || "application/octet-stream";

/** Served to any origin: these are public files, and the frames that ask have an opaque origin. */
const OPEN = {
  "access-control-allow-origin": "*",
  "cross-origin-resource-policy": "cross-origin",
  "x-content-type-options": "nosniff",
};

const downloads = new Map<string, Promise<void>>();

/** Makes sure `url` is on disk at `path`, fetching it (once, however many ask) when it isn't. */
async function cached(url: string, path: string) {
  if (existsSync(path)) return;
  let job = downloads.get(path);
  if (!job) {
    job = (async () => {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`);
      mkdirSync(dirname(path), { recursive: true });
      const part = `${path}.part-${process.pid}`;
      try {
        await pipeline(Readable.fromWeb(response.body as never), createWriteStream(part));
        renameSync(part, path);
      } catch (error) {
        rmSync(part, { force: true });
        throw error;
      }
    })().finally(() => downloads.delete(path));
    downloads.set(path, job);
  }
  await job;
}

const serve = (path: string, name: string, immutable = true) =>
  sendFile(path, {
    ...OPEN,
    "content-type": typeOf(name),
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });

/** The origin the asking frame was loaded from (its Host, which the local-only guard has checked). */
const originOf = (c: Context) => `http://${c.req.header("host") || "127.0.0.1"}`;

export function mirrorRoutes(app: Hono) {
  app.get("/api/manim/pyodide/:file", async (c) => {
    const file = c.req.param("file");
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(file)) return c.text("not found", 404);
    const path = join(CACHE, `pyodide-${PYODIDE_VERSION}`, file);
    try {
      await cached(PYODIDE_URL + file, path);
    } catch (error) {
      return c.text(`could not fetch ${file}: ${(error as Error).message}`, 502, OPEN);
    }
    return serve(path, file);
  });

  app.get("/api/manim/pypi/:name/json", async (c) => {
    const name = c.req.param("name").toLowerCase().replace(/[._]+/g, "-");
    if (!PACKAGES.has(name)) return c.json({ message: "Not Found" }, 404, OPEN);
    const path = join(CACHE, "pypi", `${name}.json`);
    // the index is fetched again after a day, and the copy on disk used when that fails (offline)
    const fresh = existsSync(path) && Date.now() - statSync(path).mtimeMs < 24 * 3600 * 1000;
    if (!fresh) {
      rmSync(`${path}.new`, { force: true });
      try {
        await cached(`https://pypi.org/pypi/${name}/json`, `${path}.new`);
        renameSync(`${path}.new`, path);
      } catch (error) {
        if (!existsSync(path)) return c.json({ message: (error as Error).message }, 502, OPEN);
      }
    }
    const files = `${originOf(c)}/api/manim/files/`;
    const text = readFileSync(path, "utf8").replaceAll("https://files.pythonhosted.org/", files);
    return c.body(text, 200, { ...OPEN, "content-type": "application/json", "cache-control": "no-cache" });
  });

  app.get("/api/manim/files/*", async (c) => {
    const rel = c.req.path.replace(/^\/api\/manim\/files\//, "");
    if (!/^packages\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{60}\/[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(rel))
      return c.text("not found", 404, OPEN);
    const file = rel.split("/").pop()!;
    const project = file.split("-")[0].toLowerCase().replace(/_/g, "-");
    if (!PACKAGES.has(project)) return c.text("not found", 404, OPEN);
    const path = join(CACHE, "files", rel);
    try {
      await cached(`https://files.pythonhosted.org/${rel}`, path);
    } catch (error) {
      return c.text(`could not fetch ${file}: ${(error as Error).message}`, 502, OPEN);
    }
    return serve(path, file);
  });
}
