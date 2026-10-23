/* A book as the library and Today show it: a cover set like a book's (a spine in the book's pastel, its
 * title in the serif, its author at the foot), and how far through it you are as a thin bar with a line
 * that says it. */
import type { CSSProperties } from "react";
import type { BookProgress } from "../api";
import { toneOf } from "./ui";

export function BookCover({
  id,
  title,
  author,
  size = "",
  hidden = false,
}: {
  id: string;
  title: string;
  author?: string;
  size?: "" | "small" | "tiny";
  /** The title and author are said beside it, so the cover is only a picture of them. */
  hidden?: boolean;
}) {
  return (
    <span className={`book-cover ${size}`} data-tone={toneOf(id)} aria-hidden={hidden || undefined}>
      <span className="book-cover-title">{title}</span>
      {author && size !== "tiny" ? <span className="book-cover-author">{author}</span> : null}
    </span>
  );
}

/** A thin bar filled to `value` (0–1); what it means is said beside it, so it is hidden from screen readers. */
export function Meter({ value, tone = "" }: { value: number; tone?: string }) {
  return (
    <span className="meter" data-tone={tone || undefined} aria-hidden="true">
      <span style={{ "--p": Math.max(0.015, value) } as CSSProperties} />
    </span>
  );
}

/** "16% through", "Finished", or "Not started", and at the recent pace when you'd finish. */
export function progressText(progress: BookProgress | null | undefined, withPace = false): string {
  if (!progress) return "Not started";
  if (progress.fraction >= 1) return "Finished";
  const pct = `${Math.max(1, Math.round(progress.fraction * 100))}% through`;
  return withPace && progress.finishIn ? `${pct}, ${progress.finishIn} to go` : pct;
}
