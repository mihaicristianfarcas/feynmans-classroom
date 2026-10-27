// Accessibility checks of the running app: axe-core's WCAG 2.2 A and AA rules on every page, in both
// themes (and the reader's states: its margin cards, the find bar, the figures and an animation, the
// tutor's sessions; the vault menu and the dialogs to make and delete a vault; the dialog to change a
// book's details), and the keyboard
// essentials (a skip link, focus that can always be seen, the ⌘K palette, the vault menu, a folder's
// menu and dialogs that keep focus and close with Escape, side panels resized and closed from their
// edge, the reader usable without a mouse).
//   npm run test:a11y                  checks APP_URL (default http://localhost:5173/, so npm run dev)
//   npm run test:a11y -- --serve       starts the built app (npm run build first) on a throwaway vault
//                                      seeded with a small book, and checks that (what CI does)
//   add --only <route-substring> to check fewer pages, --verbose to list every node that fails
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { chromePath } from "../../server/config.ts";
import { EXAMPLES } from "../../shared/scene/examples.ts";

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

/** A port nothing listens on (the system picks it), so no server left from another run can answer. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** Starts the production server on a fresh vault and gives it something to show. It runs in a process
 * group of its own (with the Chrome and jj it starts), which stopServer() ends whole. */
async function serve() {
  dataDir = mkdtempSync(join(tmpdir(), "classroom-a11y-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), DATA_DIR: dataDir, LLM_PROVIDER: "codex" },
    stdio: ["ignore", verbose ? "inherit" : "ignore", "pipe"],
    detached: true,
  });
  server = child;
  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr = (stderr + d).slice(-4000);
    if (verbose) process.stderr.write(d);
  });
  BASE = `http://127.0.0.1:${port}/`;
  for (let i = 0; ; i++) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`the server stopped before it was ready:\n${stderr}`);
    if (i === 60) throw new Error(`the server wasn't ready after 30 s:\n${stderr}`);
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
  // a second vault (not opened), so every page's bar shows the vault switch
  await json("api/vaults", "POST", { name: "Physics" });
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
  await seedMargin();
  await json("api/docs", "POST", {
    title: "Small quantities",
    body: "A [[Derivative]] compares two small quantities.",
    concepts: ["Derivative"],
  });
  await json("api/docs", "POST", { kind: "card", front: "What is dx?", back: "A little bit of x.", deck: "Calculus" });
  await json("api/docs", "POST", {
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

/** Writes what the reader shows beside the book, as files (no model needed): an explanation with a
 * follow-up, a figure and an animation on overlapping passages, and a session with the tutor. */
async function seedMargin() {
  let books: { id: string; status?: string }[] = [];
  for (let i = 0; i < 40 && books[0]?.status !== "ready"; i++) {
    books = await fetch(`${BASE}api/books`).then((r) => r.json());
    if (books[0]?.status !== "ready") await wait(250);
  }
  const b = books[0];
  const folder =
    dataDir && existsSync(join(dataDir, "vault", "library"))
      ? readdirSync(join(dataDir, "vault", "library")).find((f) => !f.includes("."))
      : undefined;
  if (!b || !folder || !dataDir) return;
  const lib = join(dataDir, "vault", "library", folder);
  const at = new Date().toISOString();
  const file = (rel: string, front: Record<string, unknown>, body: string) => {
    mkdirSync(join(lib, rel, ".."), { recursive: true });
    const yaml = Object.entries({ ...front, created: at, updated: at })
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n");
    writeFileSync(join(lib, rel), `---\n${yaml}\n---\n\n${body}\n`);
  };
  const quote = "small quantities of various degrees of smallness";
  const at2 = { book: b.id, block: 2, quote };
  file(
    "annotations/b2-explain-a11y.md",
    { id: "a11yexp1", kind: "annotation", type: "explain", source: at2 },
    [
      "Quantities can be small **to different degrees**: a small part of a small part is far smaller still.",
      "",
      "## Follow-up: Can you give an example?",
      "",
      "A minute is a small part of an hour; a second is a small part of a minute.",
    ].join("\n"),
  );
  const tangent = EXAMPLES.tangent as { title: string };
  file(
    "annotations/b2-visualize-a11y.md",
    { id: "a11yfig1", kind: "annotation", type: "visualize", title: tangent.title, source: at2 },
    `## ${tangent.title}\n\n\`\`\`figure\n${JSON.stringify(tangent)}\n\`\`\``,
  );
  file(
    "annotations/b5-visualize-a11y-anim.md",
    {
      id: "a11yani1",
      kind: "annotation",
      type: "visualize",
      title: "Smaller and smaller",
      source: { ...at2, block: 5 },
    },
    "## Smaller and smaller\n\nWatch each part shrink.\n\n```manim\nimport manimgx as m\n\nclass Shrink(m.Scene):\n    def construct(self) -> None:\n        self.play(m.Create(m.Square(color=INK)))\n```",
  );
  file(
    "sessions/2026-10-13 What is dx.md",
    { id: "a11yses1", kind: "session", title: "What is dx?", mode: "answer", source: { book: b.id } },
    "## You\n\nWhat is dx?\n\n## Tutor\n\nA little bit of x.",
  );
  await wait(1500);
}

/* ---------- pages ---------- */

async function routes(): Promise<string[]> {
  const get = (path: string) => fetch(BASE + path).then((r) => r.json());
  const books = (await get("api/books")) as { id: string }[];
  const notes = (await get("api/docs?kind=note")) as { id: string }[];
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

/** Resolves once what is fading or growing in has finished (its colours are only then its own). */
/** Resolves once focus is inside `selector` (at once if it already is): a menu takes focus just after
 * it is drawn, so its keys are tried only then. */
const focusInside = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      new Promise<boolean>((resolve) => {
        if (document.activeElement?.closest(sel)) return resolve(true);
        // (listeners passed inline: a function named in here would need tsx's __name, which pages lack)
        const done = new AbortController();
        document.addEventListener(
          "focusin",
          (e) => {
            if (!(e.target as Element | null)?.closest?.(sel)) return;
            done.abort();
            resolve(true);
          },
          { signal: done.signal },
        );
        // a deadline only so that a menu that never takes focus fails its check instead of hanging the run
        setTimeout(() => {
          done.abort();
          resolve(false);
        }, 5000);
      }),
    selector,
  );

const settled = (page: Page) =>
  page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)).then(() => {}));

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

  // the vault menu: Enter opens it on the open vault, the arrow keys move through it, and Escape closes it
  // with focus back on its button
  await open(page, "#/", "light");
  const vaultButton = await page.$(".vault-switch-button");
  if (vaultButton) {
    await vaultButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".vault-menu");
    await focusInside(page, ".vault-menu");
    const onOpen = await page.evaluate(() => document.activeElement?.getAttribute("aria-checked") === "true");
    check("the vault menu opens on the open vault", onOpen, await focused(page));
    await page.keyboard.press("ArrowDown");
    const moved = await page.evaluate(
      () =>
        !!document.activeElement?.closest(".vault-menu") &&
        document.activeElement?.getAttribute("aria-checked") !== "true",
    );
    check("the arrow keys move through the vault menu", moved, await focused(page));
    await page.keyboard.press("Escape");
    await page.waitForSelector(".vault-menu", { hidden: true });
    const back = await page.evaluate(() => !!document.activeElement?.classList.contains("vault-switch-button"));
    check("Escape closes the vault menu and focus returns to its button", back, await focused(page));
  }

  // a folder's menu in the notes, drawn only while open: Enter opens it on its first item, the arrow keys
  // move through it, and Escape closes it with focus back on its button
  await open(page, "#/notes", "light");
  const folderButton = await page.$('.tree-folder-menu button[aria-haspopup="menu"]');
  if (folderButton) {
    await folderButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('.tree-folder-menu [role="menu"]');
    await focusInside(page, '.tree-folder-menu [role="menu"]');
    const at = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.tree-folder-menu [role="menuitem"]')].indexOf(
          document.activeElement as Element,
        ),
      );
    const first = await at();
    await page.keyboard.press("ArrowDown");
    const second = await at();
    await page.keyboard.press("End");
    const last = await at();
    check(
      "the arrow keys move through a folder's menu",
      first === 0 && second === 1 && last > 1,
      `${first} → ${second} → ${last}: ${await focused(page)}`,
    );
    await page.keyboard.press("Escape");
    await page.waitForSelector('.tree-folder-menu [role="menu"]', { hidden: true });
    const home = await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup") === "menu");
    check("Escape closes a folder's menu and focus returns to its button", home, await focused(page));
  } else check("a folder's menu can be opened from the keyboard", false, "no folder in the notes' tree");

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
  // the item in the Tab order (each item is a button over its place in the drawing)
  const node = await page.evaluate(() => {
    const item = document.querySelector<HTMLElement>("[data-node][tabindex='0']");
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

  // a side panel's edge: the arrow keys resize it, Enter closes it and focus goes to its button, which opens it again
  await open(page, "#/notes", "light");
  const edge = await page.$(".notes-page > .panel-edge");
  if (edge) {
    const width = () => page.evaluate(() => document.querySelector(".file-tree")?.getBoundingClientRect().width ?? 0);
    const before = await width();
    await edge.focus();
    await page.keyboard.press("ArrowRight");
    check("the arrow keys resize a side panel from its edge", (await width()) > before, `${before} → ${await width()}`);
    await page.keyboard.press("Enter");
    await wait(200);
    const toggle = await page.evaluate(() => document.activeElement?.getAttribute("aria-expanded"));
    check(
      "Enter on the edge closes the panel and focus goes to its button",
      !(await page.$(".file-tree")) && toggle === "false",
      await focused(page),
    );
    await page.keyboard.press("Enter");
    await wait(200);
    check("its button opens it again at its default width", (await width()) === 260, `${await width()}`);
  } else check("the notes list has an edge to resize it", false);

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

/* ---------- the reader's states ---------- */

/** The reader with its margin cards, the find bar open, the figures listed and one opened large, the tutor
 * (its earlier sessions, and one opened). */
async function readerStates(page: Page, bookRoute: string, theme: "light" | "dark") {
  await open(page, bookRoute, theme);
  const tab = (name: string) =>
    page.evaluate(
      (n) =>
        [...document.querySelectorAll<HTMLElement>(".pane-tab")].find((b) => b.textContent?.startsWith(n))?.click(),
      name,
    );
  const ax = async (name: string, present: string) =>
    check(
      `axe: the reader's ${name} (${theme})`,
      !!(await page.$(present)) && (await axe(page)).length === 0,
      (await page.$(present)) ? describe(await axe(page)) : `${present} not found`,
    );
  await ax("margin cards", ".mcard.open .mcard-thread .msg");
  // the open card's menu, drawn only while open: the arrow keys move through it (once is enough)
  const cardMenu = theme === "light" ? await page.$('.mcard.open .mcard-icon[aria-label="More"]') : null;
  if (cardMenu) {
    await cardMenu.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('.mcard.open [role="menu"]');
    await focusInside(page, '.mcard.open [role="menu"]');
    const at = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.mcard.open [role="menuitem"]')].indexOf(document.activeElement as Element),
      );
    const first = await at();
    await page.keyboard.press("ArrowDown");
    const second = await at();
    check("the arrow keys move through a margin card's menu", first === 0 && second === 1, `${first} → ${second}`);
    await page.keyboard.press("Escape");
  }
  if (await page.$(".pdf-root")) {
    await page.keyboard.press("p");
    await wait(1200);
    await ax("pages strip", ".pdf-strip .pdf-thumb");
    await page.keyboard.press("p");
  }
  await page.keyboard.press("/");
  await page.waitForSelector(".find-bar input", { timeout: 5000 }).catch(() => null);
  await page.keyboard.type("small");
  await wait(900);
  await ax("find bar, with every place listed", ".find-bar .find-list .find-hit");
  await page.keyboard.press("Escape");
  await tab("Figures");
  await wait(400);
  await ax("figures", ".figure-rows .figure-row");
  await page.click('.figure-rows .icon-button[aria-label^="Open"]').catch(() => null);
  await wait(600);
  await ax("figure opened large", ".modal .lightbox");
  await page.keyboard.press("Escape");
  await tab("Tutor");
  await wait(500);
  await ax("tutor's sessions", ".session-list .session-item");
  // an earlier session, opened: the conversation, with Save as note and Make cards above it
  await page.click(".session-list .session-item").catch(() => null);
  await wait(500);
  await ax("tutor's session opened", ".tutor-bar .button + .button");
}

/* ---------- run ---------- */

/** Ends the server and everything it started (its process group): asked first, then made to. */
async function stopServer() {
  const child = server;
  server = null;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const gone = new Promise((resolve) => child.once("exit", resolve));
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, name);
    } catch {}
  };
  signal("SIGTERM");
  if (await Promise.race([gone.then(() => true), wait(5000).then(() => false)])) return;
  signal("SIGKILL");
  await gone;
}
async function cleanUp() {
  await stopServer();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = null;
}
// stopped from outside (Ctrl-C, a CI timeout): leave nothing running
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.on(signal, () => void cleanUp().finally(() => process.exit(130)));

