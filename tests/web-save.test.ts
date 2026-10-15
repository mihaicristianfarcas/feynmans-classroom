// Saving links: the fetcher's guard against this machine's network, posts and videos turned away,
// arXiv pages sent to the paper, finding the article in a page (lazy pictures, the excerpt, too little
// text), saving a page from a local test server as an article with its pictures and cover, a PDF link
// handed to the book importer, and the routes that save a link, rename a book and move it to a topic.

import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-web-"));
process.env.DATA_DIR = dir;

let F: typeof import("../server/ingest/fetch.ts");
let W: typeof import("../server/ingest/web.ts");
let store: typeof import("../server/books/store.ts");
let app: ReturnType<typeof import("../server/app.ts").createApp>;

// a 1×1 PNG, padded past the size under which a picture is taken for a tracking pixel
const PNG = Buffer.concat([
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
  Buffer.alloc(400),
]);
const para = (n: number) =>
  `<p>Paragraph ${n} explains how a falling body gains speed at a steady rate, and why the distance it covers grows with the square of the time it has been falling for, which Galileo measured with balls on a ramp.</p>`;
const ARTICLE = `<!doctype html><html><head><title>Falling Bodies | Test Site</title>
<meta property="og:title" content="Falling Bodies"><meta property="og:site_name" content="Test Site">
<meta property="og:image" content="/lead.png"><meta property="article:published_time" content="2024-03-05T10:00:00Z">
</head><body><nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article><h1>Falling Bodies</h1><p class="byline">By Ada Example</p>
${[1, 2, 3].map(para).join("")}
<h2>The ramp</h2>${[4, 5].map(para).join("")}
<figure><img src="data:image/gif;base64,R0lGOD" data-src="/pic.png" alt="A ramp"><figcaption>The ramp</figcaption></figure>
<h2>The square law</h2>${[6, 7].map(para).join("")}
<script>alert(1)</script></article><footer>Subscribe to our newsletter</footer></body></html>`;

let server: Server;
let base = "";

