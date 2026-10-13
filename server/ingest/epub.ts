import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import JSZip from "jszip";
import { parseHTML } from "linkedom";
import type { Block, TocEntry } from "../types.ts";
import { htmlToBlocks } from "./html.ts";
import { titleCase } from "./pdf.ts";

export interface ReflowIngest {
  title?: string;
  author?: string;
  blocks: Block[];
  toc: TocEntry[];
}

const IMAGE = /\.(png|jpe?g|gif|svg|webp)$/i;

interface InflateStream {
  on(event: "data", fn: (chunk: Uint8Array) => void): InflateStream;
  on(event: "error", fn: (error: Error) => void): InflateStream;
  on(event: "end", fn: () => void): InflateStream;
  pause(): InflateStream;
  resume(): InflateStream;
}
const ENTRY_LIMIT = 64 * 1024 * 1024;
const TOTAL_LIMIT = 600 * 1024 * 1024;

/** Inflates one entry while counting bytes, so a small archive can't unpack into gigabytes. */
function inflate(file: JSZip.JSZipObject, budget: { left: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    // JSZip's streaming reader (present at runtime, missing from its type definitions)
    const stream = (file as unknown as { internalStream(type: "uint8array"): InflateStream }).internalStream("uint8array");
    stream
      .on("data", (chunk: Uint8Array) => {
        size += chunk.length;
        budget.left -= chunk.length;
        if (size > ENTRY_LIMIT || budget.left < 0) {
          stream.pause();
          reject(new Error(`this EPUB unpacks to more than ${size > ENTRY_LIMIT ? "64 MB in one file" : "600 MB"}`));
          return;
        }
        chunks.push(chunk);
      })
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)))
      .resume();
  });
}

