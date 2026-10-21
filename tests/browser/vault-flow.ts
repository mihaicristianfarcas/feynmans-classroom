// Regression checks on the a11y runner's throwaway app: open-note mutations, attachment names,
// app embeds, graph previews, and the reader editor's completion, navigation and pasted images.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer-core";
import { EXAMPLES } from "../../shared/scene/examples.ts";

type Check = (name: string, ok: boolean, detail?: string) => void;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MOD = process.platform === "darwin" ? "Meta" : "Control";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=";

export async function vaultFlow(page: Page, base: string, dataDir: string, bookRoute: string, check: Check) {
  const api = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${base}api/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${path}: ${await res.text()}`);
    return res.json() as Promise<T>;
  };
  const { id } = await api<{ id: string }>("vaults", { app: true, name: "Regression checks" });
  const route = (path: string) => `#/vaults/${id}/note/${encodeURIComponent(path)}`;
  const open = async (hash: string) => {
    await page.goto(`${base}${hash}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !document.querySelector(".loading-page"));
  };
  const clickText = async (selector: string, text: string) => {
    await page.waitForFunction(
      (selector, text) => [...document.querySelectorAll(selector)].some((el) => el.textContent?.trim() === text),
      {},
      selector,
      text,
    );
    await page.evaluate(
      (selector, text) =>
        [...document.querySelectorAll<HTMLElement>(selector)].find((el) => el.textContent?.trim() === text)!.click(),
      selector,
      text,
    );
  };
  const tree = () => api<{ files: { path: string }[] }>(`vaults/${id}/tree`);
  const note = (path: string) => api<{ text: string }>(`vaults/${id}/note?path=${encodeURIComponent(path)}`);
  const make = (title: string, body = "Base text.", bookId?: string) =>
    api(`vaults/${id}/notes`, { title, body, bookId });
  const edit = async (text: string) => {
    await page.waitForSelector(".cm-content");
    await page.click(".cm-content");
    await page.keyboard.down(MOD);
    await page.keyboard.press(process.platform === "darwin" ? "ArrowDown" : "End");
    await page.keyboard.up(MOD);
    await page.keyboard.type(text);
  };
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate((id) => {
      localStorage.setItem("notes-active-vault", id);
      localStorage.setItem("notes-mode", "edit");
    }, id);
    await make("Delete pending");
    await open(route("Delete pending.md"));
    await edit(" Pending deletion.");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.click('.note-tools [aria-label="Delete"]');
    await page.waitForFunction((id) => location.hash === `#/vaults/${id}`, {}, id);
    await wait(900);
    check(
      "deleting an open note cancels its autosave and cleanup save",
      !(await tree()).files.some((f) => f.path === "Delete pending.md"),
    );

    await make("Move pending");
    await open(route("Move pending.md"));
    await page.waitForSelector('[aria-label="Move pending: more"]');
    await edit(" Pending move.");
    await page.click('[aria-label="Move pending: more"]');
    page.once("dialog", (dialog) => void dialog.accept("Moved pending.md"));
    await clickText('[role="menuitem"]', "Rename or move…");
    await page.waitForFunction((hash) => location.hash === hash, {}, route("Moved pending.md"));
    await wait(900);
    check(
      "moving an open note flushes edits and leaves its old path absent",
      !(await tree()).files.some((f) => f.path === "Move pending.md") &&
        (await note("Moved pending.md")).text.includes("Pending move."),
    );

    await api(`vaults/${id}/attachments`, { data: `data:image/png;base64,${PNG}`, name: "photo.png" });
    writeFileSync(join(dataDir, "vaults", id, "LICENSE"), "An extensionless attachment.");
    await api(`vaults/${id}/rescan`, {});
    const rename = async (from: string, to: string) => {
      await open(route(from));
      await page.waitForFunction(
        (from) => document.querySelector<HTMLInputElement>(".note-title-input")?.value === from,
        {},
        from,
      );
      await page.focus(".note-title-input");
      await page.$eval(".note-title-input", (input) => (input as HTMLInputElement).select());
      await page.keyboard.type(to);
      await page.keyboard.press("Tab");
      await page
        .waitForFunction((hash) => location.hash === hash, { timeout: 5000 }, route(to))
        .catch(async () => {
          const input = await page
            .$eval(".note-title-input", (el) => (el as HTMLInputElement).value)
            .catch(() => "missing");
          throw new Error(
            `Rename ${from} to ${to}: route ${page.url()}, input ${input}, files ${JSON.stringify(await tree())}`,
          );
        });
    };
    await rename("photo.png", "diagram.png");
    await rename("LICENSE", "NOTICE");
    const names = (await tree()).files.map((f) => f.path);
    check(
      "attachment renames preserve the entered complete filename",
      names.includes("diagram.png") && !names.includes("diagram.png.png") && names.includes("NOTICE"),
    );

    const concept = await api<{ id: string }>("docs", {
      kind: "concept",
      title: "Regression concept",
      summary: "Concept embed works.",
    });
    const figure = await api<{ id: string }>("docs", {
      kind: "figure",
      title: "Regression figure",
      scene: EXAMPLES.tangent,
    });
    await make("App embeds", `![[figure:${figure.id}]]\n\n![[${concept.id}]]\n\n![[a11yexp1]]`);
    await page.evaluate(() => localStorage.setItem("notes-mode", "read"));
    await open(route("App embeds.md"));
    await page.waitForSelector(".note-read .scene");
    await page.waitForFunction(
      () =>
        document.querySelector(".note-read")?.textContent?.includes("Concept embed works.") &&
        document.querySelector(".note-read")?.textContent?.includes("Quantities can be small"),
    );
    check("vault Markdown renders app figures, concepts and annotations", !(await page.$(".note-read .missing")));

    await make("Target", "The original target.");
    await make("Preview", "[[Target]]\n\n![[diagram.png]]");
    await open(`#/brain?focus=${encodeURIComponent(`vnote:${id}:Preview.md`)}`);
    await page.waitForSelector(".node-card-md .vault-image");
    check(
      "graph previews load attachments from their originating vault",
      await page.$eval(".node-card-md img", (img) => img.getAttribute("src")?.includes("/api/vaults/") ?? false),
    );
    await clickText(".node-card-md a", "Target");
    await page.waitForFunction((hash) => location.hash === hash, {}, route("Target.md"));
    check(
      "graph preview links open the existing note",
      (await tree()).files.filter((f) => /^Target(?: \d+)?\.md$/.test(f.path)).length === 1,
    );

    const bookId = bookRoute.split("/").pop()!;
    await make("Reader regression", "[[Target]]\n", bookId);
    await page.evaluate(
      ({ id, bookId }) => localStorage.setItem(`notes-book-${bookId}@${id}`, `vault:${id}:Reader regression.md`),
      { id, bookId },
    );
    await open(bookRoute);
    await clickText('[role="tab"]', "Note");
    await edit("\n[[Tar");
    await page.waitForFunction(() =>
      document.querySelector(".cm-tooltip-autocomplete")?.textContent?.includes("Target"),
    );
    check("the reader completes links to vault notes", true);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.evaluate((png) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "reader-image.png", { type: "image/png" }));
      document
        .querySelector(".reader-note .cm-content")!
        .dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, PNG);
    await page.waitForFunction(() =>
      document.querySelector(".reader-note .cm-content")?.textContent?.includes("reader-image"),
    );
    await wait(850);
    await clickText(".reader-note-head button", "Read");
    await page.waitForSelector(".reader-note .vault-image");
    check(
      "the reader pastes images into the current vault and renders them",
      (await tree()).files.some((f) => f.path === "reader-image.png"),
    );
    await clickText(".reader-note-head button", "Edit");
    await page.waitForSelector(".reader-note .cm-wikilink");
    const spans = await page.$$(".reader-note .cm-wikilink");
    const target = (
      await Promise.all(
        spans.map(async (span) => ((await span.evaluate((el) => el.textContent?.includes("Target"))) ? span : null)),
      )
    ).find(Boolean)!;
    await page.keyboard.down(MOD);
    await target.click();
    await page.keyboard.up(MOD);
    await page.waitForFunction((hash) => location.hash === hash, {}, route("Target.md"));
    check(
      "modifier-clicking a reader link opens the existing vault note",
      (await tree()).files.filter((f) => /^Target(?: \d+)?\.md$/.test(f.path)).length === 1,
    );
  } finally {
    await fetch(`${base}api/vaults/${id}`, { method: "DELETE" });
  }
}
