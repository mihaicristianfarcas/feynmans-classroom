// Accessibility checks of the running app: axe-core's WCAG 2.2 A and AA rules on every page, in both
// themes, and the keyboard essentials (a skip link, focus that can always be seen, the ⌘K palette and
// dialogs that keep focus and close with Escape, the reader usable without a mouse).
//   npm run test:a11y                  checks APP_URL (default http://localhost:5173/, so npm run dev)
//   npm run test:a11y -- --serve       starts the built app (npm run build first) on a throwaway vault
//                                      seeded with a small book, and checks that (what CI does)
//   add --only <route-substring> to check fewer pages, --verbose to list every node that fails
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { chromePath } from "../../server/config.ts";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const verbose = process.argv.includes("--verbose");
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail.replace(/\n/g, "\n      ")}` : ""}`);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- the app to check ---------- */

let server = null as ChildProcess | null;
let dataDir = null as string | null;
let BASE = process.env.APP_URL || "http://localhost:5173/";

/** Starts the production server on a fresh vault and gives it something to show. */
async function serve() {
  dataDir = mkdtempSync(join(tmpdir(), "classroom-a11y-"));
  const port = 8800 + Math.floor(Math.random() * 100);
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), DATA_DIR: dataDir, LLM_PROVIDER: "codex" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr?.on("data", (d) => verbose && process.stderr.write(d));
  BASE = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 60; i++) {
    if (
      await fetch(`${BASE}api/status`).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await wait(500);
  }
  const json = (path: string, method: string, body: unknown) =>
    fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
      (r) => r.json(),
    );
  await json("api/profile", "PUT", { name: "Ada", goals: "Understand calculus", onboarded: true });
  const book = new FormData();
  book.append(
    "file",
    new Blob(
      [
        "# Calculus Made Easy\n\n## On different degrees of smallness\n\nWe shall find that in our processes of calculation we have to deal with small quantities of various degrees of smallness. ".repeat(
          3,
        ),
      ],
      { type: "text/markdown" },
    ),
    "calculus.md",
  );
  await fetch(`${BASE}api/books`, { method: "POST", body: book });
  await json("api/notes", "POST", {
    title: "Small quantities",
    body: "A [[Derivative]] compares two small quantities.",
    concepts: ["Derivative"],
  });
  await json("api/cards", "POST", { front: "What is dx?", back: "A little bit of x.", deck: "Calculus" });
  await json("api/notes", "POST", {
    title: "Smallness, check yourself",
    type: "quiz",
    folder: "Calculus/Quizzes",
    about: ["[[Calculus Made Easy]]"],
    body: [
      "```quiz",
      "title: Degrees of smallness",
      "questions:",
      "  - q: What is dx?",
      "    choices: [A large step, A little bit of x]",
      "    answer: 2",
      "    why: The d means a little bit of.",
      "```",
      "",
      "> [!exercise] Compare",
      "> Which is smaller, dx or dx²?",
      "",
      "> [!solution]-",
      "> dx², a small quantity of the second order.",
    ].join("\n"),
  });
}

/* ---------- pages ---------- */

async function routes(): Promise<string[]> {
  const get = (path: string) => fetch(BASE + path).then((r) => r.json());
  const books = (await get("api/books")) as { id: string }[];
  const notes = (await get("api/notes")) as { id: string }[];
  const concepts = (await get("api/concepts")) as { id: string }[];
  const list = [
    "#/",
    "#/library",
    "#/notes",
    "#/review",
    "#/library/figures",
    "#/brain",
    "#/journey",
    "#/settings",
    "#/welcome",
    "#/gallery",
  ];
  if (notes[0]) list.push(`#/notes/${notes[0].id}`);
  const quiz = (notes as { id: string; type?: string }[]).find((n) => n.type === "quiz");
  if (quiz && quiz.id !== notes[0]?.id) list.push(`#/notes/${quiz.id}`);
  if (concepts[0]) list.push(`#/brain/concept/${concepts[0].id}`);
  if (books[0]) list.push(`#/book/${books[0].id}`);
  const only = arg("only");
  return only ? list.filter((r) => r.includes(only)) : list;
}

async function open(page: Page, route: string, theme: "light" | "dark") {
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.evaluate((t) => localStorage.setItem("classroom-theme", t), theme);
  await page.reload({ waitUntil: "networkidle2" }).catch(() => {});
  await wait(route.startsWith("#/book/") ? 3000 : 1200);
}

interface AxeViolation {
  id: string;
  impact: string;
  help: string;
  nodes: { target: string[]; failureSummary: string }[];
}

