/* Laying the graph out without holding up the page: the force layout runs in a worker
 * (layout.worker.ts), and where each item ended up is kept for each vault, in memory and in this
 * browser's storage, so the Brain opens where it was left and only new items have to find their place. */
import { shownVault } from "../../api/client";
import type { FromLayout, LayoutLink, LayoutNode, ToLayout } from "./layout.worker";

export type { LayoutLink, LayoutNode };

type Positions = Map<string, [number, number]>;
const kept = new Map<string, Positions>();
const storageKey = () => `classroom:graph-layout:${shownVault() ?? "vault"}`;

/** Where the open vault's items were last laid out. */
export function keptPositions(): Positions {
  const key = storageKey();
  let positions = kept.get(key);
  if (!positions) {
    positions = new Map();
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}") as Record<string, [number, number]>;
      for (const [id, xy] of Object.entries(saved)) if (Array.isArray(xy)) positions.set(id, xy);
    } catch {
      // nothing kept (or storage is off): the graph is laid out afresh
    }
    kept.set(key, positions);
  }
  return positions;
}

let saveTimer: ReturnType<typeof setTimeout> | 0 = 0;
/** Keeps where these items are; written to storage a moment after the layout comes to rest. */
export function keepPositions(ids: string[], xy: Float32Array, rested: boolean) {
  const positions = keptPositions();
  ids.forEach((id, i) => {
    positions.set(id, [xy[i * 2], xy[i * 2 + 1]]);
  });
  if (!rested) return;
  const key = storageKey();
  if (saveTimer) clearTimeout(saveTimer);
  // a deadline: the last layout to rest within it is the one written
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    try {
      const out: Record<string, [number, number]> = {};
      for (const [id, [x, y]] of positions) out[id] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      localStorage.setItem(key, JSON.stringify(out));
    } catch {
      // storage full or off: the layout is kept in memory only
    }
  }, 500);
}

/** One graph's layout, running in its own worker. */
export class Layout {
  private worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
  private gen = 0;

  constructor(onPositions: (xy: Float32Array, done: boolean) => void) {
    this.worker.addEventListener("message", (e: MessageEvent<FromLayout>) => {
      // what a graph laid out before this one settled into is of no use any more
      if (e.data.gen === this.gen) onPositions(e.data.xy, e.data.done);
    });
  }

  private send(m: ToLayout) {
    this.worker.postMessage(m);
  }

  /** Lays out a graph; `alpha` below 1 settles a layout that is mostly there. */
  start(nodes: LayoutNode[], links: LayoutLink[], room: { aspect: number; spread: number }, alpha: number) {
    this.gen++;
    this.send({ type: "graph", gen: this.gen, nodes, links, ...room, alpha });
  }
  /** Holds an item where the pointer has it, the others moving round it. */
  drag(i: number, x: number, y: number) {
    this.send({ type: "drag", i, x, y });
  }
  release(i: number) {
    this.send({ type: "release", i });
  }
  stop() {
    this.worker.terminate();
  }
}
