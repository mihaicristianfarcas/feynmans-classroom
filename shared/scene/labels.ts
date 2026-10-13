/* Greedy label placement: each label tries a few spots near its anchor and takes the first one that
 * stays inside the stage and clear of earlier labels and reserved marks. */
import { textWidth } from "./svg.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box, pad = 1.5) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export class Labels {
  boxes: Box[] = [];
  constructor(private bounds: Box) {}

  reserve(box: Box) {
    this.boxes.push(box);
  }

  free(box: Box) {
    const b = this.bounds;
    if (box.x < b.x || box.y < b.y || box.x + box.w > b.x + b.w || box.y + box.h > b.y + b.h) return false;
    return !this.boxes.some((o) => overlaps(o, box));
  }

  /**
   * Places a text label near (x, y). Candidates are [dx, dy, anchor] offsets for the text's
   * baseline point. Returns the chosen point and anchor (the last candidate when none is free).
   */
  place(
    x: number,
    y: number,
    label: string,
    size: number,
    candidates: [number, number, "start" | "middle" | "end"][],
    mono = false,
  ): { x: number; y: number; anchor: "start" | "middle" | "end" } {
    return this.tryPlace(x, y, label, size, candidates, mono, false)!;
  }

  /** Like place(), but gives up (null) when every spot is taken. */
  placeOptional(
    x: number,
    y: number,
    label: string,
    size: number,
    candidates: [number, number, "start" | "middle" | "end"][],
    mono = false,
  ) {
    return this.tryPlace(x, y, label, size, candidates, mono, true);
  }

  private tryPlace(
    x: number,
    y: number,
    label: string,
    size: number,
    candidates: [number, number, "start" | "middle" | "end"][],
    mono: boolean,
    optional: boolean,
  ): { x: number; y: number; anchor: "start" | "middle" | "end" } | null {
    const w = textWidth(label, size, mono) + 2;
    const h = size * 1.05;
    const boxOf = (px: number, py: number, anchor: string): Box => ({
      x: anchor === "start" ? px : anchor === "end" ? px - w : px - w / 2,
      y: py - size * 0.82,
      w,
      h,
    });
    for (const [dx, dy, anchor] of candidates) {
      const box = boxOf(x + dx, y + dy, anchor);
      if (this.free(box)) {
        this.boxes.push(box);
        return { x: x + dx, y: y + dy, anchor };
      }
    }
    if (optional) return null;
    const [dx, dy, anchor] = candidates[0];
    this.boxes.push(boxOf(x + dx, y + dy, anchor));
    return { x: x + dx, y: y + dy, anchor };
  }
}

/** Candidate offsets around a point, best first. */
export const AROUND: [number, number, "start" | "middle" | "end"][] = [
  [9, -9, "start"],
  [-9, -9, "end"],
  [9, 16, "start"],
  [-9, 16, "end"],
  [0, -13, "middle"],
  [0, 22, "middle"],
  [14, 4, "start"],
  [-14, 4, "end"],
];
