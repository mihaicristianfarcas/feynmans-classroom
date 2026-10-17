/* The strip between the panes and the book: a mark beside each figure's anchor (lit for the active one). */
import type { Demo, Loc } from "../api";
import type { ReaderHandle } from "./readers";

export interface DemoMarker {
  id: string;
  top: number;
  status: Demo["status"];
  fig: string;
  title: string;
}

/** Where on screen (px from the pane's top) a location is, or null when it is out of view. */
function topOf(reader: ReaderHandle, box: DOMRect, loc: Loc): number | null {
  const y = reader.clientYOf(loc);
  return y === null || y < box.top + 6 || y > box.bottom - 6 ? null : y - box.top;
}

export function demoMarkers(reader: ReaderHandle, box: DOMRect, demos: Demo[]): DemoMarker[] {
  return demos.flatMap((demo) => {
    const top = topOf(reader, box, demo.anchor);
    return top === null
      ? []
      : [{ id: demo.id, top, status: demo.status, fig: demo.fig, title: demo.brief.eyebrow || demo.brief.title }];
  });
}

/** Keeps the old list when nothing visibly moved, so scrolling doesn't re-render for nothing. */
export function sameMarkers<T extends { id: string; top: number; status?: string }>(old: T[], next: T[]): T[] {
  return old.length === next.length &&
    old.every((m, i) => m.id === next[i].id && Math.abs(m.top - next[i].top) < 0.5 && m.status === next[i].status)
    ? old
    : next;
}

export function Gutter({
  demos,
  activeId,
  onDemo,
}: {
  demos: DemoMarker[];
  activeId: string | undefined;
  onDemo: (id: string) => void;
}) {
  return (
    <div className="gutter">
      {demos.map((m) => (
        <button
          type="button"
          key={m.id}
          className="anchor"
          data-active={activeId === m.id || undefined}
          data-status={m.status}
          style={{ top: m.top }}
          title={`${m.fig} · ${m.title}`}
          aria-label={`${m.fig}: ${m.title}`}
          onClick={() => onDemo(m.id)}
        />
      ))}
    </div>
  );
}
