// End-to-end check of the app (npm run dev) with at least one book that has two or more figures (made
// from passages, or the chapter's own).
// It never calls a model unless --generate is passed. It makes one highlight (and deletes it again).
//   npm run test:e2e -- [--book <id>] [--generate]     (APP_URL=http://localhost:5183/ to check a test server)
import puppeteer, { type Frame, type Page } from "puppeteer-core";
import { chromePath } from "../../server/config.ts";

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

const pos = (loc: { page?: number; y?: number; block?: number }) =>
  loc.page !== undefined ? loc.page + (loc.y ?? 0) : (loc.block ?? 0) + (loc.y ?? 0);
const books = (await (await fetch(`${BASE}api/books`)).json()) as { id: string; title: string; format: string }[];
let bookId = arg("book");
type Place = { page?: number; y?: number; block?: number };
let figures: { id: string; anchor: Place; handbuilt: boolean }[] = [];
for (const book of bookId ? books.filter((b) => b.id === bookId) : books) {
  const demos = (await (await fetch(`${BASE}api/books/${book.id}/demos`)).json()) as {
    id: string;
    status: string;
    type?: string;
    anchor: Place;
  }[];
  const notes = (await (await fetch(`${BASE}api/books/${book.id}/annotations`)).json()) as {
    id: string;
    type: string;
    status: string;
    source: Place;
  }[];
  const list = [
    ...demos
      .filter((d) => d.status === "ready")
      .map((d) => ({ id: d.id, anchor: d.anchor, handbuilt: d.type !== "scene" })),
    ...notes
      .filter((a) => a.type === "visualize" && a.status === "ready")
      .map((a) => ({ id: a.id, anchor: a.source, handbuilt: false })),
  ];
  if (list.length >= 2) {
    bookId = book.id;
    figures = list.sort((a, b) => pos(a.anchor) - pos(b.anchor));
    break;
  }
}
if (!bookId || figures.length < 2) {
  console.log("Need a book with at least two figures. Make some first (select a passage, then Visualize).");
  process.exit(1);
}
const [first, second] = figures;

const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const pageErrors: string[] = [];
page.on("pageerror", (e) => pageErrors.push((e as Error).message));

