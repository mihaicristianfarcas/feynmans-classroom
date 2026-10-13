// Screenshots of every reference figure in the gallery (npm run dev must be running).
//   npx tsx tests/browser/scene-shots.ts <out-dir> [--theme light|dark] [--only name,name] [--wait ms]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { chromePath } from "../../server/config.ts";

const [outDir = "shots"] = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
mkdirSync(outDir, { recursive: true });
const base = process.env.APP_URL || "http://localhost:5173/";
const theme = opt("theme", "light");
const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 1000, deviceScaleFactor: 2 });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror ${(e as Error).message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console ${m.text()}`));
await page.evaluateOnNewDocument((t) => localStorage.setItem("classroom-theme", t), theme);
const only = opt("only", "");
const dev = process.argv.includes("--dev");
const query = [only ? `only=${only}` : "", dev ? "dev=1" : ""].filter(Boolean).join("&");
await page.goto(`${base}#/gallery${query ? `?${query}` : ""}`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, Number(opt("wait", "2500"))));
const items = await page.$$(".gallery-item");
for (const item of items) {
  const name = await item.evaluate((el) => el.getAttribute("data-example"));
  await item.scrollIntoView();
  await new Promise((r) => setTimeout(r, 400));
  await item.screenshot({ path: join(outDir, `${name}-${theme}.png`) as `${string}.png` });
  console.log("shot", name);
}
const playerErrors = await page.evaluate(() =>
  ((window as unknown as { __players?: { errors: string[] }[] }).__players || []).flatMap((p) => p.errors),
);
if (playerErrors.length) console.log("player errors:", playerErrors);
if (errors.length) console.log("errors:", errors);
await browser.close();