export async function ingestEpub(path: string, assetsDir: string, assetUrl: (name: string) => string): Promise<ReflowIngest> {
  const zip = await JSZip.loadAsync(readFileSync(path));
  // a small archive can unpack into gigabytes: refuse before inflating anything
  const entries = Object.values(zip.files);
  const inflated = entries.reduce((sum, f) => sum + (((f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize) || 0), 0);
  if (entries.length > 20000 || inflated > 600 * 1024 * 1024) throw new Error("this EPUB unpacks to more than 600 MB or 20,000 files");
  const budget = { left: TOTAL_LIMIT };
  const read = async (name: string) => {
    const file = zip.file(decodeURIComponent(name)) || zip.file(name);
    return file ? (await inflate(file, budget)).toString("utf8") : null;
  };
  const container = await read("META-INF/container.xml");
  const opfPath = container?.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("not an EPUB: META-INF/container.xml has no rootfile");
  const opf = (await read(opfPath)) || "";
  const base = posix.dirname(opfPath);
  const at = (href: string) => posix.normalize(base === "." ? href : `${base}/${href}`);
  const { document: opfDoc } = parseHTML(opf.replace(/<\?xml[^>]*>/, ""));
  const pick = (selector: string) => opfDoc.querySelector(selector)?.textContent?.trim() || undefined;
  const title = pick("dc\\:title, title");
  const author = pick("dc\\:creator, creator");

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const item of Array.from(opfDoc.querySelectorAll("item"))) {
    manifest.set(item.getAttribute("id") || "", { href: at(item.getAttribute("href") || ""), type: item.getAttribute("media-type") || "", props: item.getAttribute("properties") || "" });
  }
  const spine = Array.from(opfDoc.querySelectorAll("itemref"))
    .map((ref) => manifest.get(ref.getAttribute("idref") || ""))
    .filter((item): item is { href: string; type: string; props: string } => !!item && /html|xml/.test(item.type));

  // copy images so the reader can show them
  mkdirSync(assetsDir, { recursive: true });
  for (const item of manifest.values()) {
    if (!IMAGE.test(item.href)) continue;
    const file = zip.file(item.href) || zip.file(decodeURIComponent(item.href));
    if (!file) continue;
    const out = join(assetsDir, item.href.replace(/[^a-z0-9._/-]/gi, "_"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, await inflate(file, budget));
  }

  const blocks: Block[] = [];
  const anchors = new Map<string, number>(); // "file#id" or "file" -> block index
  for (const [index, item] of spine.entries()) {
    const html = await read(item.href);
    if (!html) continue;
    const startIndex = blocks.length;
    const dir = posix.dirname(item.href);
    const ids = htmlToBlocks(html, { blocks, chapter: index }, (src) => {
      if (!src || /^(https?:|data:|javascript:)/i.test(src)) return null;
      const target = posix.normalize(`${dir}/${src.split("#")[0]}`);
      return assetUrl(target.replace(/[^a-z0-9._/-]/gi, "_"));
    });
    anchors.set(item.href, startIndex);
    for (const [id, block] of ids) anchors.set(`${item.href}#${id}`, block);
  }

  // table of contents: EPUB 3 nav, else NCX, else one entry per spine file with a heading
  const navItem = [...manifest.values()].find((item) => /\bnav\b/.test(item.props));
  const ncxItem = [...manifest.values()].find((item) => item.type === "application/x-dtbncx+xml");
  let points: { title: string; href: string; depth: number }[] = [];
  if (navItem) {
    const nav = (await read(navItem.href)) || "";
    const { document } = parseHTML(nav.replace(/<\?xml[^>]*>/, ""));
    const toc = Array.from(document.querySelectorAll("nav")).find((n) => /toc/.test(n.getAttribute("epub:type") || n.getAttribute("type") || "toc")) || document.querySelector("nav");
    const navDir = posix.dirname(navItem.href);
    const walk = (list: Element | null, depth: number) => {
      if (!list) return;
      for (const li of Array.from(list.children).filter((c) => c.tagName.toLowerCase() === "li")) {
        const a = li.querySelector("a");
        if (a) points.push({ title: (a.textContent || "").replace(/\s+/g, " ").trim(), href: posix.normalize(`${navDir}/${a.getAttribute("href") || ""}`), depth });
        walk(li.querySelector("ol, ul"), depth + 1);
      }
    };
    walk(toc?.querySelector("ol, ul") || null, 0);
  }
  if (!points.length && ncxItem) {
    const ncx = (await read(ncxItem.href)) || "";
    const ncxDir = posix.dirname(ncxItem.href);
    const { document } = parseHTML(ncx.replace(/<\?xml[^>]*>/, ""));
    const walk = (parent: Element, depth: number) => {
      for (const np of Array.from(parent.children).filter((c) => c.tagName.toLowerCase() === "navpoint")) {
        const label = np.querySelector("text")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const src = np.querySelector("content")?.getAttribute("src") || "";
        points.push({ title: label, href: posix.normalize(`${ncxDir}/${src}`), depth });
        walk(np, depth + 1);
      }
    };
    const map = document.querySelector("navMap, navmap");
    if (map) walk(map as unknown as Element, 0);
  }
  if (!blocks.some((b) => b.text.length > 0)) throw new Error("no readable text found in this EPUB");
  const resolve = (href: string) => anchors.get(href) ?? anchors.get(href.split("#")[0]);
  points = points.filter((p) => resolve(p.href) !== undefined && p.title);
  const skip = /^(cover|title ?page|contents|table of contents|the full project gutenberg license|copyright|colophon)$/i;

  const top = points.filter((p) => p.depth === Math.min(...points.map((q) => q.depth)));
  let toc: TocEntry[] = [];
  const chapterPoints = top.length >= 2 ? top : points;
  for (const point of chapterPoints) {
    if (skip.test(point.title)) continue;
    const block = resolve(point.href)!;
    const entry: TocEntry = { id: "", title: point.title, start: { block }, end: { block: blocks.length }, sections: [] };
    const idx = points.indexOf(point);
    for (let j = idx + 1; j < points.length && points[j].depth > point.depth; j++) {
      if (points[j].depth === point.depth + 1) entry.sections.push({ id: "", title: points[j].title, start: { block: resolve(points[j].href)! } });
    }
    toc.push(entry);
  }
  toc.sort((a, b) => a.start.block! - b.start.block!);
  toc = toc.filter((entry, i) => i === 0 || entry.start.block !== toc[i - 1].start.block);
  if (toc.length < 2) toc = headingToc(blocks);
  finishBlockToc(toc, blocks);
  return { title, author, blocks, toc };
}

/** Chapters from h1/h2 blocks when there is no usable nav. */
export function headingToc(blocks: Block[]): TocEntry[] {
  const levels = ["h1", "h2", "h3"];
  for (const level of levels) {
    const heads = blocks.filter((b) => b.tag === level && b.text.length < 120);
    if (heads.length >= 2) return heads.map((b) => ({ id: "", title: b.text, start: { block: b.id }, end: { block: blocks.length }, sections: [] }));
  }
  const size = 60;
  const out: TocEntry[] = [];
  for (let i = 0; i < blocks.length; i += size) out.push({ id: "", title: `Part ${out.length + 1}`, start: { block: i }, end: { block: Math.min(blocks.length, i + size) }, sections: [] });
  return out;
}

export function finishBlockToc(toc: TocEntry[], blocks: Block[]) {
  const generic = /^(chapter|lecture|part|book|section)\s+([0-9]+|[ivxlcdm]+)\.?$/i;
  for (const entry of toc) {
    entry.title = titleCase(entry.title.replace(/\s+/g, " ").trim());
    if (generic.test(entry.title)) {
      // the real title is usually the next heading after "LECTURE II."
      const start = entry.start.block ?? 0;
      const next = blocks.slice(start, start + 4).find((b) => /^h[1-6]$/.test(b.tag) && !generic.test(b.text.trim()) && b.text.length < 160);
      if (next) entry.subtitle = titleCase(next.text.replace(/\.$/, ""));
    }
  }
  toc.forEach((entry, i) => {
    entry.id = `c${i + 1}`;
    entry.end = { block: toc[i + 1] ? toc[i + 1].start.block! : blocks.length };
    entry.sections.forEach((s, j) => (s.id = `${entry.id}s${j + 1}`));
  });
  // tag every block with the chapter it falls in, so the reader can group them
  for (const block of blocks) {
    const index = toc.findIndex((entry) => block.id >= entry.start.block! && block.id < entry.end.block!);
    block.chapter = index;
  }
}
