/* Two-up PDFs: scans and exports that print a book's facing pages side by side on one landscape sheet.
 * Such a book is told by where its text sits (two blocks of text with an empty gutter between them on
 * most sheets), and is split into single pages, each sheet's left half then its right, so the reader,
 * selection, quotes and page numbers all see one page at a time. Both pages draw the sheet's content,
 * upright, cropped to their side (pdf.js and pdf-inspector read only the text inside a page's crop). */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFPageEmbedder,
  type PDFPageLeaf,
  PDFRef,
} from "pdf-lib";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type Doc = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

/** A sheet wider than this (width over height) may hold two pages. */
const LANDSCAPE = 1.2;
/** Pages sampled to decide whether a book is two-up. */
const SAMPLE = 40;

/** How to cut a sheet: its size as shown, where the cut falls (in points from the left), and how its
 * own coordinates map onto it as shown (pdf.js's viewport transform at scale 1, y down; viewBox is
 * the box shown). */
export interface Cut {
  width: number;
  height: number;
  at: number;
  transform: number[];
  viewBox: number[];
}

interface Sheet {
  landscape: boolean;
  /** Where the gutter is, as a fraction of the sheet's width, when the sheet's text has one. */
  gutter: number | null;
  /** Enough text to judge by. */
  texty: boolean;
  /** Where the sheet splits: at its gutter, or its middle. */
  cut: Cut | null;
}

/** A page as it is shown (scans often store a landscape sheet as a portrait page turned 90°), and its
 * text runs as [left, right] fractions of the shown width. */
async function sheetOf(doc: Doc, n: number): Promise<Sheet> {
  const page = await doc.getPage(n);
  const view = page.getViewport({ scale: 1 });
  const landscape = view.width / view.height >= LANDSCAPE;
  const runs: [number, number][] = [];
  if (landscape) {
    const content = await page.getTextContent();
    for (const item of content.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!item.str?.trim() || !item.transform) continue;
      // the run from its start along its own direction, for its width, then turned as the page is shown
      const [a, b, , , e, f] = item.transform;
      const len = Math.hypot(a, b) || 1;
      const width = item.width || 0;
      const [x1] = view.convertToViewportPoint(e, f);
      const [x2] = view.convertToViewportPoint(e + (a / len) * width, f + (b / len) * width);
      runs.push([Math.min(x1, x2) / view.width, Math.max(x1, x2) / view.width]);
    }
  }
  page.cleanup();
  const gutter = landscape ? findGutter(runs) : null;
  const cut: Cut | null = landscape
    ? {
        width: view.width,
        height: view.height,
        at: view.width * (gutter ?? 0.5),
        transform: [...view.transform],
        viewBox: [...view.viewBox],
      }
    : null;
  return { landscape, gutter, texty: runs.length >= 12, cut };
}

/** The gutter of a sheet: the clear vertical band near the middle that no text crosses, with text on
 * both sides of it; null if the text runs across the middle (a slide, a landscape table). */
export function findGutter(runs: [number, number][]): number | null {
  if (runs.length < 12) return null;
  // how many runs cross each candidate line from 40% to 60% of the width
  const at = Array.from({ length: 41 }, (_, k) => 0.4 + k * 0.005);
  const crossing = at.map((x) => runs.filter(([a, b]) => a < x - 0.002 && b > x + 0.002).length);
  const fewest = Math.min(...crossing);
  if (fewest > Math.max(1, Math.floor(runs.length * 0.02))) return null;
  // the sheet's middle when it is clear (a two-up export halves its sheets exactly); else, a scan off
  // centre, the middle of the clear band nearest it
  let gutter: number | null = crossing[20] === fewest ? 0.5 : null;
  for (let k = 0; gutter !== 0.5 && k < at.length; k++) {
    if (crossing[k] !== fewest || (k > 0 && crossing[k - 1] === fewest)) continue;
    let end = k;
    while (end + 1 < at.length && crossing[end + 1] === fewest) end++;
    const middle = (at[k] + at[end]) / 2;
    if (gutter === null || Math.abs(middle - 0.5) < Math.abs(gutter - 0.5)) gutter = middle;
  }
  if (gutter === null) return null;
  const share = runs.filter(([a, b]) => (a + b) / 2 < gutter).length / runs.length;
  return share >= 0.15 && share <= 0.85 ? Math.round(gutter * 1000) / 1000 : null;
}

