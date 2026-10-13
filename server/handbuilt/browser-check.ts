/* Checking a hand-built demo in real Chrome (headless, via puppeteer-core): it must run without
 * errors, animate, keep its labels apart and fill its stage. The screenshots it takes go back to
 * Codex when something needs fixing. */
import puppeteer, { type Browser } from "puppeteer-core";
import { buildDemoPage } from "../../runtime/page.mjs";
import type { BrowserReport } from "../books/types.ts";
import { chromePath } from "../config.ts";

let browser: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  const executablePath = chromePath();
  if (!executablePath) throw new Error("Chrome not found; set CHROME_PATH to run the browser check");
  if (!browser) {
    browser = puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--hide-scrollbars",
        "--mute-audio",
        "--use-gl=angle",
        "--enable-unsafe-swiftshader",
      ],
    });
    browser.then((b) => b.on("disconnected", () => (browser = null))).catch(() => (browser = null));
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) (await browser).close().catch(() => {});
  browser = null;
}

/**
 * Renders a demo in real Chrome: collects runtime and console errors, checks that frames run, and
 * captures the card in light and dark theme (and a phone-width shot) for review.
 */
export async function browserCheck(
  source: string,
  shotBase: string,
  options: { fig?: string; wait?: number } = {},
): Promise<BrowserReport> {
  const report: BrowserReport = { ok: false, errors: [], frames: 0, readout: "", shots: [] };
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width: 720, height: 860, deviceScaleFactor: 2 });
    page.on("pageerror", (error) => report.errors.push(`page error: ${(error as Error).message}`));
    page.on("console", (message) => {
      if (message.type() === "error") report.errors.push(`console: ${message.text()}`);
    });
    const html = buildDemoPage({ source, theme: "light", fig: options.fig || "Fig 1", predict: false });
    await page.setContent(html, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, options.wait ?? 2200));
    const state = await page.evaluate(() => {
      const S = (
        window as unknown as {
          __classroom?: { errors?: { where: string; message: string }[]; frames?: number; [key: string]: unknown };
        }
      ).__classroom;
      const root = document.querySelector(".cr-root") as HTMLElement | null;
      const svg = document.querySelector(".cr-stage svg") as SVGSVGElement | null;
      // labels that collide with each other are the most common layout fault
      const boxes = [...document.querySelectorAll(".cr-stage svg text")]
        .map((t) => (t as SVGTextElement).getBoundingClientRect())
        .filter((r) => r.width > 0);
      let overlaps = 0;
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            c = boxes[j];
          const w = Math.min(a.right, c.right) - Math.max(a.left, c.left),
            h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (w > 2 && h > 2) overlaps++;
        }
      // drawing extent against the viewBox
      let fill = 0;
      try {
        const bb = svg!.getBBox();
        const vb = svg!.viewBox.baseVal;
        fill = Math.max(bb.width / vb.width, bb.height / vb.height);
      } catch {}
      return {
        errors: (S?.errors || []).map((e: { where: string; message: string }) => `${e.where}: ${e.message}`),
        frames: S?.frames || 0,
        readout: (document.querySelector("[data-readout]")?.textContent || "").trim(),
        overflow: root ? root.scrollWidth > window.innerWidth + 1 : false,
        overlaps,
        fill: Math.round(fill * 100) / 100,
      };
    });
    report.errors.push(...state.errors);
    report.frames = state.frames;
    report.readout = state.readout;
    if (state.overlaps) report.errors.push(`${state.overlaps} pair(s) of labels overlap each other in the drawing`);
    if (state.fill && state.fill < 0.45)
      report.errors.push(
        `the drawing uses only ${Math.round(state.fill * 100)}% of the viewBox: enlarge it or shrink the viewBox`,
      );
    if (state.overflow) report.errors.push("the page scrolls sideways at 720 px wide");

    const card = await page.$(".cr-root");
    const light = `${shotBase}-light.png`;
    await (card || page).screenshot({ path: light as `${string}.png` });
    report.shots.push(light);
    await page.evaluate(() =>
      (window as unknown as { Classroom: { setTheme(theme: string): void } }).Classroom.setTheme("dark"),
    );
    await new Promise((r) => setTimeout(r, 500));
    const dark = `${shotBase}-dark.png`;
    await (card || page).screenshot({ path: dark as `${string}.png` });
    report.shots.push(dark);
    if (report.frames < 5)
      report.errors.push(
        `only ${report.frames} frames ran in ${((options.wait ?? 2200) / 1000).toFixed(1)} s: the demo should animate on its own`,
      );
    report.ok = report.errors.length === 0;
    return report;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Screenshot only (for thumbnails), light theme. */
export async function thumbnail(source: string, path: string) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width: 640, height: 520, deviceScaleFactor: 1 });
    await page.setContent(buildDemoPage({ source, theme: "light", predict: false }), { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 1500));
    const plate = await page.$(".cr-plate");
    await (plate || page).screenshot({ path: path as `${string}.png` });
  } finally {
    await page.close().catch(() => {});
  }
}
