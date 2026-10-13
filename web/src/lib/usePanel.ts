/* Side panels you can resize and close (the notes' list and links, the reader's study panel, the Brain's
 * legend and card). Each keeps its width in localStorage under its own name: dragging its inner edge
 * (PanelEdge) sets it, dragging well past its narrowest width closes it (kept as 0), and its button
 * (PanelToggle) opens it again at its default width. */
import { type CSSProperties, type RefObject, useCallback, useRef, useState } from "react";

export interface PanelSizes {
  /** The width it opens at, in pixels. */
  initial: number;
  min: number;
  max: number;
}

export interface Panel extends PanelSizes {
  /** The panel element's id: its edge and its button control it. */
  id: string;
  /** The custom property that carries the width (`width: var(...)` in the panel's styles). */
  cssVar: string;
  /** For the element `style` goes on (the panel, or a box around it): its edge sets the width there while dragging. */
  ref: (el: HTMLElement | null) => void;
  host: RefObject<HTMLElement | null>;
  style: CSSProperties;
  /** The width in pixels, 0 when closed. */
  width: number;
  open: boolean;
  /** Sets and keeps the width: under half the narrowest closes the panel, the rest is kept within its sizes. */
  setWidth: (width: number) => void;
  toggle: () => void;
  /** Opens it at its default width if it's closed. */
  expand: () => void;
}

const KEY = "classroom-panel-";

/** The id of panel `name`'s element (its edge and button point at it). */
export const panelId = (name: string) => `panel-${name}`;

/** Where a drag (or a key) of the edge leaves the panel: closed well below its narrowest width, else within its sizes. */
export const fitWidth = (width: number, { min, max }: PanelSizes) =>
  width < min / 2 ? 0 : Math.round(Math.min(max, Math.max(min, width)));

/** The width kept for panel `name` (its default if none is kept yet, or 0 if it starts `closed`). */
export function savedWidth(name: string, sizes: PanelSizes, closed = false) {
  try {
    const saved = localStorage.getItem(KEY + name);
    if (saved === null) return closed ? 0 : sizes.initial;
    const width = Number(saved);
    return Number.isFinite(width) ? fitWidth(width, sizes) : sizes.initial;
  } catch {
    return closed ? 0 : sizes.initial;
  }
}

/** A side panel's width, kept per `name`. With `closed`, it starts closed until it's opened once. */
export function usePanel(name: string, sizes: PanelSizes & { closed?: boolean }): Panel {
  const { initial, min, max, closed = false } = sizes;
  const [width, setState] = useState(() => savedWidth(name, sizes, closed));
  const host = useRef<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    host.current = el;
  }, []);
  const cssVar = `--${name}-w`;
  /** Changes the width from what it is now, and keeps it. */
  const change = useCallback(
    (next: (width: number) => number) =>
      setState((width) => {
        const w = fitWidth(next(width), { initial, min, max });
        try {
          localStorage.setItem(KEY + name, String(w));
        } catch {}
        return w;
      }),
    [name, initial, min, max],
  );
  const setWidth = useCallback((next: number) => change(() => next), [change]);
  const toggle = useCallback(() => change((width) => (width ? 0 : initial)), [change, initial]);
  const expand = useCallback(() => change((width) => width || initial), [change, initial]);
  return {
    id: panelId(name),
    cssVar,
    ref,
    host,
    style: { [cssVar]: `${width}px` } as CSSProperties,
    width,
    open: width > 0,
    initial,
    min,
    max,
    setWidth,
    toggle,
    expand,
  };
}
