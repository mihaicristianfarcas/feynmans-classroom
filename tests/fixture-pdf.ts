// Prints a reflowable book from the running app into a PDF with no bookmarks (for testing chapter detection).
//   npx tsx tests/fixture-pdf.ts <bookId> <out.pdf>
import puppeteer from "puppeteer-core";
import { chromePath } from "../server/config.ts";
const [bookId, out] = process.argv.slice(2);
const blocks = (await (await fetch(`http://127.0.0.1:${process.env.PORT || 8787}/api/books/${bookId}/blocks`)).json()) as { tag: string; html: string }[];
const body = blocks.map((b) => `<${/^h[1-6]$/.test(b.tag) ? b.tag : "p"}>${b.html.replace(/<img[^>]*>/g, "")}</${/^h[1-6]$/.test(b.tag) ? b.tag : "p"}>`).join("\n");
const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{font:11pt Georgia,serif;margin:0}h1,h2{font-size:17pt;break-before:page;margin-top:0}h3{font-size:13pt}</style>${body}`);
await page.pdf({ path: out, format: "A5", margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" }, outline: false });
await browser.close();
console.log("wrote", out);