let browser = null as Browser | null;
try {
  if (process.argv.includes("--serve")) await serve();
  browser = await puppeteer.launch({
    executablePath: chromePath()!,
    headless: true,
    protocolTimeout: 180000,
    // signals are handled above, so the server is stopped before this exits
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
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
  // the agent's panel, a note's versions and the Brain's legend and card, open, in both themes
  const quizNote = ((await fetch(`${BASE}api/docs?kind=note&type=quiz`).then((r) => r.json())) as { id: string }[])[0];
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
    await open(page, "#/brain", theme);
    await page.click('.graph-tools [aria-label="Legend"]');
    // a click on an item in view, where the canvas draws it (its button is over it)
    await page.waitForSelector(".graph[data-ready]");
    const item = await page.evaluate(() => {
      const room = document.querySelector(".graph")?.getBoundingClientRect();
      for (const b of document.querySelectorAll("[data-node]")) {
        const r = b.getBoundingClientRect();
        const x = r.x + r.width / 2,
          y = r.y + r.height / 2;
        if (room && x > room.left + 60 && x < room.right - 340 && y > room.top + 80 && y < room.bottom - 80)
          return { x, y };
      }
      return null;
    });
    if (item) await page.mouse.click(item.x, item.y);
    await wait(500);
    check(
      `axe: the Brain's legend and a card (${theme})`,
      !!(await page.$(".legend-card")) && !!(await page.$(".node-card-edge")) && (await axe(page)).length === 0,
      describe(await axe(page)),
    );
    await page.click('.graph-tools [aria-label="Legend"]');
    // the vault menu, and the dialogs to make and to delete a vault (when there is more than one)
    await open(page, "#/settings/vault", theme);
    if (await page.$(".vault-switch-button")) {
      // from the top of the page: what the sticky bar covers once it scrolls isn't a target
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.click(".vault-switch-button");
      await page.waitForSelector(".vault-menu");
      await settled(page);
      const inMenu = await axe(page);
      check(`axe: the vault menu (${theme})`, inMenu.length === 0, describe(inMenu));
      await page.keyboard.press("Escape");
      for (const [what, opener] of [
        ["making a vault", '[data-section="vault"] .button[aria-haspopup="dialog"]'],
        ["deleting a vault", '[data-section="vault"] .icon-button[aria-haspopup="dialog"]'],
      ]) {
        await page.click(opener);
        await page.waitForSelector(".modal");
        await page.evaluate(() => window.scrollTo(0, 0));
        await settled(page);
        const inDialog = await axe(page);
        check(`axe: the dialog for ${what} (${theme})`, inDialog.length === 0, describe(inDialog));
        await page.keyboard.press("Escape");
        await page.waitForSelector(".modal", { hidden: true });
      }
    }
    // the dialog to change a book's details, with its chapters' names shown
    await open(page, "#/library", theme);
    if (await page.$(".book-actions [aria-haspopup=dialog]")) {
      await page.hover(".book-card");
      await page.click(".book-actions [aria-haspopup=dialog]");
      await page.waitForSelector(".modal");
      if (await page.$(".book-chapters summary")) await page.click(".book-chapters summary");
      await settled(page);
      const inDialog = await axe(page);
      check(`axe: the dialog for a book's details (${theme})`, inDialog.length === 0, describe(inDialog));
      await page.keyboard.press("Escape");
      await page.waitForSelector(".modal", { hidden: true });
    }
  }
  const seededBook = list.find((r) => r.startsWith("#/book/"));
  if (seededBook && dataDir && (!arg("only") || "reader".includes(arg("only")!)))
    for (const theme of ["light", "dark"] as const) await readerStates(page, seededBook, theme);
  if (!arg("only"))
    await keyboard(
      page,
      list.find((r) => r.startsWith("#/book/")),
    );
  check("no page errors", errors.length === 0, [...new Set(errors)].join("\n"));
} finally {
  await browser?.close();
  await cleanUp();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
