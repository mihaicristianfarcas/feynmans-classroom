import { readFileSync } from "node:fs";
import type { PageLine, PageText, TocEntry } from "../types.ts";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjs: PdfJs | null = null;
async function lib(): Promise<PdfJs> {
  if (!pdfjs) pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

interface OutlineNode {
  title: string;
  dest: unknown;
  items?: OutlineNode[];
}

export interface PdfIngest {
  title?: string;
  author?: string;
  pageCount: number;
  pages: PageText[];
  /** Per-page Markdown (pdf-inspector), used as the text the generators read. */
  markdown: string[];
  extractor: "pdf-inspector" | "pdf.js";
  toc: TocEntry[];
  tocSource: "outline" | "headings" | "chunks";
}

interface InspectorItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  page: number;
  itemType?: string;
}
type Inspector = {
  extractTextWithPositionsAsync(buffer: Buffer): Promise<InspectorItem[]>;
  extractPagesMarkdownAsync(buffer: Buffer): Promise<{ pages: { page: number; markdown: string }[] }>;
};
let inspector: Inspector | null | undefined;
async function loadInspector(): Promise<Inspector | null> {
  if (inspector === undefined) {
    try {
      inspector = (await import("@firecrawl/pdf-inspector")) as unknown as Inspector;
    } catch (error) {
      console.warn("[ingest] pdf-inspector unavailable, falling back to pdf.js text:", (error as Error).message);
      inspector = null;
    }
  }
  return inspector;
}

export async function ingestPdf(path: string): Promise<PdfIngest> {
  const { getDocument } = await lib();
  const buffer = readFileSync(path);
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const meta = (await doc.getMetadata().catch(() => null)) as { info?: Record<string, unknown> } | null;
    const sizes: { w: number; h: number }[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const view = page.getViewport({ scale: 1 });
      sizes.push({ w: view.width, h: view.height });
    }
    let pages: PageText[] | null = null;
    let markdown: string[] = [];
    let extractor: PdfIngest["extractor"] = "pdf.js";
    const fast = await loadInspector();
    if (fast) {
      try {
        const [items, md] = await Promise.all([
          fast.extractTextWithPositionsAsync(buffer),
          fast.extractPagesMarkdownAsync(buffer),
        ]);
        pages = linesFromItems(items, sizes);
        markdown = sizes.map((_, i) => md.pages.find((p) => p.page === i)?.markdown || "");
        extractor = "pdf-inspector";
      } catch (error) {
        console.warn("[ingest] pdf-inspector failed, using pdf.js:", (error as Error).message);
      }
    }
    if (!pages) {
      pages = [];
      for (let n = 1; n <= doc.numPages; n++) pages.push(await pageText(doc, n));
    }
    stripRunningHeads(pages);
    if (!markdown.length || markdown.every((m) => !m.trim()))
      markdown = pages.map((p) => joinLines(p.lines.map((l) => l.t)));
    const outline = ((await doc.getOutline().catch(() => null)) || []) as OutlineNode[];
    let toc = await tocFromOutline(doc, outline, pages);
    let tocSource: PdfIngest["tocSource"] = "outline";
    if (toc.length < 2) [toc, tocSource] = [tocFromHeadings(pages), "headings"];
    if (toc.length < 2) [toc, tocSource] = [tocByChunks(pages.length), "chunks"];
    const info = meta?.info || {};
    const clean = (value: unknown) => {
      if (typeof value !== "string") return undefined;
      const text = value
        .replace(/^The Project Gutenberg eBook #\d+:\s*/i, "")
        .replace(/^Microsoft Word - /i, "")
        .trim();
      // print-to-PDF and converters leave junk titles; the file name is better than these
      return /^(about:blank|untitled|document\d*|https?:\/\/\S+|[\w-]+\.(docx?|html?|tex|pdf))$/i.test(text)
        ? undefined
        : text;
    };
    return {
      title: clean(info.Title) || undefined,
      author: clean(info.Author) || undefined,
      pageCount: doc.numPages,
      pages,
      markdown,
      extractor,
      toc,
      tocSource,
    };
  } finally {
    await doc.destroy();
  }
}