/** Where to cut a PDF's sheets (by page index; null keeps the sheet whole), or null if the book isn't
 * two-up. */
export async function detectSpreads(doc: Doc): Promise<(Cut | null)[] | null> {
  const count = doc.numPages;
  const step = Math.max(1, count / SAMPLE);
  const sampled: Sheet[] = [];
  for (let i = 0; i < Math.min(count, SAMPLE); i++) sampled.push(await sheetOf(doc, Math.floor(i * step) + 1));
  const landscape = sampled.filter((s) => s.landscape);
  if (landscape.length < Math.max(1, sampled.length * 0.5)) return null;
  const judged = landscape.filter((s) => s.texty);
  if (!judged.length || judged.filter((s) => s.gutter !== null).length < judged.length * 0.7) return null;
  // a two-up book: every landscape sheet splits, at its own gutter (scans drift) or the middle
  const cuts: (Cut | null)[] = [];
  for (let n = 1; n <= count; n++) cuts.push((await sheetOf(doc, n)).cut);
  return cuts;
}

/** A sheet's two pages once split: each page's own object, and how a point of the sheet lands on it. */
interface Split {
  pages: [PDFRef, PDFRef];
  at: number;
  /** The sheet's coordinates to the upright sheet's (PDF space: y up, origin at the bottom left). */
  matrix: number[];
}

