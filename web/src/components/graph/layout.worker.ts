/* The graph's layout, off the page's thread: a force simulation (d3-force) of the items and their links,
 * run in short slices so a drag reaches it between them, posting where every item is. A first layout
 * posts once it is nearly calm (the graph opens settled, not flying apart); after that, and while an
 * item is dragged, every slice is posted until it comes to rest. The page's side is layout.ts. */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export interface LayoutNode {
  kind: "book" | "concept" | "note" | "annotation";
  /** The circle's radius. */
  r: number;
  /** Whether its name is always shown, and how wide that name is. */
  named: boolean;
  labelWidth: number;
  x?: number;
  y?: number;
}
export interface LayoutLink {
  source: number;
  target: number;
  kind: string;
}
export type ToLayout =
  | {
      type: "graph";
      gen: number;
      nodes: LayoutNode[];
      links: LayoutLink[];
      /** The room's width over its height, and how far apart a small graph spreads to fill it. */
      aspect: number;
      spread: number;
      /** 1 lays it out afresh; less settles items into a layout that is mostly there. */
      alpha: number;
    }
  | { type: "drag"; i: number; x: number; y: number }
  | { type: "release"; i: number };
export interface FromLayout {
  gen: number;
  /** x and y of each item in turn. */
  xy: Float32Array;
  done: boolean;
}

type N = SimulationNodeDatum & LayoutNode;
type Link = SimulationLinkDatum<N> & { kind: string };
type Box = { x0: number; x1: number; h: number };

/** The box an item takes up around its centre: its circle, and its name to the right if it is named. */
const box = (n: N): Box => ({
  x0: -n.r - 2,
  x1: n.r + (n.named ? 8 + n.labelWidth : 2),
  h: Math.max(16, n.r * 2 + 2),
});
/** The room kept between one item's box and the next: across, and above and below. */
const GAP_X = 20;
const GAP_Y = 12;
/** A first layout is posted once it is this calm. */
const CALM = 0.03;
/** How long a slice runs before the worker listens for messages again. */
const SLICE_MS = 12;

/** Keeps the names always shown clear of each other and of other items: two boxes that overlap (with the
 * gap between them) are pushed apart along the shorter way out. */
function forceLabels() {
  let list: { n: N; b: Box }[] = [];
  const left = (e: (typeof list)[number]) => e.n.x! + e.b.x0;
  const force = () => {
    // in order from the left, each box only meets the ones that start before it ends
    list.sort((p, q) => left(p) - left(q));
    for (let i = 0; i < list.length; i++) {
      const { n: a, b: ba } = list[i];
      const end = a.x! + ba.x1 + GAP_X;
      for (let j = i + 1; j < list.length && left(list[j]) < end; j++) {
        // two circles without names are forceCollide's to keep apart
        if (!a.named && !list[j].n.named) continue;
        const { n: b, b: bb } = list[j];
        const ox = Math.min(end, b.x! + bb.x1 + GAP_X) - left(list[j]);
        const oy = (ba.h + bb.h) / 2 + GAP_Y - Math.abs(a.y! - b.y!);
        if (oy <= 0) continue;
        if (oy < ox) {
          const push = (a.y! < b.y! ? -1 : 1) * oy * 0.25;
          a.vy! += push;
          b.vy! -= push;
        } else {
          const push = (a.x! < b.x! ? -1 : 1) * ox * 0.25;
          a.vx! += push;
          b.vx! -= push;
        }
      }
    }
  };
  force.initialize = (nodes: N[]) => {
    list = nodes.map((n) => ({ n, b: box(n) }));
  };
  return force;
}

/** Gives the graph the shape of the room it's drawn in: while it is narrower than that, items are spread
 * apart sideways from the middle out (or up and down while it's flatter). It only ever spreads. */
