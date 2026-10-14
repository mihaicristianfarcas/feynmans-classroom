/* Saving a link: a web page becomes an article in the library (Readability finds the article in the
 * page, our sanitizer turns it into blocks, its pictures are downloaded into its folder so it reads
 * offline), and a PDF behind a link (arXiv's abstract pages go to the paper) is added like an uploaded
 * one. Posts and videos are turned away with a pointer to what works. The page is material, never
 * trusted: nothing of it survives but sanitized blocks and pictures. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { createBookDir, newId, renameBookDir, saveBook } from "../books/store.ts";
import type { Block, Book, TocEntry } from "../books/types.ts";
import { writeJson } from "../fs.ts";
import { finishBlockToc, headingToc } from "./epub.ts";
import { FetchError, type FetchOptions, fetchUrl } from "./fetch.ts";
import { htmlToBlocks, textOfHtml } from "./html.ts";

/** Fewer words than this is a page whose article never reached its HTML (a login wall, an app shell). */
const MIN_WORDS = 80;
const MAX_PICTURES = 30;
const PICTURE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

const POSTS =
  /^(x\.com|twitter\.com|mobile\.twitter\.com|threads\.net|bsky\.app|instagram\.com|facebook\.com|m\.facebook\.com|tiktok\.com|mastodon\.social)$/;
const VIDEOS = /^(youtube\.com|m\.youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)$/;

