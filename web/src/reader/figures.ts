/* Every figure in a book, as one list in reading order: the figures drawn from passages in the margin
 * (scene figures and animations) and the chapter's own figures (scenes and hand-built demos), each
 * numbered within its chapter ("Fig 3.2") and placed in its chapter and section. */
import { figurePrefix } from "../../../shared/chapters.ts";
import type { Annotation, Book, Demo, Loc, TocEntry } from "../api";
import { posOf } from "../api";
import { chapterAt } from "./position";

export interface FigureEntry {
  id: string;
  /** "Fig 3.2": the chapter's number, then its place in the chapter. */
  fig: string;
  title: string;
  caption: string;
  /** Where its passage is: a reading position, and the place to jump to. */
  at: number;
  loc: Loc;
  quote: string;
  chapter: TocEntry | null;
  section: { id: string; title: string } | null;
  status: "ready" | "pending" | "failed";
  error?: string;
  /** A scene the platform draws, an animation (ManimGX), or a demo Codex built by hand. */
  kind: "scene" | "animation" | "handbuilt";
  scene?: unknown;
  /** The animation's Python source. */
  animation?: string;
  annotation?: Annotation;
  demo?: Demo;
  created: string;
}

/** The scene spec in an annotation's ```figure block, if it has one. */
export function sceneIn(body: string): unknown | null {
  const m = /```figure\s*\n([\s\S]*?)\n```/.exec(body);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** The Python source in an annotation's ```manim block, if it has one. */
export function animationIn(body: string): string | null {
  return /```manim\s*\n([\s\S]*?)\n```/.exec(body)?.[1] ?? null;
}

/** The caption under a figure's title: the text between its "## Title" and its block. */
function captionIn(body: string) {
  return (
    body
      .split(/```(?:figure|manim)/)[0]
      .replace(/^##[^\n]*\n/, "")
      .trim()
      .split(/\n\n/)[0] || ""
  );
}

const sectionAt = (chapter: TocEntry | null, at: number) =>
  [...(chapter?.sections || [])].reverse().find((s) => posOf(s.start) <= at + 1e-6) || null;

export function figureEntries(book: Book, demos: Demo[], annotations: Annotation[]): FigureEntry[] {
  const entries: FigureEntry[] = [];
  for (const a of annotations) {
    if (a.type !== "visualize") continue;
    const loc: Loc =
      a.source.page !== undefined ? { page: a.source.page, y: a.source.y ?? 0 } : { block: a.source.block ?? 0 };
    const at = posOf(loc);
    const chapter = chapterAt(book, at);
    const animation = animationIn(a.body);
    entries.push({
      id: a.id,
      fig: "",
      title: a.title || (a.status === "pending" ? "Drawing…" : "A figure"),
      caption: captionIn(a.body),
      at,
      loc,
      quote: a.source.quote,
      chapter,
      section: sectionAt(chapter, at),
      status: a.status,
      error: a.error,
      kind: animation ? "animation" : "scene",
      scene: animation ? undefined : sceneIn(a.body) || undefined,
      animation: animation || undefined,
      annotation: a,
      created: a.created,
    });
  }
  for (const d of demos) {
    const at = posOf(d.anchor);
    const chapter = book.toc.find((c) => c.id === d.chapterId) || chapterAt(book, at);
    entries.push({
      id: d.id,
      fig: "",
      title: d.brief.eyebrow || d.brief.title,
      caption: d.brief.caption || "",
      at,
      loc: d.anchor,
      quote: d.anchor.quote,
      chapter,
      section: sectionAt(chapter, at),
      status: d.status === "ready" ? "ready" : d.status === "failed" ? "failed" : "pending",
      error: d.error,
      kind: d.type === "scene" ? "scene" : "handbuilt",
      scene: d.type === "scene" ? d.scene : undefined,
      demo: d,
      created: d.createdAt,
    });
  }
  entries.sort((a, b) => a.at - b.at || a.created.localeCompare(b.created));
  // numbered in reading order within each chapter
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = e.chapter?.id || "";
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    e.fig = `Fig ${figurePrefix(
      book.toc,
      book.toc.findIndex((c) => c.id === e.chapter?.id),
    )}.${n}`;
  }
  return entries;
}