/** Groups pdf-inspector's positioned runs into lines (y measured from the page top, as a fraction). */
function linesFromItems(items: InspectorItem[], sizes: { w: number; h: number }[]): PageText[] {
  const byPage = new Map<number, InspectorItem[]>();
  for (const item of items) {
    if ((item.itemType && item.itemType !== "Text") || !item.text) continue;
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }
  return sizes.map(({ w, h }, i) => {
    const n = i + 1;
    const rows: { base: number; size: number; runs: InspectorItem[] }[] = [];
    for (const item of byPage.get(n) || []) {
      const size = item.fontSize || item.height || 10;
      let row = rows.find((r) => Math.abs(r.base - item.y) < Math.max(1.5, Math.min(size, r.size) * 0.5));
      if (!row) {
        row = { base: item.y, size, runs: [] };
        rows.push(row);
      }
      row.runs.push(item);
      row.size = Math.max(row.size, size);
    }
    rows.sort((a, b) => b.base - a.base);
    const lines: PageLine[] = rows
      .map((row) => {
        row.runs.sort((a, b) => a.x - b.x);
        let text = "";
        let end = -Infinity;
        for (const run of row.runs) {
          const gap = run.x - end;
          if (text && gap > row.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(run.text)) text += " ";
          text += run.text;
          end = Math.max(end, run.x + (run.width || 0));
        }
        const x = row.runs[0]?.x ?? 0;
        const top = h - row.base - row.size * 0.85;
        return { y: round(top / h), x: round(x / w), s: round(row.size), t: text.replace(/\s+/g, " ").trim() };
      })
      .filter((line) => line.t);
    return { n, w: Math.round(w), h: Math.round(h), lines };
  });
}

type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

async function pageText(doc: Doc, n: number): Promise<PageText> {
  const page = await doc.getPage(n);
  const view = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const rows: { y: number; x: number; s: number; parts: { x: number; t: string }[] }[] = [];
  for (const raw of content.items as { str: string; transform: number[]; height: number; hasEOL?: boolean }[]) {
    if (!("str" in raw)) continue;
    const [, , , , x, base] = raw.transform;
    const size = Math.abs(raw.height || raw.transform[3] || 0);
    if (!raw.str) continue;
    // y of the line's top, measured from the top of the page
    const top = view.height - base - size * 0.85;
    let row = rows.find((r) => Math.abs(r.y - top) < Math.max(2, size * 0.45));
    if (!row) {
      row = { y: top, x, s: size, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, t: raw.str });
    row.x = Math.min(row.x, x);
    row.s = Math.max(row.s, size);
  }
  rows.sort((a, b) => a.y - b.y);
  const lines: PageLine[] = rows
    .map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      const t = row.parts
        .map((p) => p.t)
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      return { y: round(row.y / view.height), x: round(row.x / view.width), s: round(row.s), t };
    })
    .filter((line) => line.t);
  page.cleanup();
  return { n, w: Math.round(view.width), h: Math.round(view.height), lines };
}
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Drops lines that repeat at the top or bottom of many pages (running heads, page numbers). */
function stripRunningHeads(pages: PageText[]) {
  const key = (t: string) => t.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const page of pages) {
    const edge = page.lines.filter((l) => l.y < 0.08 || l.y > 0.93);
    for (const line of new Set(edge.map((l) => key(l.t)))) counts.set(line, (counts.get(line) || 0) + 1);
  }
  const threshold = Math.max(3, pages.length * 0.15);
  for (const page of pages) {
    page.lines = page.lines.filter((l) => {
      if (!(l.y < 0.08 || l.y > 0.93)) return true;
      const k = key(l.t);
      return !((counts.get(k) || 0) >= threshold || /^[#\s\-–—]*$/.test(k));
    });
  }
}

async function resolvePage(doc: Doc, dest: unknown): Promise<{ page: number; y?: number } | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : (dest as unknown[]);
    if (!Array.isArray(explicit) || !explicit.length) return null;
    const ref = explicit[0];
    const index = typeof ref === "number" ? ref : await doc.getPageIndex(ref as never);
    const page = index + 1;
    // [ref, {name:"XYZ"}, left, top, zoom]
    let y: number | undefined;
    const kind = (explicit[1] as { name?: string } | undefined)?.name;
    if (kind === "XYZ" && typeof explicit[3] === "number") {
      const p = await doc.getPage(page);
      const h = p.getViewport({ scale: 1 }).height;
      y = Math.min(1, Math.max(0, (h - (explicit[3] as number)) / h));
    }
    return { page, y };
  } catch {
    return null;
  }
}