async function axe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async () => {
    const w = window as unknown as {
      axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: AxeViolation[] }> };
    };
    const result = await w.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      // figures are drawn as SVG by the scene player; their text alternatives are checked separately
      exclude: [".sc-stage svg *"],
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
    }));
  });
}

const describe = (violations: AxeViolation[]) =>
  violations
    .map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help} (${v.nodes.length})${verbose ? `\n${v.nodes.map((n) => `  ${n.target.join(" ")}  ${n.failureSummary.split("\n").slice(1, 2).join("")}`).join("\n")}` : `  e.g. ${v.nodes[0]?.target.join(" ")}`}`,
    )
    .join("\n");

/* ---------- keyboard ---------- */

/** What has focus, in words. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40)}"`;
  });

/** Tabs through the page and returns elements that got focus without anything visible changing. */
async function invisibleFocus(page: Page, steps = 30): Promise<string[]> {
  const bad: string[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const shown = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return true;
      // a slider draws its ring on the thumb, which computed styles can't see
      if (el instanceof HTMLInputElement && el.type === "range") return true;
      const s = getComputedStyle(el);
      const ring = s.outlineStyle !== "none" && Number.parseFloat(s.outlineWidth) > 0;
      return ring || s.boxShadow !== "none";
    });
    if (!shown) bad.push(await focused(page));
  }
  return [...new Set(bad)];
}

async function keyboard(page: Page, bookRoute: string | undefined) {
  const mod = process.platform === "darwin" ? "Meta" : "Control";

  // the first Tab lands on a skip link that moves focus to the page's content
  await open(page, "#/library", "light");
  await page.keyboard.press("Tab");
  const first = await focused(page);
  check("the first Tab reaches a skip link", /skip/i.test(first), first);
  await page.keyboard.press("Enter");
  await wait(200);
  const after = await page.evaluate(() => !!document.activeElement?.closest("main"));
  check("the skip link moves focus into the page", after, await focused(page));

  // every focusable thing shows that it has focus
  for (const route of ["#/", "#/library", "#/review", "#/settings"]) {
    await open(page, route, "light");
    const bad = await invisibleFocus(page);
    check(`focus is always visible on ${route}`, bad.length === 0, bad.join("\n"));
  }

  // ⌘K opens the palette with focus in its field; Escape closes it and gives focus back
  await open(page, "#/library", "light");
  await page.keyboard.down(mod);
  await page.keyboard.press("k");
  await page.keyboard.up(mod);
  await wait(200);
  const inPalette = await page.evaluate(
    () => !!document.activeElement?.closest("[role=dialog]") && document.activeElement?.tagName === "INPUT",
  );
  check("⌘K opens the palette with focus in its field", inPalette, await focused(page));
  await page.keyboard.type("small");
  await wait(600);
  await page.keyboard.press("ArrowDown");
  const active = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("[role=dialog] input");
    const id = input?.getAttribute("aria-activedescendant");
    return id ? !!document.getElementById(id) : false;
  });
  check("arrow keys move through the palette's results", active);
  await page.keyboard.press("Escape");
  await wait(200);
  check("Escape closes the palette", !(await page.$("[role=dialog]")));

  // ⌘J opens the agent with focus in its field, from any page; Escape closes it and gives focus back
  await open(page, "#/library", "light");
  await page.keyboard.down(mod);
  await page.keyboard.press("j");
  await page.keyboard.up(mod);
  await wait(200);
  const inAgent = await page.evaluate(
    () => !!document.activeElement?.closest("[role=dialog]") && document.activeElement?.tagName === "TEXTAREA",
  );
  check("⌘J opens the agent with focus in its field", inAgent, await focused(page));
  await page.keyboard.press("Escape");
  await wait(200);
  check("Escape closes the agent", !(await page.$("[role=dialog]")));

  // a dialog keeps focus inside while open, and Escape returns focus to what opened it
  const concept = (await routes()).find((r) => r.startsWith("#/brain/concept/"));
  if (concept) await open(page, concept, "light");
  const opener = concept ? await page.$('main [aria-haspopup="dialog"]') : null;
  if (opener) {
    await opener.focus();
    await page.keyboard.press("Enter");
    await wait(300);
    const inside: boolean[] = [];
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      inside.push(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")));
    }
    check("Tab stays inside an open dialog", inside.every(Boolean));
    await page.keyboard.press("Escape");
    await wait(300);
    const back = await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup") === "dialog");
    check("Escape closes the dialog and focus returns to its opener", back, await focused(page));
  } else
    check("a dialog can be opened from the keyboard", false, "no [aria-haspopup=dialog] button on a concept's page");

  // the Brain's graph: arrow keys reach its items, Enter reads one in the card beside it (focus goes into the
  // card), and Escape closes the card and gives focus back to the item
  await open(page, "#/brain", "light");
  // an SVG item: focused from the page (puppeteer's focus() takes only HTML elements)
  const node = await page.evaluate(() => {
    const item = document.querySelector<SVGElement>("[data-node][tabindex='0']");
    item?.focus();
    return !!item;
  });
  if (node) {
    await page.keyboard.press("ArrowRight");
    const item = await page.evaluate(() => document.activeElement?.getAttribute("data-node"));
    await page.keyboard.press("Enter");
    await wait(400);
    const inCard = await page.evaluate(() => !!document.activeElement?.closest(".node-card"));
    check("Enter on a graph item opens its card with focus in it", inCard, await focused(page));
    await page.keyboard.press("Escape");
    await wait(400);
    const back = await page.evaluate(
      (id) => !document.querySelector(".node-card") && document.activeElement?.getAttribute("data-node") === id,
      item,
    );
    check("Escape closes the card and focus returns to the item", back, await focused(page));
  } else check("the graph's items can be reached with the keyboard", false, "no graph item in the Tab order");

  // the reader: its panes are tabs you can move between with the arrow keys
  if (bookRoute) {
    await open(page, bookRoute, "light");
    const tab = await page.$("[role=tablist] [role=tab][aria-selected=true]");
    check("the reader's panes are tabs", !!tab);
    if (tab) {
      await tab.focus();
      await page.keyboard.press("ArrowRight");
      await wait(200);
      const moved = await page.evaluate(
        () =>
          document.activeElement?.getAttribute("role") === "tab" &&
          document.activeElement.getAttribute("aria-selected") === "true",
      );
      check("arrow keys move between the reader's panes", moved, await focused(page));
    }
  }

  // a figure's draggable points move from the keyboard too: the up and down arrows pick one, Shift + arrows drag it
  // (with reduced motion, so the figures' idle tours can't move a slider for us)
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await open(page, "#/gallery", "light");
  const hasPoint = await page.evaluate(() => {
    const stage = document.querySelector(".sc-draggable")?.closest(".scene")?.querySelector<HTMLElement>(".sc-stage");
    stage?.focus();
    return !!stage;
  });
  if (hasPoint) {
    const inScene = <T>(fn: (scene: Element) => T) =>
      page.evaluate(`(${fn})(document.activeElement.closest(".scene"))`) as Promise<T>;
    for (let i = 0; i < 12; i++) {
      if (await inScene((s) => /Shift/.test(s.querySelector(".sc-info")?.textContent ?? ""))) break;
      await page.keyboard.press("ArrowDown");
      await wait(50);
    }
    const values = (s: Element) => [...s.querySelectorAll<HTMLInputElement>(".sc-range")].map((r) => r.value).join();
    const before = await inScene(values);
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.up("Shift");
    await wait(100);
    check("Shift + arrows drag a figure's point", before !== (await inScene(values)), before);
  } else check("a figure with a draggable point is in the gallery", false);
  await page.emulateMediaFeatures([]);
}

