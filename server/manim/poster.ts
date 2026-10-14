/* Stills of animations: a frame from each, in the light and the dark theme, so an animation shows what
 * it is before it plays (its poster in the margin, its picture in the Figures index). Drawn in headless
 * Chrome, in the same sandboxed page it plays in, a little past the middle of the film; kept in
 * DATA_DIR/.cache/manimgx/posters, named by a hash of the code (the app finds them the same way). */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromePath, DATA_DIR, PORT } from "../config.ts";
import { getBrowser, inTurn } from "./check.ts";

export const POSTERS = join(DATA_DIR, ".cache", "manimgx", "posters");
const THEMES = ["light", "dark"] as const;

/** The name of a still: the code's hash (its text, line endings and outer blank space aside), and the theme. */
export function posterName(code: string, theme: "light" | "dark") {
  const hash = createHash("sha256").update(code.replace(/\r\n/g, "\n").trim()).digest("hex").slice(0, 32);
  return `${hash}-${theme}.webp`;
}
export const isPosterName = (name: string) => /^[0-9a-f]{32}-(light|dark)\.webp$/.test(name);

/** Draws the stills an animation doesn't have yet (both themes); false when it can't (no Chrome, an error). */
export function renderPosters(code: string): Promise<boolean> {
  const missing = THEMES.filter((theme) => !existsSync(join(POSTERS, posterName(code, theme))));
  if (!missing.length) return Promise.resolve(true);
  if (!chromePath()) return Promise.resolve(false);
  return inTurn(async () => {
    const page = await (await getBrowser()).newPage();
    try {
      await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
      for (const theme of missing) {
        await page.goto(`http://127.0.0.1:${PORT}/api/manim/frame?mode=poster`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => "__manimPoster" in window, { timeout: 20000 });
        const report = (await Promise.race([
          page.evaluate(
            (source, t) =>
              (window as unknown as { __manimPoster: (c: string, t: string) => Promise<unknown> }).__manimPoster(
                source,
                t,
              ),
            code,
            theme,
          ),
          new Promise((resolve) => setTimeout(() => resolve({ error: "timeout" }), 90_000)),
        ])) as { error?: unknown; duration?: number };
        if (report.error || !report.duration) return false;
        mkdirSync(POSTERS, { recursive: true });
        writeFileSync(join(POSTERS, posterName(code, theme)), await page.screenshot({ type: "webp", quality: 82 }));
      }
      return true;
    } catch {
      return false;
    } finally {
      await page.close().catch(() => {});
    }
  });
}
