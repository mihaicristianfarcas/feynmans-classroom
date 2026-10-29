/* The graph's layout, off the page's thread: a force simulation (d3-force) of the items and their links,
 * run in short slices so a drag reaches it between them, posting where every item is. A first layout
 * posts once it is nearly calm (the graph opens settled, not flying apart); after that every slice is
 * posted until it comes to rest. Dragging an item of a graph at rest stirs only its corner: the item stays
 * under the pointer, the items linked to it follow (finding their way round what is there), what it comes
 * up against steps aside and closes up again behind it, and everything else keeps exactly still. A stir
 * runs a step a frame, rests while the pointer holds the item still, and ends once what it moved is still
 * again, the item staying where it was let go. The page's side is layout.ts. */
import {
  type Force,
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
/** How hard links pull and items push while one is dragged: what follows catches up within a few frames,
 * without swinging far past its place. */
const STIR_ALPHA = 0.2;
/** A stir takes a step a frame: the pace of its motion, not a wait for anything. */
const FRAME_MS = 16;
/** Moving the dragged item warms it and what it links to (warmth: how much the forces on an item move it,
 * from 1, as in the layout, to 0, not at all); each step an item keeps this much of its warmth, so once
 * the pointer stops all it moved slows to a stop. */
const COOL = 0.95;
/** How near the dragged item, or what it pushes, has to come before another makes room, and how much of
 * its warmth it passes on to what it moves towards (the dragged item passes on all of it), all of that at
 * this many units a step or faster, less as it slows. The items following it don't push: they find their
 * way round what is there. */
const REACH = 24;
const PASS_ON = 0.5;
const PUSH = 2;
/** A pushed item warmer than this pushes in turn: what the dragged item pushes does, what that pushes
 * does not. */
const PASSING = 0.5;
/** How hard a pushed item is drawn back to where it was before the drag while nothing presses on it:
 * what the dragged item passes by closes up behind it, and what it is let go over stays clear of it. */
const HOME = 0.1;
/** Moving no further than this in a step is standing still, and an item cooler than this is cold. */
const STILL = 0.05;
const COLD = 0.02;

/** The room forceCollide keeps around an item, and how hard it keeps it. */
const clearance = (n: N) => n.r + (n.kind === "book" ? 50 : n.kind === "concept" ? 36 : 24);
const COLLIDE = 0.9;

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

/** A drag of a graph at rest, while it lasts. */
interface Stir {
  /** The item dragged, and whether the pointer still has it (let go, it stays where it was left). */
  i: number;
  holding: boolean;
  /** How warm each item is, whether it was warmed by a push (rather than by following), where it was
   * before the drag and after the last step, and how far that step moved it. */
  warmth: Float32Array;
  pushed: Uint8Array;
  home: Float32Array;
  at: Float32Array;
  went: Float32Array;
  /** The layout's own forces, set aside while the drag lasts. */
  aside: [string, Force<N, Link> | undefined][];
}

let sim: Simulation<N, Link> | null = null;
let nodes: N[] = [];
/** Who each item is linked to, by index; the box each takes up; and how far its circle, or its box and
 * the gap kept round it, reaches from its centre any way. */
let neighbours: number[][] = [];
let boxes: Box[] = [];
let reach = new Float32Array(0);
let stir: Stir | null = null;
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

/** The room between two items at these places (x and y of each in turn), edge to edge, as forceCollide
 * keeps them apart or (when either is named) as forceLabels does, whichever is less: below 0 they overlap. */
function room(a: number, b: number, xy: Float32Array) {
  const p = nodes[a],
    q = nodes[b];
  const dx = xy[b * 2] - xy[a * 2],
    dy = xy[b * 2 + 1] - xy[a * 2 + 1];
  const round = Math.sqrt(dx * dx + dy * dy) - clearance(p) - clearance(q);
  if (!p.named && !q.named) return round;
  const bp = boxes[a],
    bq = boxes[b];
  const across = Math.max(dx + bq.x0 - bp.x1, bp.x0 - dx - bq.x1) - GAP_X;
  const upDown = Math.abs(dy) - (bp.h + bq.h) / 2 - GAP_Y;
  return Math.min(round, Math.max(across, upDown));
}

/** Warms what the dragged item and what it pushes come up against, so it makes room: each passes on part
 * of its warmth to what is ahead of it, less the more room is left between them and the slower it goes.
 * What the dragged item is on top of (closer than it was to it before the drag) is kept as warm as the
 * dragged item, moving or not, so letting go of an item over another leaves room round it. Nothing is
 * warmer than the dragged item, which only the pointer warms: once that stops, everything cools. */
function touch(s: Stir) {
  const { warmth: w, pushed, home, at, went } = s;
  for (let a = 0; a < w.length; a++) {
    const ux = went[a * 2],
      uy = went[a * 2 + 1];
    if (a !== s.i && (!pushed[a] || w[a] <= PASSING)) continue;
    const moving = Math.max(Math.abs(ux), Math.abs(uy)) > STILL;
    if (a !== s.i && !moving) continue;
    const give = a === s.i ? w[a] : w[a] * PASS_ON;
    for (let b = 0; b < w.length; b++) {
      if (b === a || w[b] >= give) continue;
      const dx = at[b * 2] - at[a * 2],
        dy = at[b * 2 + 1] - at[a * 2 + 1];
      const far = reach[a] + reach[b] + REACH;
      if (Math.abs(dx) >= far || Math.abs(dy) >= far) continue;
      const r = room(a, b, at);
      if (r >= REACH) continue;
      let warm = 0;
      if (a === s.i && r < Math.min(0, room(a, b, home))) warm = give;
      else if (moving) {
        const toward = (ux * dx + uy * dy) / (Math.sqrt(dx * dx + dy * dy) || 1);
        if (toward > 0) warm = give * Math.min(1, 1 - r / REACH) * Math.min(1, toward / PUSH);
      }
      if (warm > w[b]) {
        w[b] = warm;
        pushed[b] = 1;
      }
    }
  }
}

/** Which way an item at (ex, ey) from the dragged item is pushed: straight away from it, unless it is
 * ahead of the item as it moves, when it is pushed to the side it is on (or to one side, if it is right
 * ahead), parting round it like water round a bow instead of being carried along in front. */
function wayOut(s: Stir, ex: number, ey: number): [number, number] {
  const ux = s.went[s.i * 2],
    uy = s.went[s.i * 2 + 1];
  const ul = Math.sqrt(ux * ux + uy * uy);
  if (ul <= STILL) return [ex, ey];
  const along = (ex * ux + ey * uy) / ul;
  if (along <= 0) return [ex, ey];
  const sx = ex - (along * ux) / ul,
    sy = ey - (along * uy) / ul;
  return Math.abs(sx) + Math.abs(sy) > 1e-3 ? [sx, sy] : [-uy, ux];
}

/** Keeps items clear of each other while one is dragged, in place of forceCollide and forceLabels: two
 * items are pushed apart only once they are closer than they were before the drag (or than the room the
 * layout keeps, if they had that), so a corner left crowded at rest stays as it is and only what the drag
 * brings together moves apart. A pushed item nothing presses on is drawn back home, and kept warm until
 * it is there. Only warm items are moved, so only they are worked out. */
function forceContact(s: Stir) {
  const { home, pushed } = s;
  // how far the boxes of a pair (one of them named) overlap, along the shorter way out (0 or less if clear)
  const into = (a: number, b: number, xy: ArrayLike<number>) => {
    const ba = boxes[a],
      bb = boxes[b];
    const ax = xy[a * 2],
      bx = xy[b * 2];
    const across = Math.min(ax + ba.x1, bx + bb.x1) + GAP_X - Math.max(ax + ba.x0, bx + bb.x0);
    const upDown = (ba.h + bb.h) / 2 + GAP_Y - Math.abs(xy[a * 2 + 1] - xy[b * 2 + 1]);
    return { across, upDown };
  };
  const xy = new Float32Array(nodes.length * 2);
  return () => {
    const w = s.warmth;
    nodes.forEach((n, j) => {
      xy[j * 2] = n.x!;
      xy[j * 2 + 1] = n.y!;
    });
    for (let a = 0; a < w.length; a++) {
      if (a === s.i || w[a] === 0) continue;
      const p = nodes[a];
      const ca = clearance(p);
      let pressed = false;
      for (let b = 0; b < w.length; b++) {
        if (b === a) continue;
        const q = nodes[b];
        const dx = xy[b * 2] - xy[a * 2],
          dy = xy[b * 2 + 1] - xy[a * 2 + 1];
        const far = reach[a] + reach[b];
        if (Math.abs(dx) >= far || Math.abs(dy) >= far) continue;
        // a's share of each push, as forceCollide and forceLabels give it: all of it against an item
        // that stays where it is
        const moves = b !== s.i && w[b] > 0;
        // the circles
        const cb = clearance(q);
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const hx = home[b * 2] - home[a * 2],
          hy = home[b * 2 + 1] - home[a * 2 + 1];
        const keep = Math.min(ca + cb, Math.sqrt(hx * hx + hy * hy));
        if (d < keep) {
          const push = (keep - d) * COLLIDE * (moves ? (cb * cb) / (ca * ca + cb * cb) : 1);
          const [ox, oy] = b === s.i ? wayOut(s, -dx, -dy) : [-dx, -dy];
          const ol = Math.sqrt(ox * ox + oy * oy) || 1;
          p.vx! += (ox / ol) * push;
          p.vy! += (oy / ol) * push;
          pressed = true;
        }
        // the names, pushed apart the shorter way out as forceLabels does
        if (!p.named && !q.named) continue;
        const now = into(a, b, xy);
        if (now.across <= 0 || now.upDown <= 0) continue;
        const then = into(a, b, home);
        const was = then.across > 0 && then.upDown > 0 ? Math.min(then.across, then.upDown) : 0;
        const over = Math.min(now.across, now.upDown) - was;
        if (over <= 0) continue;
        const push = over * (moves ? 0.25 : 0.5);
        if (now.upDown < now.across) p.vy! -= (dy > 0 ? 1 : -1) * push;
        else p.vx! -= (dx > 0 ? 1 : -1) * push;
        pressed = true;
      }
      if (pushed[a] && !pressed) {
        const hx = home[a * 2] - xy[a * 2],
          hy = home[a * 2 + 1] - xy[a * 2 + 1];
        p.vx! += hx * HOME;
        p.vy! += hy * HOME;
        // kept warm while it is away, so it gets back (never so warm that it pushes, nor warmer than the
        // dragged item)
        w[a] = Math.max(w[a], w[s.i] * PASSING * Math.min(1, Math.sqrt(hx * hx + hy * hy) / REACH));
      }
    }
  };
}

/** Starts a drag of a graph at rest. The layout's own shaping (its outline, its pull to the middle) is set
 * aside, what its links and charge already pull and push each item by is taken away again on every step,
 * and forceContact keeps items apart, so an item moves only for what the drag changes: picking one up
 * moves nothing. */
function startStir(i: number): Stir {
  const s = sim!;
  if (timer) clearTimeout(timer);
  timer = 0;
  const aside = ["collide", "labels", "shape", "x", "y"].map((name): [string, Force<N, Link> | undefined] => [
    name,
    s.force(name),
  ]);
  for (const [name] of aside) s.force(name, null);
  for (const n of nodes) {
    n.vx = 0;
    n.vy = 0;
  }
  for (const name of ["link", "charge"]) s.force(name)?.(STIR_ALPHA);
  const n = nodes.length;
  const rest = new Float32Array(n * 2);
  const home = new Float32Array(n * 2);
  nodes.forEach((p, j) => {
    rest[j * 2] = p.vx!;
    rest[j * 2 + 1] = p.vy!;
    home[j * 2] = p.x!;
    home[j * 2 + 1] = p.y!;
    p.vx = 0;
    p.vy = 0;
  });
  const stir: Stir = {
    i,
    holding: true,
    warmth: new Float32Array(n),
    pushed: new Uint8Array(n),
    home,
    at: home.slice(),
    went: new Float32Array(n * 2),
    aside,
  };
  s.force("rest", () =>
    nodes.forEach((p, j) => {
      p.vx! -= rest[j * 2];
      p.vy! -= rest[j * 2 + 1];
    }),
  ).force("contact", forceContact(stir));
  s.alpha(STIR_ALPHA).alphaTarget(STIR_ALPHA);
  return stir;
}

/** One step of a drag: the forces move each item as much as it is warm, so what the pointer warmed and
 * what that comes up against move, and the rest stays where it is. Steps go on a frame apart while
 * anything moves. */
function step() {
  timer = 0;
  const s = stir;
  if (!sim || !s) return;
  const start = performance.now();
  const { warmth: w, at, went } = s;
  const keep = 1 - sim.velocityDecay();
  // the dragged item goes where the pointer put it before anything is worked out
  const held = nodes[s.i];
  went[s.i * 2] = held.fx! - at[s.i * 2];
  went[s.i * 2 + 1] = held.fy! - at[s.i * 2 + 1];
  held.x = at[s.i * 2] = held.fx!;
  held.y = at[s.i * 2 + 1] = held.fy!;
  touch(s);
  sim.tick();
  let most = 0,
    warmest = 0;
  nodes.forEach((n, j) => {
    const k = j * 2;
    // a cooler item is moved less by the forces on it and coasts on what it had, a cold one stays where
    // it is
    if (j !== s.i) {
      n.vx = w[j] * (n.x! - at[k]) + (1 - w[j]) * keep * went[k];
      n.vy = w[j] * (n.y! - at[k + 1]) + (1 - w[j]) * keep * went[k + 1];
      n.x = at[k] + n.vx;
      n.y = at[k + 1] + n.vy;
      went[k] = n.vx;
      went[k + 1] = n.vy;
      at[k] = n.x;
      at[k + 1] = n.y;
    }
    most = Math.max(most, Math.abs(went[k]), Math.abs(went[k + 1]));
    w[j] *= COOL;
    if (j !== s.i) warmest = Math.max(warmest, w[j]);
  });
  const still = most <= STILL || warmest < COLD;
  if (still && !s.holding) return endStir();
  post(false);
  // held still, it waits for the pointer to move again
  if (!still) timer = setTimeout(step, Math.max(0, FRAME_MS - (performance.now() - start)));
}

/** Ends a drag once all it moved is still: the item stays where it was let go, the layout gets its own
 * forces back, and the graph rests. */
function endStir() {
  const s = stir!;
  const n = nodes[s.i];
  n.fx = null;
  n.fy = null;
  for (const p of nodes) {
    p.vx = 0;
    p.vy = 0;
  }
  sim!.force("rest", null).force("contact", null);
  for (const [name, force] of s.aside) if (force) sim!.force(name, force);
  sim!.alphaTarget(0).alpha(0);
  stir = null;
  post(true);
}

function layOut(m: Extract<ToLayout, { type: "graph" }>) {
  if (timer) clearTimeout(timer);
  timer = 0;
  sim?.stop();
  gen = m.gen;
  posted = false;
  stir = null;
  nodes = m.nodes.map((n) => ({ ...n }));
  boxes = nodes.map(box);
  reach = Float32Array.from(nodes, (n, j) =>
    Math.max(clearance(n), boxes[j].x1 + GAP_X, -boxes[j].x0 + GAP_X, boxes[j].h / 2 + GAP_Y),
  );
  neighbours = nodes.map(() => []);
  for (const l of m.links) {
    neighbours[l.source]?.push(l.target);
    neighbours[l.target]?.push(l.source);
  }
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
    .force("collide", forceCollide<N>().radius(clearance).strength(COLLIDE))
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
      // a layout still settling carries on round the held item
      if (!stir && sim.alpha() >= sim.alphaMin()) return;
      if (!stir) stir = startStir(m.i);
      else if (stir.i !== m.i) {
        // another item picked up before the last one's corner was still: that one stays where it was left
        const last = nodes[stir.i];
        last.fx = null;
        last.fy = null;
        stir.warmth[stir.i] = 0;
        stir.i = m.i;
      }
      stir.holding = true;
      stir.warmth[m.i] = 1;
      for (const j of neighbours[m.i]) {
        stir.warmth[j] = 1;
        stir.pushed[j] = 0;
      }
    } else if (stir?.i === m.i) stir.holding = false;
    else {
      n.fx = null;
      n.fy = null;
      return;
    }
    if (!timer) timer = setTimeout(step, 0);
  }
});
