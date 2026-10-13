// Screenshots of the running app (npm run dev), for visual review.
//   npx tsx tests/ui-shots.ts <out.png> <hash-route> [--width 1440] [--height 900] [--theme light|dark] [--scroll px] [--wait ms]
import puppeteer from "puppeteer-core";
import { chromePath } from "../server/config.ts";

const [out, route = "#/"] = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const base = process.env.APP_URL || "http://localhost:5173/";
const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: Number(opt("width", "1440")), height: Number(opt("height", "900")), deviceScaleFactor: 1 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror ${(e as Error).message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console ${m.text()}`));
await page.evaluateOnNewDocument((theme) => {
  try {
    localStorage.setItem("classroom-theme", theme);
  } catch {}
}, opt("theme", "light"));
await page.goto(base + route, { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, Number(opt("wait", "3500"))));
const scroll = Number(opt("scroll", "0"));
if (scroll) {
  await page.evaluate((dy) => (document.querySelector(".pdf-pages, .html-reader") as HTMLElement | null)?.scrollBy(0, dy), scroll);
  await new Promise((r) => setTimeout(r, 2000));
}
await page.screenshot({ path: out as `${string}.png` });
const info = await page.evaluate(() => ({
  markers: [...document.querySelectorAll(".anchor")].map((a) => (a as HTMLElement).title + (a.hasAttribute("data-active") ? " *" : "")),
  eyebrow: document.querySelector(".demo-head .eyebrow, .chapter-card .eyebrow")?.textContent,
  where: document.querySelector(".page-label")?.textContent,
  frame: (document.querySelector(".demo-frame") as HTMLIFrameElement | null)?.src || null,
}));
console.log(JSON.stringify(info));
if (errors.length) console.log("errors:", errors);
await browser.close();
