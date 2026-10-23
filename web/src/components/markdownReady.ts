/* What a Markdown text shows that comes from elsewhere (pictures, math, embedded notes and figures),
 * loaded ahead so the text is drawn whole at once instead of growing as each part arrives: a picture's
 * size is known before it is drawn (so the text around it never moves), KaTeX is in, and embeds are kept
 * (lib/cache.ts) for Markdown to show at once. Markdown reads what is kept here; prepareMarkdown fills it. */
import type { Options } from "react-markdown";
import { type Doc, docs, learn, type Resolved } from "../api";
import { cached, keep } from "../lib/cache";

/* ---------------- pictures ---------------- */

/** Where a picture in the vault is served from: `![[name.png]]` names it in attachments/ unless given a path. */
export const pictureUrl = (target: string) =>
  `/api/vault/attachment?path=${encodeURIComponent(target.includes("/") ? target : `attachments/${target}`)}`;

/** Where a Markdown image (`![alt](src)`) is served from: the web as it is, else the vault's attachments. */
export const imageUrl = (src: string) =>
  /^(https?:|data:image\/)/.test(src)
    ? src
    : `/api/vault/attachment?path=${encodeURIComponent(src.startsWith("attachments/") ? src : `attachments/${src}`)}`;

const PICTURE = /\.(png|jpe?g|gif|webp|svg)$/i;
export const isPicture = (target: string) => PICTURE.test(target);

const sizes = new Map<string, { w: number; h: number }>();

/** A picture's size, if it has loaded this visit. */
export const pictureSize = (url: string) => sizes.get(url);

/** Keeps the size of a picture that has loaded. */
export function rememberPicture(url: string, img: HTMLImageElement) {
  if (img.naturalWidth && img.naturalHeight) sizes.set(url, { w: img.naturalWidth, h: img.naturalHeight });
}

/** Loads a picture into the browser's cache and keeps its size (a broken one is let go). */
function loadPicture(url: string): Promise<void> {
  if (sizes.has(url)) return Promise.resolve();
  const img = new Image();
  img.src = url;
  return img.decode().then(
    () => rememberPicture(url, img),
    () => {},
  );
}

/* ---------------- math ---------------- */

type Plugins = NonNullable<Options["rehypePlugins"]>;
let katex: Plugins | null = null;
let loadingKatex: Promise<Plugins> | null = null;

/** KaTeX's plugin, once it has loaded. */
export const mathPlugins = () => katex;

/** The faces nearly all math is set in, loaded with KaTeX so formulas don't settle as they swap in. */
const MATH_FACES = ["1em KaTeX_Main", "italic 1em KaTeX_Math", "1em KaTeX_Size1", "1em KaTeX_Size2"];

/** Loads KaTeX (half a megabyte, so only for a text with math in it) and its main faces. */
export function loadMath(): Promise<Plugins> {
  loadingKatex ??= Promise.all([import("rehype-katex"), import("katex/dist/katex.min.css")]).then(async ([m]) => {
    await Promise.all(MATH_FACES.map((face) => document.fonts.load(face))).catch(() => {});
    katex = [[m.default, { throwOnError: false, strict: false }]];
    return katex;
  });
  return loadingKatex;
}

/** Whether a text has math in it: $…$, $$…$$, \(…\) or \[…\]. */
export const hasMath = (text: string) => /\$|\\\(|\\\[/.test(text);

/* ---------------- embeds ---------------- */

/** What an embedded document shows: its body, a concept with its summary first, an annotation under its passage. */
export function embedBody(doc: Doc) {
  if (doc.kind === "concept") return `**${doc.title}**: ${doc.summary}\n\n${doc.body}`;
  if (doc.kind === "annotation") return `> ${doc.source.quote.replace(/\n/g, "\n> ")}\n\n${doc.body}`;
  return doc.body;
}

export type Embedded = { resolved: Resolved; body: string };
const embedKey = (target: string, sub?: string) => `embed:${target}#${sub ?? ""}`;
const figureKey = (id: string) => `figure:${id}`;

/** An embedded file as it was last loaded, if it was. */
export const keptEmbed = (target: string, sub?: string) => cached<Embedded>(embedKey(target, sub));
/** An embedded figure's scene as it was last loaded, if it was. */
export const keptFigure = (id: string) => cached<{ scene: unknown }>(figureKey(id));

/** Loads an embedded file (a note, a concept, an annotation…) and keeps it. */
export async function loadEmbed(target: string, sub?: string): Promise<Embedded> {
  const resolved = await learn.resolve(target, sub);
  const body = resolved.kind === "book" || resolved.kind === "attachment" ? "" : embedBody(await docs.get(resolved.id));
  const embedded = { resolved, body };
  keep(embedKey(target, sub), embedded);
  return embedded;
}

/** Loads an embedded figure and keeps its scene. */
export async function loadFigure(id: string): Promise<{ scene: unknown }> {
  const doc = await docs.get(id);
  if (doc.kind !== "figure") throw new Error("not a figure");
  const figure = { scene: doc.scene };
  keep(figureKey(id), figure);
  return figure;
}

/* ---------------- all of it ---------------- */

const EMBED = /!\[\[([^[\]\n|#]*)(?:#([^[\]\n|]*))?(?:\|[^[\]\n]*)?\]\]/g;
const IMAGE = /!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
/** How long a text waits for what it shows before it's drawn anyway (the rest then arrives in place). */
const WAIT = 1500;
/** How deep embeds inside embeds are loaded (Markdown draws three levels). */
const DEPTH = 2;

/**
 * Loads what a Markdown text shows from elsewhere, for at most a moment and a half: its pictures (and
 * their sizes), KaTeX if it has math, and its embedded files and figures (and what those show in turn).
 * What was loaded before isn't loaded again; what fails is left for the text to say.
 */
export function prepareMarkdown(text: string): Promise<void> {
  const all = prepare(text, 0);
  return Promise.race([all, new Promise<void>((done) => setTimeout(done, WAIT))]);
}

async function prepare(text: string, depth: number): Promise<void> {
  const work: Promise<unknown>[] = [];
  if (hasMath(text) && !katex) work.push(loadMath().catch(() => {}));
  for (const [, src] of text.matchAll(IMAGE)) work.push(loadPicture(imageUrl(src)));
  for (const [, rawTarget, rawSub] of text.matchAll(EMBED)) {
    const target = rawTarget.trim();
    const sub = rawSub?.trim() || undefined;
    if (!target) continue;
    if (isPicture(target)) work.push(loadPicture(pictureUrl(target)));
    else if (/^figure:/i.test(target)) {
      const id = target.slice(7).trim();
      if (!keptFigure(id)) work.push(loadFigure(id).catch(() => {}));
    } else if (depth < DEPTH) {
      const kept = keptEmbed(target, sub);
      work.push(
        (kept ? Promise.resolve(kept) : loadEmbed(target, sub)).then(
          (e) => prepare(e.body, depth + 1),
          () => {},
        ),
      );
    }
  }
  await Promise.all(work);
}
