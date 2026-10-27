/* Finding the graph's items by place: the one under the pointer (from a grid of where they are, so a
 * pointer move doesn't look at every item), and the nearest one in an arrow key's direction. */

export interface Placed {
  x: number;
  y: number;
  /** The circle's radius. */
  r: number;
}

/** Items bucketed by where they are, for finding the one at a point. */
export class Grid<T extends Placed> {
  private cells = new Map<string, T[]>();
  private size = 64;

  /** Buckets the items (again, after they've moved). */
  build(items: T[]) {
    this.cells.clear();
    let largest = 16;
    for (const item of items) largest = Math.max(largest, item.r);
    // a cell at least as big as the largest item reaches across it: neighbours are enough to look in
    this.size = Math.max(64, largest * 2 + 16);
    for (const item of items) {
      if (!Number.isFinite(item.x)) continue;
      const key = this.key(item.x, item.y);
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    }
  }

  private key(x: number, y: number) {
    return `${Math.floor(x / this.size)},${Math.floor(y / this.size)}`;
  }

  /** The item whose circle (grown by `slop`) holds the point, the nearest if several do; `keep` leaves out
   * the ones not shown. */
  at(x: number, y: number, slop: number, keep: (item: T) => boolean = () => true): T | null {
    const cx = Math.floor(x / this.size),
      cy = Math.floor(y / this.size);
    let best: T | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cy - 1; j <= cy + 1; j++)
        for (const item of this.cells.get(`${i},${j}`) || []) {
          const d = Math.hypot(item.x - x, item.y - y);
          if (d <= item.r + slop && d - item.r < bestD && keep(item)) {
            best = item;
            bestD = d - item.r;
          }
        }
    return best;
  }
}

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

/** The item an arrow key moves to from `from`: the nearest one that way, the more in line the better. */
export function nextInDirection<T extends Placed>(items: T[], from: T, key: string): T | null {
  const dir = DIRECTIONS[key];
  if (!dir) return null;
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (item === from) continue;
    const dx = item.x - from.x,
      dy = item.y - from.y;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 0) continue;
    const across = Math.abs(dx * dir[1] - dy * dir[0]);
    // within about 63° of the key's way, the ones off to the side counting as further
    if (across > along * 2) continue;
    const score = along + across * 2;
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}
