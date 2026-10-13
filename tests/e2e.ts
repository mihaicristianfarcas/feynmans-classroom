// End-to-end check of the app (npm run dev) with at least one book that has two or more ready demos.
// It never calls a model unless --generate is passed. It makes one highlight (and deletes it again).
//   npx tsx tests/e2e.ts [--book <id>] [--generate]
import puppeteer, { type Frame, type Page } from "puppeteer-core";
import { chromePath } from "../server/config.ts";

const BASE = process.env.APP_URL || "http://localhost:5173/";
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const books = (await (await fetch(`${BASE}api/books`)).json()) as { id: string; title: string; format: string }[];
let bookId = arg("book");
let demos: { id: string; status: string; fig: string; anchor: { page?: number; y?: number; block?: number } }[] = [];
for (const book of bookId ? books.filter((b) => b.id === bookId) : books) {
  const list = (await (await fetch(`${BASE}api/books/${book.id}/demos`)).json()) as typeof demos;
  if (list.filter((d) => d.status === "ready").length >= 2) {
    bookId = book.id;
    demos = list.filter((d) => d.status === "ready");
    break;
  }
}
if (!bookId || demos.length < 2) {
  console.log("Need a book with at least two ready demos. Generate some first.");
  process.exit(1);
}
const pos = (loc: { page?: number; y?: number; block?: number }) =>
  loc.page !== undefined ? loc.page + (loc.y ?? 0) : (loc.block ?? 0) + (loc.y ?? 0);
const [first, second] = demos;

const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push((e as Error).message));

const active = (p: Page) =>
  p.evaluate(
    () =>
      document.querySelector(".anchor[data-active]")?.getAttribute("title") ||
      document.querySelector(".demo-count")?.textContent ||
      "",
  );
const demoFrame = async (p: Page): Promise<Frame | null> => {
  for (let i = 0; i < 40; i++) {
    const frame = p.frames().find((f) => f.url().includes("/demos/") && f.url().includes("/page"));
    if (frame) return frame;
    await wait(250);
  }
  return null;
};

