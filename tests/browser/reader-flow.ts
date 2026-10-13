// Drives the reader like a person: select a passage, open Visualize, ask for a figure, wait for it.
//   npx tsx tests/browser/reader-flow.ts <bookId> <block> <out-dir> ["request"]   (npm run dev must be running; uses the model)
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { chromePath } from "../../server/config.ts";

const [bookId, block = "60", outDir = "shots", request = ""] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const base = process.env.APP_URL || "http://localhost:5173/";
const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror ${(e as Error).message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console ${m.text()}`));
await page.goto(`${base}#/book/${bookId}?at=${block}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(`[data-block="${block}"]`, { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));

// select the paragraph's text and let the reader see the mouseup
const box = await page.evaluate((b) => {
  const el = document.querySelector(`[data-block="${b}"]`) as HTMLElement;
  el.scrollIntoView({ block: "center" });
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom - 4 };
}, block);
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.up();
await page.evaluate((b) => {
  // mouse.down/up collapses the selection in headless Chrome: select again, then fire mouseup
  const el = document.querySelector(`[data-block="${b}"]`) as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}, block);
await page.waitForSelector(".select-pop", { timeout: 5000 });
await page.screenshot({ path: join(outDir, "1-popover.png") as `${string}.png` });
console.log("popover:", await page.$$eval(".select-action", (els) => els.map((e) => e.textContent).join(" | ")));

await page.click(".select-action.primary");
await page.waitForSelector(".figure-request input");
if (request) await page.type(".figure-request input", request);
await page.screenshot({ path: join(outDir, "2-composer.png") as `${string}.png` });
const started = Date.now();
await page.click(".figure-request button[type=submit]");
await page.waitForSelector(".scene-demo .demo-pending, .scene-demo .scene", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: join(outDir, "3-drawing.png") as `${string}.png` });
await page.waitForSelector(".scene-demo .scene .sc-svg", { timeout: 180000 });
console.log(`figure ready in ${((Date.now() - started) / 1000).toFixed(1)} s`);
await new Promise((r) => setTimeout(r, 2500));
// skip a predict-first question if there is one, so the figure plays
const skip = await page.$(".sc-predict .sc-link");
if (skip) {
  await page.screenshot({ path: join(outDir, "4-predict.png") as `${string}.png` });
  await skip.click();
  await new Promise((r) => setTimeout(r, 2500));
}
await page.screenshot({ path: join(outDir, "5-figure.png") as `${string}.png` });
console.log("title:", await page.$eval(".scene-demo .sc-corner[data-corner=title]", (e) => e.textContent));
if (errors.length) console.log("errors:", errors);
await browser.close();
