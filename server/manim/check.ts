/* Checking an animation before anyone sees it (and the headless Chrome that does it, shared with the
 * stills in poster.ts): its scene is run in headless Chrome, in the same
 * sandboxed page the reader plays it in (server/manim/frame.ts, its check mode), without drawing: the
 * run must finish without an error, and ManimGX's own layout checks (what `manimgx inspect` reports)
 * look at the end of each play for text the frame cuts off, texts over each other, lines through
 * labels and text too small to read. One page stays open with Python booted, so a check after the first
 * takes a moment. */
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { chromePath, PORT } from "../config.ts";

export interface CheckReport {
  ok: boolean;
  /** The scene's error: its message and the scene's own lines of the trace. */
  error?: string;
  /** Seconds. */
  duration?: number;
  /** ManimGX's layout report, and how many problems it found (notes, likely meant, don't count). */
  layout?: string;
  problems?: number;
}

let browser: Promise<Browser> | null = null;
let page: Promise<Page> | null = null;
let queue: Promise<unknown> = Promise.resolve();
/** The first check downloads Python and ManimGX into the mirror (once); later ones take a moment. */
let warmed = false;

/** The headless Chrome that checks animations and draws their stills (started on first use). */
export function getBrowser(): Promise<Browser> {
  const executablePath = chromePath();
  if (!executablePath) throw new Error("Chrome not found; set CHROME_PATH to check animations");
  browser ??= puppeteer
    .launch({
      executablePath,
      headless: true,
      args: ["--no-first-run", "--no-default-browser-check", "--mute-audio"],
    })
    .then((b) => {
      b.on("disconnected", () => {
        browser = null;
        page = null;
      });
      return b;
    });
  return browser;
}

let idle: ReturnType<typeof setTimeout> | undefined;
/** Chrome is closed after a few quiet minutes (it starts again, in a moment, when it's next needed). */
const IDLE_MS = 5 * 60 * 1000;

/** Runs browser work one piece at a time (a check, a still), so they don't compete for the machine. */
let waiting = 0;
export function inTurn<T>(work: () => Promise<T>): Promise<T> {
  clearTimeout(idle);
  waiting++;
  const run = queue.then(work).finally(() => {
    if (--waiting > 0) return;
    idle = setTimeout(() => void closeChecks(), IDLE_MS);
    idle.unref?.();
  });
  queue = run.catch(() => {});
  return run;
}

async function getPage(): Promise<Page> {
  await getBrowser();
  page ??= (async () => {
    const p = await (await browser!).newPage();
    await p.goto(`http://127.0.0.1:${PORT}/api/manim/frame?mode=check`, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(() => "__manimCheck" in window, { timeout: 20000 });
    return p;
  })().catch((error) => {
    page = null;
    throw error;
  });
  return page;
}

/** Throws the page away (a scene that never ended, a crash): the next check starts a fresh one. */
async function reset() {
  const p = page;
  page = null;
  warmed = false;
  await (await p?.catch(() => null))?.close().catch(() => {});
}

export async function closeChecks() {
  await reset();
  (await browser?.catch(() => null))?.close().catch(() => {});
  browser = null;
}

/** Runs a scene's source and reports what came of it; null when checking isn't possible here (no Chrome). */
export function checkScene(code: string): Promise<CheckReport | null> {
  return inTurn(async (): Promise<CheckReport | null> => {
    if (!chromePath()) return null;
    const p = await getPage();
    const limit = warmed ? 90_000 : 300_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      p.evaluate(
        (source) => (window as unknown as { __manimCheck: (s: string) => Promise<unknown> }).__manimCheck(source),
        code,
      ),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), limit);
      }),
    ]).finally(() => clearTimeout(timer));
    if (result === "timeout") {
      await reset();
      return {
        ok: false,
        error: `the scene did not finish within ${limit / 1000} s (an endless loop, or far too much to draw)`,
      };
    }
    warmed = true;
    const r = result as {
      error?: { message: string; type: string; trace?: string; line?: number | null };
      duration?: number;
      layout?: string;
      problems?: number;
    };
    if (r.error)
      return {
        ok: false,
        error:
          r.error.trace?.trim() ||
          `${r.error.type}: ${r.error.message}${r.error.line ? ` (line ${r.error.line})` : ""}`,
      };
    return { ok: true, duration: r.duration, layout: r.layout, problems: r.problems ?? 0 };
  });
}