beforeAll(async () => {
  F = await import("../server/ingest/fetch.ts");
  W = await import("../server/ingest/web.ts");
  store = await import("../server/books/store.ts");
  const V = await import("../server/vault/index.ts");
  V.initVault();
  app = (await import("../server/app.ts")).createApp();
  server = createServer((req, res) => {
    if (req.url === "/article") res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(ARTICLE);
    else if (req.url === "/moved") res.writeHead(302, { location: "/article" }).end();
    else if (req.url === "/lead.png" || req.url === "/pic.png")
      res.writeHead(200, { "content-type": "image/png" }).end(PNG);
    else if (req.url === "/short")
      res.writeHead(200, { "content-type": "text/html" }).end("<html><body><p>Sign in to read.</p></body></html>");
    else if (req.url === "/paper")
      res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF-1.4\nnot really");
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("the fetcher's guard", () => {
  it("knows the addresses of this machine and its networks", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.10",
      "172.20.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "224.0.0.1",
    ])
      expect(F.isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700::1111", "172.32.0.1"])
      expect(F.isPrivateAddress(ip), ip).toBe(false);
  });
  it("refuses links to this machine, other schemes and logins", () => {
    for (const link of [
      "http://localhost:8787/api/books",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://10.0.0.1/x",
      "http://router/",
      "http://printer.local/",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "https://user:pw@example.com/",
    ])
      expect(() => F.checkUrl(link), link).toThrow(F.FetchError);
    expect(F.checkUrl("example.com/a").toString()).toBe("https://example.com/a");
  });
  it("won't follow a fetch to this machine", async () => {
    await expect(F.fetchUrl(`${base}/article`)).rejects.toThrow(/your own network/);
  });
});

describe("what a link is", () => {
  it("turns away posts and videos, and sends arXiv pages to the paper", () => {
    expect(W.notAnArticle(new URL("https://x.com/someone/status/1"))).toMatch(/post/);
    expect(W.notAnArticle(new URL("https://www.youtube.com/watch?v=1"))).toMatch(/video/);
    expect(W.notAnArticle(new URL("https://example.com/essay"))).toBeNull();
    expect(W.arxivPdf(new URL("https://arxiv.org/abs/2401.01234v2"))).toBe("https://arxiv.org/pdf/2401.01234v2");
    expect(W.arxivPdf(new URL("https://example.com/abs/1"))).toBeNull();
  });
  it("reads a page in the character set it names", () => {
    const latin = Buffer.from('<meta charset="iso-8859-1"><p>caf\xe9</p>', "latin1");
    expect(W.decodePage(latin, "text/html")).toContain("café");
  });
});

describe("readPage", () => {
  it("finds the article, its pictures, its author, site and date", () => {
    const page = W.readPage(ARTICLE, "https://test.example/article");
    expect(page.title).toBe("Falling Bodies");
    expect(page.site).toBe("Test Site");
    expect(page.published).toContain("2024-03-05");
    expect(page.lead).toBe("https://test.example/lead.png");
    expect(page.pictures).toContain("https://test.example/pic.png");
    expect(page.content).not.toContain("alert(1)");
    expect(page.content).not.toContain("newsletter");
    expect(page.words).toBeGreaterThan(200);
  });
  it("takes the site's name off a title and dates and credits off a byline", () => {
    expect(W.withoutSite("What Is Entropy? | Quanta Magazine", "Quanta Magazine")).toBe("What Is Entropy?");
    expect(W.withoutSite("Mind the gap - The Economist", "The Economist")).toBe("Mind the gap");
    expect(W.withoutSite("Cats - a history", "Pets Weekly")).toBe("Cats - a history");
    expect(W.cleanByline("By Zack Savitsky December 13, 2024")).toBe("Zack Savitsky");
    expect(W.cleanByline("Ada Example, 5 Mar 2024")).toBe("Ada Example");
    expect(W.cleanByline("Contributors to Wikimedia projects")).toBeUndefined();
  });
  it("says so when a page has no article", () => {
    expect(() => W.readPage("<html><body><p>Sign in to read.</p></body></html>", "https://test.example/")).toThrow(
      /Couldn’t find an article/,
    );
  });
});

describe("saveLink", () => {
  const local = { allowPrivate: true };
  const noPdf = async () => {
    throw new Error("not a PDF");
  };
  it("saves a page as an article, with its pictures and cover kept in its folder", async () => {
    const book = await W.saveLink(`${base}/moved`, noPdf, local);
    expect(book.status).toBe("ready");
    expect(book.format).toBe("web");
    expect(book.title).toBe("Falling Bodies");
    expect(book.source?.url).toBe(`${base}/moved`);
    expect(book.words).toBeGreaterThan(200);
    expect(book.toc.map((c) => c.title)).toEqual(["The ramp", "The square law"]);
    expect(book.toc[0].start.block).toBe(0);
    expect(book.cover).toMatch(/^assets\//);
    const folder = store.bookDir(book.id);
    expect(existsSync(join(folder, book.cover!))).toBe(true);
    const blocks = store.getBlocks(book.id);
    expect(blocks[0]).toMatchObject({ tag: "h1", text: "Falling Bodies" });
    const picture = blocks.find((b) => b.html.includes("<img"));
    expect(picture?.html).toMatch(new RegExp(`/api/books/${book.id}/assets/picture-1\\.png`));
    expect(readFileSync(join(folder, "article.html"), "utf8")).not.toContain("<script");
  });
  it("hands a PDF behind a link to the book importer and remembers the link", async () => {
    const pdfs: string[] = [];
    const book = await W.saveLink(
      `${base}/paper`,
      async ({ name }) => {
        pdfs.push(name);
        const b = {
          id: store.newId("b"),
          title: "Paper",
          format: "pdf",
          file: "source.pdf",
          toc: [],
          createdAt: new Date().toISOString(),
          status: "ready",
        } as const;
        store.saveBook({ ...b, toc: [] });
        return store.getBook(b.id)!;
      },
      local,
    );
    expect(pdfs).toEqual(["paper.pdf"]);
    expect(store.getBook(book.id)?.source?.url).toBe(`${base}/paper`);
  });
  it("says what went wrong with a page that has no article", async () => {
    await expect(W.saveLink(`${base}/short`, noPdf, local)).rejects.toThrow(/Couldn’t find an article/);
  });
});

describe("the book routes", () => {
  const send = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`http://localhost${path}`, {
      method,
      headers: { host: "localhost", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
  it("refuses to save a link to this machine", async () => {
    const { status, json } = await send("POST", "/api/books/link", { url: `${base}/article` });
    expect(status).toBe(400);
    expect(json.error).toMatch(/your own network/);
  });
  it("renames a book and moves it to another topic", async () => {
    const book = store.listBooks().find((b) => b.format === "web")!;
    const { json } = await send("PATCH", `/api/books/${book.id}`, { title: "Galileo’s Ramp", topic: "physics" });
    expect(json).toMatchObject({ title: "Galileo’s Ramp", topic: "physics" });
    expect((await send("PATCH", `/api/books/${book.id}`, { topic: "astrology" })).status).toBe(400);
    expect((await send("PATCH", `/api/books/${book.id}`, { title: "  " })).status).toBe(400);
  });
});