/** The margin card lined up with its passage (the one chosen), by its label. */
const focusedCard = (p: Page) =>
  p.evaluate(() => {
    const slot = document.querySelector<HTMLElement>(".margin-slot[data-focused]");
    return slot?.querySelector(".mcard")?.getAttribute("aria-label") || "";
  });
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

  // open the reader at the first figure: the margin first, then the Figures index
  await page.goto(`${BASE}#/book/${bookId}?at=${(pos(first.anchor) + 0.03).toFixed(3)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".margin", { timeout: 20000 });
  check(
    "the reader opens on the margin",
    !!(await page.$(".pane-tab[aria-selected=true]")) &&
      (await page.$eval(".pane-tab[aria-selected=true]", (e) => e.textContent || "")).startsWith("Margin"),
  );
  check(
    "there is no reading-line mark and no line from a card to its passage",
    !(await page.$(".reading-line, .leader")),
  );
  await wait(1500);
  check(
    "margin cards are shown whole (none folded, none scrolling inside)",
    await page.evaluate(
      () =>
        !document.querySelector(".mcard.collapsed") &&
        [...document.querySelectorAll<HTMLElement>(".mcard.open")].every((c) => c.scrollHeight <= c.clientHeight + 1),
    ),
  );
  await clickTab(page, "Figures");
  await page.waitForSelector(".figure-rows .figure-row", { timeout: 10000 }).catch(() => null);
  await page.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement>(".figures-head button")]
      .find((b) => b.textContent === "Book")
      ?.click(),
  );
  await wait(300);
  const rows = await page.$$eval(".figure-rows .figure-row", (els) => els.length);
  check("the Figures tab lists the book's figures", rows >= 2, `${rows} listed`);
  check("and offers to make none", !(await page.$(".chapter-card, .generate-row")));
  await page.click(".figure-rows .figure-row");
  await wait(1500);
  const chosen = await focusedCard(page);
  check(
    "choosing a figure goes to its passage and lines its card up in the margin",
    (await page.$eval(".pane-tab[aria-selected=true]", (e) => e.textContent || "")).startsWith("Margin") && !!chosen,
    chosen,
  );

  // ] steps to the next figure
  await page.keyboard.press("]");
  await wait(1500);
  const next = await focusedCard(page);
  check("] goes to the next figure", !!next && next !== chosen, `${chosen} → ${next}`);
  const at = await page.evaluate(() => (window as unknown as { __classroom?: { pos: number } }).__classroom?.pos ?? 0);
  check("the reading position follows", Math.abs(at - pos(second.anchor)) < 1.5, `${at.toFixed(2)}`);

  // a figure opened large, and a hand-built one in its sandboxed frame
  await clickTab(page, "Figures");
  await wait(300);
  const handbuilt = figures.some((f) => f.handbuilt);
  await page.evaluate((hand) => {
    const rows = [...document.querySelectorAll(".figure-rows li")];
    const row = (hand && rows.find((li) => li.querySelector(".figure-still[data-kind='handbuilt']"))) || rows[0];
    row?.querySelector<HTMLButtonElement>(".icon-button")?.click();
  }, handbuilt);
  await page.waitForSelector(".modal .lightbox", { timeout: 5000 }).catch(() => null);
  check(
    "a figure opens large",
    !!(await page.$(".modal .lightbox .scene, .modal .lightbox iframe, .modal .lightbox .manim")),
  );
  if (handbuilt) {
    const frame = await demoFrame(page);
    check("the hand-built demo loads in its iframe", !!frame);
    if (frame) {
      const origin = await frame.evaluate(() => String(window.origin));
      check("the demo runs in an opaque (sandboxed) origin", origin === "null", origin);
    }
  }
  await page.keyboard.press("Escape");
  await wait(300);
  check("Escape closes it", !(await page.$(".modal .lightbox")));

  // find in the book: every place listed by chapter; choosing one goes there
  await page.keyboard.press("/");
  await page.waitForSelector(".find-bar input", { timeout: 5000 }).catch(() => null);
  await page.keyboard.type("the");
  await page.waitForSelector(".find-list .find-hit", { timeout: 10000 }).catch(() => null);
  const listed = await page.$$eval(".find-list .find-hit", (els) => els.length);
  check("find lists every place the phrase occurs", listed > 3, `${listed} listed`);
  const pick = await page.evaluate(() => {
    const hit = document.querySelectorAll<HTMLButtonElement>(".find-list .find-hit")[3];
    hit?.click();
    return hit?.querySelector(".find-at")?.textContent || "";
  });
  await wait(1200);
  const count = await page.$eval(".find-count", (e) => e.textContent || "");
  const now = await page.evaluate(() => (window as unknown as { __classroom?: { pos: number } }).__classroom?.pos ?? 0);
  const page4 = Number(/^p\. (\d+)/.exec(pick)?.[1]);
  check(
    "choosing one goes there",
    count.startsWith("4 of") && (Number.isNaN(page4) || Math.floor(now) === page4),
    `${pick}, now at ${now.toFixed(2)}`,
  );
  await page.keyboard.press("Escape");
  await wait(300);
  check("Escape closes find", !(await page.$(".find-bar")));

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
      type: string;
      path: string;
    }[];
    const made = after.find((a) => !before.includes(a.id));
    check(
      "Highlight saves an annotation file beside the book",
      !!made && made.type === "highlight" && /^library\/[^/]+\/annotations\//.test(made.path),
      made?.path,
    );
    check(
      "the highlight is marked in the book",
      (await page.$$(".page-marks .mark[data-style=fill], .html-reader")).length > 0,
    );
    if (made) await fetch(`${BASE}api/docs/${made.id}`, { method: "DELETE" });
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
  const tree = (await (await fetch(`${BASE}api/vault/tree`)).json()) as { notes: { id: string; type: string }[] };
  // a quiz opens to be read (that's where it plays), so take a plain note
  const plain = tree.notes.find((n) => n.type === "note");
  if (plain) {
    await page.goto(`${BASE}#/notes/${plain.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".note-editor .cm-content", { timeout: 10000 });
    check("a note opens in the editor with its links beside it", !!(await page.$(".note-side")));
  }
  await page.goto(`${BASE}#/brain`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".graph, .empty-state", { timeout: 10000 });
  check("the brain's graph loads", !!(await page.$(".graph, .empty-state")));
  const item = await page.$("[data-node] .g-shape");
  if (item) {
    await item.click();
    await page.waitForSelector(".node-card", { timeout: 5000 }).catch(() => null);
    check("clicking an item in the graph opens its card", !!(await page.$(".node-card h2")));
  }
  await page.goto(`${BASE}#/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".topnav-tools .agent-button", { timeout: 10000 });
  await page.click(".topnav-tools .agent-button");
  await page.waitForSelector(".agent-panel textarea", { timeout: 5000 }).catch(() => null);
  check("the agent opens from the top bar, ready for a request", !!(await page.$(".agent-panel textarea")));

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