/* ---------- run ---------- */

if (process.argv.includes("--serve")) await serve();
const browser = await puppeteer.launch({ executablePath: chromePath()!, headless: true, protocolTimeout: 180000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push((e as Error).message));
  const list = await routes();
  for (const theme of ["light", "dark"] as const) {
    for (const route of list) {
      await open(page, route, theme);
      const violations = await axe(page);
      check(`axe: ${route} (${theme})`, violations.length === 0, describe(violations));
    }
  }
  // the agent's panel and a note's versions, open, in both themes
  const quizNote = ((await fetch(`${BASE}api/notes?type=quiz`).then((r) => r.json())) as { id: string }[])[0];
  const note = quizNote ? `#/notes/${quizNote.id}` : list.find((r) => r.startsWith("#/notes/"));
  for (const theme of ["light", "dark"] as const) {
    if (arg("only") && !"agent".includes(arg("only")!)) break;
    await open(page, "#/", theme);
    await page.click(".topnav-tools .agent-button");
    await wait(300);
    check(
      `axe: the agent's panel (${theme})`,
      !!(await page.$(".agent-panel")) && (await axe(page)).length === 0,
      describe(await axe(page)),
    );
    if (note) {
      await open(page, note, theme);
      await page.click('.note-tools [aria-label="Versions"]');
      await wait(600);
      check(
        `axe: a note's versions (${theme})`,
        !!(await page.$(".modal")) && (await axe(page)).length === 0,
        describe(await axe(page)),
      );
    }
  }
  if (!arg("only"))
    await keyboard(
      page,
      list.find((r) => r.startsWith("#/book/")),
    );
  check("no page errors", errors.length === 0, [...new Set(errors)].join("\n"));
} finally {
  await browser.close();
  server?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
