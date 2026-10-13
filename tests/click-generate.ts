// Opens a book in the app, and clicks "Visualize this chapter" for the chapter at the given position.
//   npx tsx tests/click-generate.ts <bookId> <at> [count]
import puppeteer from "puppeteer-core";
import { chromePath } from "../server/config.ts";
const [bookId, at, count = "3"] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${process.env.APP_URL || "http://localhost:5173/"}#/book/${bookId}?at=${at}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".chapter-card .button.primary", { timeout: 20000 });
await page.select(".count-select select", count);
await page.click(".chapter-card .button.primary");
await page.waitForSelector(".planning", { timeout: 15000 });
console.log("planning shown:", await page.$eval(".planning", (el) => el.textContent));
await browser.close();
