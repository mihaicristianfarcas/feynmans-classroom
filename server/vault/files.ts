/* Reading and writing vault files: paths, ids, atomic writes, YAML frontmatter, and the small
 * coercions that turn hand-edited frontmatter into typed fields. */
import { createHash, randomUUID } from "node:crypto";
import { Document, isScalar, parse as parseYaml, visit } from "yaml";

export { atomicWrite } from "../fs.ts";

export const now = () => new Date().toISOString();

/** Lowercase ASCII words joined by dashes, for file and folder names. */
export function slugify(text: string, max = 60): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/, "") || "untitled"
  );
}
/** A short random id with a type prefix ("n1a2b3c4d" for a note). */
export const shortId = (prefix: string) => `${prefix}${randomUUID().replace(/-/g, "").slice(0, 8)}`;

/** Splits `---` YAML frontmatter from the body; malformed YAML reads as no frontmatter. */
export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  try {
    const data = parseYaml(m[1]);
    return {
      data: data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
      body: m[2],
    };
  } catch {
    return { data: {}, body: text };
  }
}

/** Writes frontmatter (empty fields left out) and a body, in the shape Obsidian writes. */
export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length)),
  );
  const doc = new Document(clean);
  // short lists of plain values on one line: tags: [a, b], rects: [0.1, 0.4, 0.7, 0.02]
  visit(doc, {
    Seq(_, node) {
      if (node.items.length <= 8 && node.items.every((i) => isScalar(i))) node.flow = true;
    },
  });
  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd();
  return `---\n${yaml === "{}" ? "" : yaml}\n---\n\n${body.trim()}\n`;
}

export const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined).map(String) : typeof v === "string" && v ? [v] : [];
export const asString = (v: unknown, d = "") => (v === undefined || v === null ? d : String(v));
export const iso = (v: unknown, fallback?: string) =>
  v instanceof Date ? v.toISOString() : v ? String(v) : fallback || new Date().toISOString();
/** The frontmatter fields a reader doesn't know, kept so a rewrite doesn't lose them. */
export const extraProps = (data: Record<string, unknown>, known: string[]) => {
  const extra = Object.fromEntries(Object.entries(data).filter(([k]) => !known.includes(k)));
  return Object.keys(extra).length ? extra : undefined;
};
/** A stable id for a file that has none in its frontmatter (a note written in Obsidian or by an agent). */
export const pathId = (rel: string) => `p${createHash("sha1").update(rel).digest("hex").slice(0, 9)}`;

/** A finite number, or undefined. */
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