async function tocFromOutline(doc: Doc, outline: OutlineNode[], pages: PageText[]): Promise<TocEntry[]> {
  if (!outline.length) return [];
  // Containers like "Front Matter / Main Matter / Back Matter" hold the chapters one level down.
  let level: OutlineNode[] = outline;
  if (outline.length <= 4 && outline.every((node) => (node.items || []).length))
    level = outline.flatMap((node) => node.items || []);
  const entries: TocEntry[] = [];
  for (const node of level) {
    const at = await resolvePage(doc, node.dest);
    if (!at) continue;
    const sections: TocEntry["sections"] = [];
    for (const child of node.items || []) {
      const c = await resolvePage(doc, child.dest);
      if (c) sections.push({ id: "", title: child.title.trim(), start: c });
    }
    entries.push({
      id: "",
      title: node.title.trim(),
      start: { page: at.page, y: at.y ?? 0 },
      end: { page: pages.length },
      sections,
    });
  }
  entries.sort((a, b) => a.start.page! - b.start.page! || (a.start.y ?? 0) - (b.start.y ?? 0));
  finishToc(entries, pages.length);
  for (const entry of entries) {
    if (/^(chapter|part|lecture|book|section)\s+[\divxlc]+\.?$/i.test(entry.title))
      entry.subtitle = headingNear(pages, entry.start.page!, entry.title);
  }
  return entries;
}

export function finishToc(entries: TocEntry[], pageCount: number) {
  entries.forEach((entry, i) => {
    entry.id = `c${i + 1}`;
    const next = entries[i + 1];
    entry.end = next ? { page: next.start.page!, y: next.start.y ?? 0 } : { page: pageCount, y: 1 };
    for (const [j, s] of entry.sections.entries()) s.id = `${entry.id}s${j + 1}`;
  });
}

/** The biggest-type line(s) on a chapter's first page that aren't the outline title itself. */
function headingNear(pages: PageText[], pageNo: number, title: string): string | undefined {
  const page = pages[pageNo - 1];
  if (!page?.lines.length) return undefined;
  const sizes = page.lines.map((l) => l.s).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)];
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  const isHeading = (l: PageLine) =>
    l.y < 0.5 && l.s >= body * 1.08 && norm(l.t) !== norm(title) && l.t.length > 1 && !/^chapter\b/i.test(l.t);
  const first = page.lines.findIndex(isHeading);
  if (first < 0) return undefined;
  // a heading can wrap: keep following lines in the same type size
  const parts = [page.lines[first].t];
  for (
    let i = first + 1;
    i < page.lines.length && Math.abs(page.lines[i].s - page.lines[first].s) < 0.5 && isHeading(page.lines[i]);
    i++
  )
    parts.push(page.lines[i].t);
  return titleCase(parts.join(" ").replace(/\.$/, ""));
}

