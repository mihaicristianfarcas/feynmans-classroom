import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT, "data"));
export const BOOKS_DIR = join(DATA_DIR, "books");
export const RUNTIME_DIR = join(ROOT, "runtime");
export const VENDOR_DIR = join(ROOT, "vendor", "anatomy");
export const WEB_DIST = join(ROOT, "web", "dist");
export const PORT = Number(process.env.PORT || 8787);
export const PROD = process.env.NODE_ENV === "production";

const num = (value: string | undefined, fallback: number) => (value && Number.isFinite(Number(value)) ? Number(value) : fallback);

/** How the platform drives Codex. Every value can be overridden from the environment. */
export const CODEX = {
  bin: process.env.CODEX_BIN || "codex",
  /** Model override (empty: whatever ~/.codex/config.toml says). */
  model: process.env.CODEX_MODEL || "",
  planEffort: process.env.CODEX_PLAN_EFFORT || "medium",
  buildEffort: process.env.CODEX_BUILD_EFFORT || "",
  /** Parallel Codex build sessions. */
  concurrency: num(process.env.CODEX_CONCURRENCY, 2),
  /** Fix rounds after a failed check, and critique rounds after a passing one. */
  fixRounds: num(process.env.CODEX_FIX_ROUNDS, 2),
  critiqueRounds: num(process.env.CODEX_CRITIQUE_ROUNDS, 1),
  /** Models to try when the configured one is at capacity (comma-separated); default: the next ones Codex lists. */
  fallbackModels: (process.env.CODEX_FALLBACK_MODELS || "").split(",").map((m) => m.trim()).filter(Boolean),
  /** Hard stop for a single codex exec call. */
  timeoutMs: num(process.env.CODEX_TIMEOUT_MS, 20 * 60 * 1000),
};

export const GENERATION = {
  minDemos: num(process.env.DEMOS_MIN, 2),
  maxDemos: num(process.env.DEMOS_MAX, 5),
  /** Characters of chapter text sent to the planner. */
  maxChapterChars: num(process.env.PLAN_MAX_CHARS, 60000),
};

export function chromePath(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean) as string[];
  // browsers installed by Playwright or Puppeteer
  for (const cache of [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")]) {
    if (!existsSync(cache)) continue;
    for (const dir of readdirSync(cache).sort().reverse()) {
      for (const sub of ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-linux/chrome", "chrome-linux64/chrome"]) candidates.push(join(cache, dir, sub));
    }
  }
  const puppeteer = join(homedir(), ".cache/puppeteer/chrome");
  if (existsSync(puppeteer)) {
    for (const dir of readdirSync(puppeteer).sort().reverse()) {
      for (const sub of ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-linux64/chrome"]) candidates.push(join(puppeteer, dir, sub));
    }
  }
  return candidates.find((path) => existsSync(path)) || null;
}
