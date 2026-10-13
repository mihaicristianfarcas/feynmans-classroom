// Drives the margin like a reader: select a passage in a PDF, Explain it, ask a follow-up, highlight
// another, add one to the note; screenshots each step.
//   npx tsx tests/margin-flow.ts <bookId> <page> <out-dir>      (the app must be running; uses the model)
//   APP_URL=http://localhost:5180/ to point at another instance
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { chromePath } from "../server/config.ts";

const [bookId, pageNo = "20", outDir = "shots/margin", only = ""] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const base = process.env.APP_URL || "http://localhost:5173/";
const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror ${(e as Error).message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console ${m.text()}`));
const shot = (name: string) => page.screenshot({ path: join(outDir, `${name}.png`) as `${string}.png` });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${base}#/book/${bookId}?at=${Number(pageNo) + 0.15}`, { waitUntil: "domcontentloaded" });
const layer = `.textLayer[data-page-number="${pageNo}"]`;
await page.waitForFunction((sel) => (document.querySelector(sel)?.querySelectorAll("span").length || 0) > 10, { timeout: 30000 }, layer);
await wait(1200);

/** Selects spans [from, to) of the page's text layer and lets the reader see the mouseup. */
async function select(p: Page, from: number, to: number) {
  // scroll first and let the page settle: re-rendering the text layer would drop a selection
  await p.evaluate((sel, a) => [...document.querySelector(sel)!.querySelectorAll("span")].filter((s) => (s.textContent || "").trim().length > 0)[a].scrollIntoView({ block: "center" }), layer, from);
  await wait(900);
  const box = await p.evaluate(
    (sel, a, b) => {
      const spans = [...document.querySelector(sel)!.querySelectorAll("span")].filter((s) => (s.textContent || "").trim().length > 0);
      const first = spans[a];
      const last = spans[Math.min(b, spans.length) - 1];
      const range = document.createRange();
      range.setStart(first.firstChild!, 0);
      range.setEnd(last.firstChild!, (last.firstChild as Text).length);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      const r = range.getBoundingClientRect();
      return { text: s.toString().slice(0, 120), x: r.left, y: r.top };
    },
    layer,
    from,
    to,
  );
  await p.waitForSelector(".sel-menu", { timeout: 5000 });
  return box;
}

const sel1 = await select(page, 4, 9);
console.log("selected:", JSON.stringify(sel1.text));
await shot("1-menu");
console.log("menu:", await page.$$eval(".sel-row .sel-btn", (els) => els.map((e) => e.textContent?.trim()).join(" | ")));

if (!only || only === "explain") {
  const started = Date.now();
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".sel-btn")].find((b) => b.textContent?.trim() === "Explain")!.click());
  await page.waitForSelector(".mcard.open", { timeout: 10000 });
  await wait(600);
  await shot("2-explaining");
  await page.waitForFunction(() => document.querySelector(".mcard.open")?.getAttribute("data-status") !== "pending", { timeout: 180000 });
  console.log(`explanation in ${((Date.now() - started) / 1000).toFixed(1)} s, status ${await page.$eval(".mcard.open", (e) => e.getAttribute("data-status"))}`);
  await wait(800);
  await shot("3-explained");
  console.log("card:", (await page.$eval(".mcard.open .mcard-body", (e) => e.textContent || "")).slice(0, 300));
  console.log("leader visible:", await page.$eval(".leader path", (e) => getComputedStyle(e).opacity));
  console.log("marks on page:", await page.$$eval(`.page-marks .mark`, (els) => els.length));

  // a follow-up question
  await page.type(".mcard-ask input", "Can you give a numeric example?");
  const asked = Date.now();
  await page.click(".mcard-send");
  await page.waitForFunction(() => /Follow-up/.test(document.querySelector(".mcard.open .mcard-body")?.textContent || "") || document.querySelectorAll(".mcard.open h2").length > 0, { timeout: 180000 });
  console.log(`follow-up in ${((Date.now() - asked) / 1000).toFixed(1)} s`);
  await wait(800);
  await shot("4-follow-up");
}

// a highlight, then a passage into the note
await page.evaluate(() => document.querySelector<HTMLElement>(".margin")?.click());
const sel2 = await select(page, 14, 18);
await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".sel-btn")].find((b) => b.textContent?.trim() === "Highlight")!.click());
await wait(1200);
console.log("highlighted:", JSON.stringify(sel2.text.slice(0, 60)), "marks:", await page.$$eval(`.page-marks .mark[data-style="fill"]`, (els) => els.length));
await shot("5-highlight");
await select(page, 20, 24);
await page.keyboard.press("n");
await page.waitForSelector(".toast", { timeout: 15000 });
console.log("toast:", await page.$eval(".toast", (e) => e.textContent));
await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".pane-tab")].find((b) => b.textContent?.startsWith("Note"))!.click());
await page.waitForSelector(".reader-note .cm-content", { timeout: 10000 });
await wait(800);
await shot("6-note");
console.log("note text:", (await page.$eval(".reader-note .cm-content", (e) => e.textContent || "")).slice(0, 240));
if (errors.length) console.log("errors:", errors);
await browser.close();