export function titleCase(text: string) {
  const trimmed = text.replace(/\s+/g, " ").replace(/\.$/, "").trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  const small = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "but",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
    "from",
  ]);
  return trimmed.toLowerCase().replace(/[a-z0-9]+/g, (word, offset: number, all: string) => {
    if (
      /^[ivxlcdm]+$/.test(word) &&
      word.length <= 6 &&
      !["mix", "dim", "mid", "lid", "did", "civil", "vivid"].includes(word)
    )
      return word.toUpperCase();
    const first = offset === 0 || /[—:–(-]\s*$/.test(all.slice(0, offset));
    return !first && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** No outline: look for short lines in noticeably larger type near the top of a page. */
function tocFromHeadings(pages: PageText[]): TocEntry[] {
  const all = pages.flatMap((p) => p.lines.map((l) => l.s)).sort((a, b) => a - b);
  if (!all.length) return [];
  const body = all[Math.floor(all.length / 2)];
  const entries: TocEntry[] = [];
  for (const page of pages) {
    const at = page.lines.findIndex(
      (l) => l.s >= body * 1.35 && l.t.length >= 3 && l.t.length <= 80 && l.y < 0.6 && /[a-z]/i.test(l.t),
    );
    if (at < 0) continue;
    const heading = page.lines[at];
    // a heading can wrap onto a second line in the same size
    const words = [heading.t];
    for (
      let i = at + 1;
      i < page.lines.length && Math.abs(page.lines[i].s - heading.s) < 0.5 && words.join(" ").length < 120;
      i++
    )
      words.push(page.lines[i].t);
    const title = words.join(" ");
    const prev = entries[entries.length - 1];
    if (prev && page.n - prev.start.page! < 2) continue;
    entries.push({
      id: "",
      title: titleCase(title),
      start: { page: page.n, y: Math.max(0, heading.y - 0.02) },
      end: { page: pages.length },
      sections: [],
    });
  }
  if (entries.length > 80 || entries.length < 2) return [];
  finishToc(entries, pages.length);
  return entries;
}

function tocByChunks(pageCount: number, size = 12): TocEntry[] {
  const entries: TocEntry[] = [];
  for (let start = 1; start <= pageCount; start += size) {
    const end = Math.min(pageCount, start + size - 1);
    entries.push({
      id: "",
      title: `Pages ${start}–${end}`,
      start: { page: start, y: 0 },
      end: { page: end },
      sections: [],
    });
  }
  finishToc(entries, pageCount);
  return entries;
}

/** Text of a page range with page markers, for the generators. Prefers the per-page Markdown. */
export function pagesText(
  pages: PageText[],
  from: number,
  to: number,
  maxChars = Infinity,
  markdown: string[] = [],
  edges: { fromY?: number; toY?: number } = {},
): string {
  const out: string[] = [];
  let total = 0;
  for (let n = from; n <= to && n <= pages.length; n++) {
    // a chapter that starts or ends mid-page takes only its own lines from that page
    const cutTop = n === from && (edges.fromY ?? 0) > 0;
    const cutBottom = n === to && edges.toY !== undefined && edges.toY < 1;
    const body =
      cutTop || cutBottom
        ? joinLines(
            pages[n - 1].lines
              .filter(
                (l) => (!cutTop || l.y >= (edges.fromY ?? 0) - 0.02) && (!cutBottom || l.y < (edges.toY ?? 1) - 0.005),
              )
              .map((l) => l.t),
          )
        : (markdown[n - 1] || "").trim() || joinLines(pages[n - 1].lines.map((l) => l.t));
    if (!body.trim()) continue;
    const chunk = `\n[[page ${n}]]\n${body}\n`;
    if (total + chunk.length > maxChars) {
      out.push(chunk.slice(0, Math.max(0, maxChars - total)), "\n[[truncated]]\n");
      break;
    }
    out.push(chunk);
    total += chunk.length;
  }
  return out.join("");
}

export function joinLines(lines: string[]): string {
  let text = "";
  for (const line of lines) {
    if (!text) text = line;
    else if (/[a-z]-$/.test(text) && /^[a-z]/.test(line)) text = text.slice(0, -1) + line;
    else text += `\n${line}`;
  }
  return text;
}