function forceShape(aspect: number) {
  let list: { n: N; b: Box }[] = [];
  const force = (alpha: number) => {
    let x0 = Number.POSITIVE_INFINITY,
      x1 = Number.NEGATIVE_INFINITY,
      y0 = Number.POSITIVE_INFINITY,
      y1 = Number.NEGATIVE_INFINITY;
    for (const { n, b } of list) {
      x0 = Math.min(x0, n.x! + b.x0);
      x1 = Math.max(x1, n.x! + b.x1);
      y0 = Math.min(y0, n.y! - b.h / 2);
      y1 = Math.max(y1, n.y! + b.h / 2);
    }
    const off = Math.log(aspect / ((x1 - x0) / (y1 - y0) || 1));
    if (!Number.isFinite(off) || Math.abs(off) < 0.02) return;
    const k = alpha * 0.6 * Math.min(1, Math.abs(off));
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    for (const { n } of list) {
      if (off > 0) n.vx! += (n.x! - cx) * k;
      else n.vy! += (n.y! - cy) * k;
    }
  };
  force.initialize = (nodes: N[]) => {
    list = nodes.map((n) => ({ n, b: box(n) }));
  };
  return force;
}

let sim: Simulation<N, Link> | null = null;
let nodes: N[] = [];
let gen = 0;
let posted = false;
let timer: ReturnType<typeof setTimeout> | 0 = 0;

function post(done: boolean) {
  const xy = new Float32Array(nodes.length * 2);
  nodes.forEach((n, i) => {
    xy[i * 2] = n.x!;
    xy[i * 2 + 1] = n.y!;
  });
  posted = true;
  (self as unknown as Worker).postMessage({ gen, xy, done } satisfies FromLayout, [xy.buffer]);
}

/** Runs the layout for one slice, posts it (once a first layout is calm), and carries on until it rests. */
function run() {
  timer = 0;
  if (!sim) return;
  const start = performance.now();
  while (performance.now() - start < SLICE_MS && sim.alpha() >= sim.alphaMin()) sim.tick();
  const resting = sim.alpha() < sim.alphaMin();
  if (posted || resting || sim.alpha() < CALM) post(resting);
  // a timeout of 0 between slices lets a drag's messages in: the work goes on until the layout rests
  if (!resting) timer = setTimeout(run, 0);
}
const wake = () => {
  if (!timer) timer = setTimeout(run, 0);
};

function layOut(m: Extract<ToLayout, { type: "graph" }>) {
  if (timer) clearTimeout(timer);
  timer = 0;
  sim?.stop();
  gen = m.gen;
  posted = false;
  nodes = m.nodes.map((n) => ({ ...n }));
  const { aspect, spread } = m;
  // links hold an item with few of them close (a note on one book stays by it), a hub more loosely
  const degree = new Uint32Array(nodes.length);
  for (const l of m.links) {
    degree[l.source]++;
    degree[l.target]++;
  }
  sim = forceSimulation<N, Link>(nodes)
    .force(
      "link",
      forceLink<N, Link>(m.links.map((l) => ({ ...l })))
        .distance((l) => spread * (l.kind === "related" ? 100 : l.kind === "source" ? 110 : 70))
        .strength(
          (l) =>
            (l.kind === "source" ? 0.5 : 1) /
            Math.max(1, Math.min(degree[(l.source as N).index!], degree[(l.target as N).index!])),
        ),
    )
    .force(
      "charge",
      // pushing only across a short way, so the graph fills evenly and nothing is flung far off
      forceManyBody<N>()
        .strength((d) => spread ** 2 * (d.kind === "book" ? -500 : d.kind === "concept" ? -300 : -200))
        .distanceMax(spread * 320),
    )
    .force(
      "collide",
      forceCollide<N>()
        .radius((d) => d.r + (d.kind === "book" ? 50 : d.kind === "concept" ? 36 : 24))
        .strength(0.9),
    )
    .force("labels", forceLabels())
    .force("shape", forceShape(aspect))
    .force("x", forceX(0).strength(0.06 / aspect))
    .force("y", forceY(0).strength(0.06 * aspect))
    .alphaDecay(0.035)
    .alpha(m.alpha)
    .stop();
  // a layout that is already there settles in view, every slice posted
  if (m.alpha < 1) posted = true;
  wake();
}

self.addEventListener("message", (e: MessageEvent<ToLayout>) => {
  const m = e.data;
  if (m.type === "graph") layOut(m);
  else if (sim && nodes[m.i]) {
    const n = nodes[m.i];
    if (m.type === "drag") {
      n.fx = m.x;
      n.fy = m.y;
      sim.alphaTarget(0.2);
      if (sim.alpha() < 0.2) sim.alpha(0.2);
    } else {
      n.fx = null;
      n.fy = null;
      sim.alphaTarget(0);
    }
    posted = true;
    wake();
  }
});