const apply = (m: number[], x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Writes `src` to `out` with each sheet that has a cut split into its two pages. Each page is drawn
 * upright (no /Rotate left, which pdf.js's text layer selects badly on) from the sheet's content held
 * once as a form, and cropped to its side; the sheet's own page object becomes the left page, so the
 * outline and links that point at the sheet still find it. Returns how many sheets were split.
 */
export async function splitSheets(src: string, out: string, cuts: (Cut | null)[]): Promise<number> {
  const pdf = await PDFDocument.load(readFileSync(src), { ignoreEncryption: true, updateMetadata: false });
  const { context } = pdf;
  const splits = new Map<string, Split>();
  // from the back, so the indexes ahead stay where they were
  for (let i = pdf.getPageCount() - 1; i >= 0; i--) {
    const cut = cuts[i];
    if (!cut) continue;
    const left = pdf.getPage(i);
    const leaf = left.node;
    leaf.normalize();
    const [x0, y0, x1, y1] = cut.viewBox;
    const sheet = await (
      await PDFPageEmbedder.for(leaf, { left: x0, bottom: y0, right: x1, top: y1 }, [1, 0, 0, 1, 0, 0])
    ).embedIntoContext(context);
    // the viewport's transform has y going down; PDF's goes up
    const [a, b, c, d, e, f] = cut.transform;
    const matrix = [a, -b, c, -d, e, cut.height - f];
    const draw = (dx: number) =>
      context.register(
        context.stream(`q ${[...matrix.slice(0, 4), matrix[4] - dx, matrix[5]].join(" ")} cm /Sheet Do Q`),
      );
    const annots = leaf.Annots();
    for (const name of ["Rotate", "TrimBox", "BleedBox", "ArtBox", "Annots"]) leaf.delete(PDFName.of(name));
    leaf.set(PDFName.of("Rotate"), context.obj(0));
    leaf.set(PDFName.of("Resources"), context.obj({ XObject: { Sheet: sheet } }));
    const right = leaf.clone();
    const sides: [PDFPageLeaf, number, number][] = [
      [leaf, 0, cut.at],
      [right, cut.at, cut.width - cut.at],
    ];
    for (const [node, dx, width] of sides) {
      node.set(PDFName.of("Contents"), draw(dx));
      node.set(PDFName.MediaBox, context.obj([0, 0, width, cut.height]));
      node.set(PDFName.of("CropBox"), context.obj([0, 0, width, cut.height]));
    }
    const rightRef = context.register(right);
    pdf.insertPage(i + 1, PDFPage.of(right, rightRef, pdf));
    // each link and note goes, moved to match, with the half it sits on
    if (annots) {
      const kept: PDFArray[] = [context.obj([]), context.obj([])];
      for (let k = 0; k < annots.size(); k++) {
        const annot = annots.lookupMaybe(k, PDFDict);
        const rect = annot?.lookupMaybe(PDFName.of("Rect"), PDFArray);
        if (!annot || !rect) continue;
        const n = (j: number) => rect.lookupMaybe(j, PDFNumber)?.asNumber() ?? 0;
        const [ax, ay] = apply(matrix, n(0), n(1));
        const [bx, by] = apply(matrix, n(2), n(3));
        const side = (ax + bx) / 2 >= cut.at ? 1 : 0;
        const dx = side ? cut.at : 0;
        annot.set(
          PDFName.of("Rect"),
          context.obj([Math.min(ax, bx) - dx, Math.min(ay, by), Math.max(ax, bx) - dx, Math.max(ay, by)]),
        );
        annot.delete(PDFName.of("QuadPoints"));
        annot.set(PDFName.of("P"), side ? rightRef : left.ref);
        kept[side].push(annots.get(k));
      }
      leaf.set(PDFName.of("Annots"), kept[0]);
      right.set(PDFName.of("Annots"), kept[1]);
    }
    splits.set(left.ref.toString(), { pages: [left.ref, rightRef], at: cut.at, matrix });
  }
  if (splits.size) retargetDestinations(pdf, splits);
  writeFileSync(out, await pdf.save({ useObjectStreams: true }));
  return splits.size;
}

/** Points the outline's and links' places on split sheets at the page they now fall on, upright. */
function retargetDestinations(pdf: PDFDocument, splits: Map<string, Split>) {
  const { context } = pdf;
  const retarget = (dest: PDFArray | undefined) => {
    const page = dest?.get(0);
    const split = page instanceof PDFRef ? splits.get(page.toString()) : undefined;
    if (!dest || !split || dest.lookupMaybe(1, PDFName)?.asString() !== "/XYZ") return;
    const num = (j: number) => dest.lookupMaybe(j, PDFNumber)?.asNumber();
    const [left, top] = [num(2), num(3)];
    if (left === undefined && top === undefined) return;
    const [x, y] = apply(split.matrix, left ?? 0, top ?? 0);
    const side = x >= split.at ? 1 : 0;
    dest.set(0, split.pages[side]);
    dest.set(2, context.obj(Math.max(0, x - (side ? split.at : 0))));
    dest.set(3, context.obj(y));
  };
  const destOf = (holder: PDFDict) => {
    const action = holder.lookupMaybe(PDFName.of("A"), PDFDict);
    return (action ?? holder).lookupMaybe(action ? PDFName.of("D") : PDFName.of("Dest"), PDFArray);
  };
  const seen = new Set<PDFDict>();
  const walk = (item: PDFDict | undefined) => {
    for (let node = item; node && !seen.has(node); node = node.lookupMaybe(PDFName.of("Next"), PDFDict)) {
      seen.add(node);
      retarget(destOf(node));
      walk(node.lookupMaybe(PDFName.of("First"), PDFDict));
    }
  };
  walk(pdf.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict)?.lookupMaybe(PDFName.of("First"), PDFDict));
  for (const page of pdf.getPages()) {
    const annots = page.node.Annots();
    for (let k = 0; annots && k < annots.size(); k++) {
      const annot = annots.lookupMaybe(k, PDFDict);
      if (annot) retarget(destOf(annot));
    }
  }
}

/** Splits a two-up PDF in place, keeping the file as it came at `keep`. Returns how many sheets were
 * split (0 when the book isn't two-up, or the file can't be rewritten and is read as it is). */
export async function splitTwoUp(path: string, keep: string): Promise<number> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: false, verbosity: 0 })
    .promise;
  let cuts: (Cut | null)[] | null;
  try {
    cuts = await detectSpreads(doc);
  } finally {
    await doc.destroy();
  }
  if (!cuts) return 0;
  renameSync(path, keep);
  try {
    return await splitSheets(keep, path, cuts);
  } catch (error) {
    console.warn("[ingest] couldn't split the two-up PDF, reading it as it is:", (error as Error).message);
    renameSync(keep, path);
    return 0;
  }
}