/** Why a link isn't something to read here (a social post, a video), or null when it may be. */
export function notAnArticle(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (POSTS.test(host) && !/\/i\/article\//.test(url.pathname))
    return "That’s a post, not an article. Open the link it shares and save that, or copy the post into a Markdown file and add the file.";
  if (VIDEOS.test(host))
    return "That’s a video, and the library reads text. Copy its transcript into a Markdown file and add the file.";
  return null;
}

/** The paper behind an arXiv abstract page (arxiv.org/abs/2401.01234 → its PDF), or null. */
export function arxivPdf(url: URL): string | null {
  if (!/^(www\.|export\.)?arxiv\.org$/i.test(url.hostname)) return null;
  const id = url.pathname.match(/^\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?$/)?.[1];
  return id ? `https://arxiv.org/pdf/${id}` : null;
}

/** A page's bytes as text, in the character set its header or its <meta> names. */
export function decodePage(body: Buffer, type: string): string {
  const sniff = body.subarray(0, 4096).toString("latin1");
  const label =
    type.match(/charset=["']?([\w-]+)/i)?.[1] ||
    sniff.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ||
    sniff.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1] ||
    "utf-8";
  try {
    return new TextDecoder(label.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

/** The largest picture a srcset offers. */
function largest(srcset: string | null): string | null {
  if (!srcset) return null;
  let best: { url: string; size: number } | null = null;
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, size = "1x"] = part.trim().split(/\s+/);
    const n = Number.parseFloat(size) * (size.endsWith("x") ? 1000 : 1);
    if (url && (!best || n > best.size)) best = { url, size: n };
  }
  return best?.url || null;
}

const LAZY = ["data-src", "data-original", "data-lazy-src", "data-url", "data-hi-res-src"];
const PLACEHOLDER =
  /^data:|placeholder|spacer|blank\.(gif|png)|transparent\.(gif|png)|1x1|pixel\.(gif|png)|loading\.(gif|svg)/i;

/** Gives every picture one real, absolute address (lazy loading, srcset, <picture>), before Readability reads the page. */
function settlePictures(document: Document, base: string) {
  const absolute = (src: string | null) => {
    if (!src || PLACEHOLDER.test(src)) return null;
    try {
      const url = new URL(src.trim(), base);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  };
  for (const img of Array.from(document.querySelectorAll("img"))) {
    const picture = img.parentElement?.tagName.toLowerCase() === "picture" ? img.parentElement : null;
    const fromSource = picture
      ? largest(picture.querySelector("source:not([media*='dark'])")?.getAttribute("srcset") || null)
      : null;
    const candidates = [
      ...LAZY.map((name) => img.getAttribute(name)),
      largest(img.getAttribute("srcset") || img.getAttribute("data-srcset")),
      fromSource,
      img.getAttribute("src"),
    ];
    const src = candidates.map(absolute).find(Boolean);
    if (src) img.setAttribute("src", src);
    else img.remove();
    img.removeAttribute("srcset");
    for (const name of LAZY) img.removeAttribute(name);
  }
  for (const source of Array.from(document.querySelectorAll("picture source"))) source.remove();
}

const meta = (document: Document, ...names: string[]) => {
  for (const name of names) {
    const value = document
      .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
      ?.getAttribute("content")
      ?.trim();
    if (value) return value;
  }
  return undefined;
};

/** A title without the site's name tacked on ("What Is Entropy? | Quanta Magazine"). */
export function withoutSite(title: string, site: string): string {
  const parts = title.split(/\s+[|–—·-]\s+/);
  if (parts.length < 2) return title;
  const last = parts.at(-1)!.toLowerCase().replace(/\W+/g, "");
  const name = site.toLowerCase().replace(/\W+/g, "");
  return last && (name.includes(last) || last.includes(name)) ? parts.slice(0, -1).join(" | ") : title;
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
/** The writer's name from a byline: without "By", a date run into it, or a credit that names no one. */
export function cleanByline(byline: string | null | undefined): string | undefined {
  const name = (byline || "")
    .replace(/\s+/g, " ")
    .replace(/^by\s+/i, "")
    .replace(
      new RegExp(
        `[,·|\\s]*\\b(?:(?:${MONTHS})[a-z]*\\.? \\d{1,2},? \\d{4}|\\d{1,2} (?:${MONTHS})[a-z]*\\.? \\d{4}|\\d{4}-\\d{2}-\\d{2}).*$`,
        "i",
      ),
      "",
    )
    .trim()
    .slice(0, 100);
  if (!name || /^(contributors to|staff|admin|editor(ial)?( team)?$|unknown)/i.test(name)) return undefined;
  return name;
}

export interface ReadPage {
  title: string;
  author?: string;
  site?: string;
  published?: string;
  summary?: string;
  /** The article's HTML, as Readability left it (still to be sanitized). */
  content: string;
  /** Its lead picture (from the page's sharing card), when it has one. */
  lead?: string;
  /** The pictures in the article, as absolute addresses. */
  pictures: string[];
  words: number;
}

/** Finds the article in a page; throws a FetchError when there isn't one worth reading. */
export function readPage(html: string, url: string): ReadPage {
  const { document } = parseHTML(html);
  const lead = (() => {
    const src = meta(document, "og:image", "og:image:url", "twitter:image");
    try {
      return src ? new URL(src, url).toString() : undefined;
    } catch {
      return undefined;
    }
  })();
  const site = meta(document, "og:site_name", "application-name") || new URL(url).hostname.replace(/^www\./, "");
  const published = meta(document, "article:published_time", "og:published_time", "date", "dc.date");
  settlePictures(document as unknown as Document, url);
  const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  const content = article?.content || "";
  const text = textOfHtml(content);
  const words = text ? text.split(/\s+/).length : 0;
  if (!article || words < MIN_WORDS)
    throw new FetchError(
      "Couldn’t find an article on that page. If it needs a login, save the page as a PDF and add the file.",
      422,
    );
  const pictures = [...content.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const siteName = (article.siteName || site).trim();
  const title = withoutSite(
    (article.title || meta(document, "og:title") || site).replace(/\s+/g, " ").trim(),
    siteName,
  );
  // the article's own title heading (Readability keeps it, as an h2): the article is given its title once
  const { document: body } = parseHTML(`<div>${content}</div>`);
  const firstHeading = body.querySelector("h1, h2, h3");
  const same = (a: string, b: string) => a.toLowerCase().replace(/\W+/g, "") === b.toLowerCase().replace(/\W+/g, "");
  if (firstHeading && same(firstHeading.textContent || "", title)) firstHeading.remove();
  const cleaned = firstHeading ? body.querySelector("div")?.innerHTML || content : content;
  const author = cleanByline(article.byline);
  const excerpt = article.excerpt?.replace(/\s+/g, " ").trim();
  // Readability's excerpt is often just the first paragraph: keep it only when it says something else
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const summary =
    excerpt && excerpt.length >= 30 && !norm(text).startsWith(norm(excerpt).slice(0, 60))
      ? excerpt.length > 280
        ? `${excerpt.slice(0, 277).replace(/\s+\S*$/, "")}…`
        : excerpt
      : undefined;
  return {
    title,
    author: author || undefined,
    site: siteName.slice(0, 80),
    published: article.publishedTime || published,
    summary,
    content: cleaned,
    lead,
    pictures: [...new Set(pictures)].slice(0, MAX_PICTURES),
    words,
  };
}

/** Downloads a picture into the article's assets; null if it isn't a picture we keep. */
async function downloadPicture(src: string, dir: string, name: string, fetchOptions: FetchOptions) {
  try {
    const got = await fetchUrl(src, {
      ...fetchOptions,
      accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 15_000,
    });
    const ext = PICTURE_TYPES[got.type.split(";")[0].trim()];
    if (!ext || got.body.length < 200) return null;
    const file = `${name}.${ext}`;
    writeFileSync(join(dir, file), got.body);
    return file;
  } catch {
    return null;
  }
}

/** The article's chapters: its section headings when it has a few, else the whole article as one. */
function articleToc(blocks: Block[], title: string): TocEntry[] {
  const level = ["h2", "h3"].find((tag) => blocks.filter((b) => b.tag === tag && b.text.length < 120).length >= 2);
  let toc: TocEntry[] = level ? headingToc(blocks.map((b) => (b.tag === "h1" ? { ...b, tag: "h0" } : b))) : [];
  if (!toc.length || toc[0].title.startsWith("Part "))
    toc = [{ id: "", title, start: { block: 0 }, end: { block: blocks.length }, sections: [] }];
  // what comes before the first heading (the title, the opening) belongs to the first chapter
  toc[0].start = { block: 0 };
  finishBlockToc(toc, blocks);
  return toc;
}

const escapeHtml = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Saves a web page as an article: its folder, its pictures, its blocks and a clean copy of the text. */
async function saveArticle(page: ReadPage, url: string, fetchOptions: FetchOptions): Promise<Book> {
  const id = newId("b");
  const dir = createBookDir(id, page.title);
  const book: Book = {
    id,
    title: page.title,
    author: page.author,
    format: "web",
    file: "article.html",
    toc: [],
    createdAt: new Date().toISOString(),
    status: "ingesting",
    source: { url, site: page.site, published: page.published },
    summary: page.summary,
  };
  saveBook(book);
  try {
    const assets = join(dir, "assets");
    mkdirSync(assets, { recursive: true });
    const local = new Map<string, string>();
    // a few at a time, so a page full of pictures doesn't open forty connections at once
    for (let i = 0; i < page.pictures.length; i += 4) {
      const batch = page.pictures.slice(i, i + 4);
      const files = await Promise.all(
        batch.map((src, j) => downloadPicture(src, assets, `picture-${i + j + 1}`, fetchOptions)),
      );
      batch.forEach((src, j) => {
        if (files[j]) local.set(src, files[j]!);
      });
    }
    if (page.lead) {
      const file = local.get(page.lead) || (await downloadPicture(page.lead, assets, "cover", fetchOptions));
      if (file) book.cover = `assets/${file}`;
    }
    if (!book.cover && local.size) book.cover = `assets/${[...local.values()][0]}`;

    const blocks: Block[] = [];
    const push = (tag: string, html: string) =>
      blocks.push({ id: blocks.length, chapter: 0, tag, html, text: textOfHtml(html) });
    push("h1", escapeHtml(page.title));
    const byline = [page.author, page.site, page.published && formatDate(page.published)].filter(Boolean).join(" · ");
    if (byline) push("p", `<em>${escapeHtml(byline)}</em>`);
    // a whole document, as the sanitizer reads one (a bare fragment has no body to walk)
    htmlToBlocks(`<!doctype html><html><body>${page.content}</body></html>`, { blocks, chapter: 0 }, (src) => {
      const file = local.get(src.replace(/&amp;/g, "&"));
      return file ? `/api/books/${id}/assets/${file}` : null;
    });
    blocks.forEach((b, i) => {
      b.id = i;
    });
    book.toc = articleToc(blocks, page.title);
    book.blockCount = blocks.length;
    book.words = page.words;
    writeJson(join(dir, "blocks.json"), blocks);
    // the article as a plain page, for anyone browsing the vault (sanitized: the blocks' own HTML)
    writeFileSync(
      join(dir, book.file),
      `<!doctype html>\n<meta charset="utf-8">\n<title>${escapeHtml(page.title)}</title>\n<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>\n${blocks
        .map((b) => (/^h[1-6]$/.test(b.tag) ? `<${b.tag}>${b.html}</${b.tag}>` : `<p>${b.html}</p>`))
        .join("\n")}\n`,
    );
    book.status = "ready";
  } catch (error) {
    book.status = "error";
    book.error = (error as Error).message;
  }
  saveBook(book);
  return book;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso.slice(0, 10)
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** A paper's title, authors, date and abstract from its page's citation tags (what Google Scholar reads). */
async function paperDetails(page: string, fetchOptions: FetchOptions) {
  try {
    const got = await fetchUrl(page, { ...fetchOptions, accept: "text/html", maxBytes: 2 * 1024 * 1024 });
    const { document } = parseHTML(decodePage(got.body, got.type));
    const all = (name: string) =>
      Array.from(document.querySelectorAll(`meta[name="${name}"]`))
        .map((m) => m.getAttribute("content")?.replace(/\s+/g, " ").trim() || "")
        .filter(Boolean);
    const authors = all("citation_author").map((a) => a.split(",").reverse().join(" ").trim());
    const abstract = all("citation_abstract")[0];
    return {
      title: all("citation_title")[0],
      author: authors.length > 3 ? `${authors.slice(0, 3).join(", ")} et al.` : authors.join(", ") || undefined,
      published: all("citation_date")[0] || all("citation_online_date")[0],
      summary: abstract && abstract.length > 280 ? `${abstract.slice(0, 277).replace(/\s+\S*$/, "")}…` : abstract,
    };
  } catch {
    return null;
  }
}

/** Saves what a link points at: an article from a web page, or a PDF. `addPdf` adds a downloaded PDF as a book. */
export async function saveLink(
  raw: string,
  addPdf: (input: { name: string; data: Buffer }) => Promise<Book>,
  fetchOptions: FetchOptions = {},
): Promise<Book> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new FetchError("That doesn’t look like a link.", 400);
  }
  const refused = notAnArticle(url);
  if (refused) throw new FetchError(refused, 422);
  const arxiv = arxivPdf(url);
  // an arXiv paper's PDF rarely names itself: its abstract page gives the title, authors and abstract
  const paper = arxiv ? await paperDetails(arxiv.replace("/pdf/", "/abs/"), fetchOptions) : null;
  const target = arxiv || url.toString();
  const got = await fetchUrl(target, { ...fetchOptions, maxBytes: 60 * 1024 * 1024, timeoutMs: 30_000 });
  const type = got.type.split(";")[0].trim();
  if (type === "application/pdf" || got.body.subarray(0, 5).toString("latin1") === "%PDF-") {
    const last = decodeURIComponent(new URL(got.url).pathname.split("/").filter(Boolean).pop() || "paper");
    const book = await addPdf({ name: /\.pdf$/i.test(last) ? last : `${last}.pdf`, data: got.body });
    if (book.status !== "error") {
      book.source = { url: url.toString(), site: url.hostname.replace(/^www\./, ""), published: paper?.published };
      if (paper?.title) book.title = paper.title;
      if (paper?.author) book.author = paper.author;
      if (paper?.summary) book.summary = paper.summary;
      saveBook(book);
      // its folder was named after the file ("1706-03762"); name it after the paper
      if (paper?.title) renameBookDir(book.id, paper.title);
    }
    return book;
  }
  if (!/html|xml/.test(type)) throw new FetchError("That link isn’t a web page or a PDF.", 415);
  if (got.body.length > 8 * 1024 * 1024) throw new FetchError("That page is too large to save.", 413);
  const page = readPage(decodePage(got.body, got.type), got.url);
  return saveArticle(page, url.toString(), fetchOptions);
}