async function clickTab(p: Page, name: string) {
  for (const b of await p.$$(".pane-tab"))
    if ((await b.evaluate((el) => el.textContent || "")).startsWith(name)) await b.click();
}
async function selectAll(p: Page) {
  await p.evaluate(() => {
    const host = document.querySelector(".textLayer, .html-book")!;
    const range = document.createRange();
    range.selectNodeContents(host);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await wait(300);
}

try {
  // library
  await page.goto(`${BASE}#/library`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".book-card", { timeout: 10000 });
  check("library lists books", (await page.$$(".book-card")).length >= 1);

  // open the reader just past the first demo's anchor: the margin first, then the chapter's figures
  await page.goto(`${BASE}#/book/${bookId}?at=${(pos(first.anchor) + 0.03).toFixed(3)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".margin", { timeout: 20000 });
  check(
    "the reader opens on the margin",
    !!(await page.$(".pane-tab[aria-pressed=true]")) &&
      (await page.$eval(".pane-tab[aria-pressed=true]", (e) => e.textContent || "")).startsWith("Margin"),
  );
  await clickTab(page, "Figures");
  await page.waitForSelector(".demo-frame", { timeout: 20000 });
  await wait(2500);
  check(
    "first demo is active when the reading line passes its anchor",
    (await active(page)).includes(first.fig),
    await active(page),
  );
  const frame = await demoFrame(page);
  check("the demo loads in its iframe", !!frame);
  if (frame) {
    // a predict-first question pauses the demo until it's answered or skipped
    const skipped = await frame.evaluate(() => {
      const skip = [...document.querySelectorAll<HTMLElement>("button, a")].find((el) =>
        /^skip$/i.test((el.textContent || "").trim()),
      );
      skip?.click();
      return !!skip;
    });
    if (skipped) await wait(1500);
    const state = await frame.evaluate(() => {
      const S = (window as unknown as { __classroom?: { frames: number; errors: unknown[] } }).__classroom;
      return { frames: S?.frames ?? 0, errors: S?.errors?.length ?? -1, origin: String(window.origin) };
    });
    check("the demo animates without errors", state.frames > 10 && state.errors === 0, JSON.stringify(state));
    check("the demo runs in an opaque (sandboxed) origin", state.origin === "null", state.origin);
  }

  // theme reaches the iframe (the app starts in the system's theme, so switch to the other one)
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click('button[aria-label="Switch theme"]');
  await wait(1200);
  const frame2 = await demoFrame(page);
  const theme = frame2 ? await frame2.evaluate(() => document.body.getAttribute("data-theme")) : null;
  check("the theme switch reaches the demo", !!theme && theme !== before, `${before} → ${theme}`);
  await page.click('button[aria-label="Switch theme"]');

  // ] steps to the next demo
  await page.keyboard.press("]");
  await wait(2500);
  check("] jumps to the next demo", (await active(page)).includes(second.fig), await active(page));

  // h holds it while scrolling back up
  await page.keyboard.press("h");
  await page.evaluate(() => (document.querySelector(".pdf-pages, .html-reader") as HTMLElement).scrollBy(0, -2500));
  await wait(1500);
  const heldEyebrow = await page.evaluate(() => document.querySelector(".held-tag") !== null);
  const countText = await page.evaluate(() => document.querySelector(".demo-count")?.textContent || "");
  check("h holds the demo while scrolling away", heldEyebrow && countText.includes(second.fig), countText);
  await page.keyboard.press("h");
  await wait(800);

  // selecting a passage offers "Visualize this"
  const selected = await page.evaluate(() => {
    const host = document.querySelector(".textLayer, .html-book");
    if (!host) return false;
    const range = document.createRange();
    range.selectNodeContents(host);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    return sel.toString().length;
  });
  await page.mouse.move(1000, 400);
  await page.mouse.down();
  await page.mouse.up();
  await page.evaluate(() => {
    const host = document.querySelector(".textLayer, .html-book")!;
    const range = document.createRange();
    range.selectNodeContents(host);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await wait(300);
  const labels = await page.$$eval(".sel-menu .sel-row .sel-btn", (els) =>
    els.map((e) => (e.textContent || "").trim()),
  );
  check(
    "selecting a passage opens the menu",
    ["Highlight", "Explain", "Visualize", "Ask", "Define", "Note"].every((l) => labels.includes(l)),
    `selected ${selected} chars: ${labels.join(" | ")}`,
  );
  if (await page.$(".sel-menu")) {
    // a highlight needs no model: it is marked on the page and kept as a file beside the book
    const before = ((await (await fetch(`${BASE}api/books/${bookId}/annotations`)).json()) as { id: string }[]).map(
      (a) => a.id,
    );
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>(".sel-btn")]
        .find((b) => b.textContent?.trim() === "Highlight")!
        .click(),
    );
    await wait(1200);
    const after = (await (await fetch(`${BASE}api/books/${bookId}/annotations`)).json()) as {
      id: string;
      kind: string;
      path: string;
    }[];
    const made = after.find((a) => !before.includes(a.id));
    check(
      "Highlight saves an annotation file beside the book",
      !!made && made.kind === "highlight" && /^library\/[^/]+\/annotations\//.test(made.path),
      made?.path,
    );
    check(
      "the highlight is marked in the book",
      (await page.$$(".page-marks .mark[data-style=fill], .html-reader")).length > 0,
    );
    if (made) await fetch(`${BASE}api/annotations/${made.id}`, { method: "DELETE" });
    await selectAll(page);
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>(".sel-btn")]
        .find((b) => b.textContent?.includes("Visualize"))!
        .click(),
    );
    await wait(200);
    check("Visualize opens the request composer", !!(await page.$(".sel-menu .figure-request input")));
    if (process.argv.includes("--generate")) {
      await page.type(".sel-menu .figure-request input", "the simplest picture of this idea");
      await page.click(".sel-menu .figure-request button[type=submit]");
      await page.waitForSelector(".mcard.open", { timeout: 15000 });
      const started = Date.now();
      await page.waitForSelector(".mcard.open .sc-svg", { timeout: 180000 });
      check("the figure is drawn in the margin", true, `${((Date.now() - started) / 1000).toFixed(1)} s`);
    }
  }
  for (const [tab, selector] of [
    ["Margin", ".margin"],
    ["Note", ".reader-note"],
    ["Tutor", ".tutor"],
    ["Study", ".study-tab"],
  ]) {
    await clickTab(page, tab);
    await wait(300);
    check(`the ${tab} tab opens`, !!(await page.$(selector)));
  }

  // notes, the graph, agents
  await page.goto(`${BASE}#/notes`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".file-tree .tree", { timeout: 10000 }).catch(() => null);
  check("the Notes page shows the vault's notes", !!(await page.$(".file-tree .tree")));
  const tree = (await (await fetch(`${BASE}api/vault/tree`)).json()) as { notes: { id: string }[] };
  if (tree.notes[0]) {
    await page.goto(`${BASE}#/notes/${tree.notes[0].id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".note-editor .cm-content", { timeout: 10000 });
    check("a note opens in the editor with its links beside it", !!(await page.$(".note-side")));
  }
  await page.goto(`${BASE}#/brain/graph`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".graph, .empty", { timeout: 10000 });
  check("the brain's graph loads", !!(await page.$(".graph, .empty")));
  await page.goto(`${BASE}#/ask?do=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".agent-form", { timeout: 10000 });
  check("agents can be given work on the vault", !!(await page.$(".agent-form textarea")));

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
