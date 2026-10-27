/* Drawing the knowledge graph on a canvas, one frame at a time: the lines (grouped by look, one path a
 * look), the items' marks (circle, recall ring, icon from a small bitmap made once per size), the halo of
 * the picked, hovered and focused items, and as many names as fit, the most important first. Only what is
 * in view is drawn, so a frame costs about the same however big the graph grows. */
import type { GraphData } from "../../api";
import { type Level, markKey, type Palette } from "./palette";

type Kind = GraphData["nodes"][number]["kind"];

export interface DrawItem {
  id: string;
  kind: Kind;
  /** The whole name, and as the graph shows it (a long book title cut short). */
  label: string;
  short: string;
  mastery: number | null;
  level: Level | null;
  x: number;
  y: number;
  r: number;
}
export interface DrawLink {
  a: DrawItem;
  b: DrawItem;
  kind: string;
}
export interface View {
  k: number;
  x: number;
  y: number;
}

export interface Frame {
  ctx: CanvasRenderingContext2D;
  /** The canvas's size in CSS pixels, and device pixels to one. */
  w: number;
  h: number;
  dpr: number;
  view: View;
  pal: Palette;
  items: DrawItem[];
  /** The items in the order their names are given room: books, then concepts much is built on. */
  byImportance: DrawItem[];
  links: DrawLink[];
  icons: Partial<Record<Kind, Path2D[]>>;
  iconStroke: number;
  selected: string | null;
  hover: string | null;
  focused: string | null;
  /** Whether the focused item shows the keyboard's ring. */
  focusRing: boolean;
  /** The item whose links are lit, and it with its neighbours; how far the rest has faded (0–1). */
  lead: string | null;
  lit: Set<string> | null;
  fade: number;
  /** Whether a find is on, and what it matches. */
  finding: boolean;
  matches: (item: DrawItem) => boolean;
  /** How far an item has come in (0: not yet, 1: there), in a replay. */
  born: (item: DrawItem) => number;
  /** How much a hovered item has grown. */
  grow: (item: DrawItem) => number;
}

/** An item's icon's size inside a circle of radius `r`. */
export const iconSize = (r: number) => Math.max(9, r * 1.1);
/** Names drawn at most in one frame. */
const MOST_NAMES = 450;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const sprites = new Map<string, HTMLCanvasElement>();
/** An icon in a colour at a size in device pixels, drawn once and kept. */
function sprite(paths: Path2D[], key: string, colour: string, px: number, stroke: number) {
  const id = `${key}|${colour}|${px}`;
  let s = sprites.get(id);
  if (s) return s;
  if (sprites.size > 600) sprites.clear();
  s = document.createElement("canvas");
  s.width = s.height = px;
  const c = s.getContext("2d")!;
  c.scale(px / 24, px / 24);
  c.strokeStyle = colour;
  c.lineWidth = stroke;
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const p of paths) c.stroke(p);
  sprites.set(id, s);
  return s;
}
/** Forgets the icons drawn (the theme changed). */
export const forgetSprites = () => sprites.clear();

const widths = new Map<string, number>();
/** A name's width at size 100 in a weight, measured once (the frame scales it to the size it uses). */
function widthOf(ctx: CanvasRenderingContext2D, weight: string, family: string, text: string) {
  const id = `${weight}|${text}`;
  let w = widths.get(id);
  if (w === undefined) {
    ctx.font = `${weight} 100px ${family}`;
    w = ctx.measureText(text).width;
    if (widths.size > 20000) widths.clear();
    widths.set(id, w);
  }
  return w;
}

/** The places names already take in a frame, in cells, to find overlaps without looking at them all. */
class Taken {
  private cells = new Map<number, number[][]>();
  private cell = 48;
  private keys(x0: number, y0: number, x1: number, y1: number, each: (key: number) => boolean | undefined) {
    for (let i = Math.floor(x0 / this.cell); i <= Math.floor(x1 / this.cell); i++)
      for (let j = Math.floor(y0 / this.cell); j <= Math.floor(y1 / this.cell); j++)
        if (each(i * 100003 + j)) return true;
    return false;
  }
  hits(r: number[]) {
    return this.keys(r[0], r[1], r[2], r[3], (key) =>
      this.cells.get(key)?.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1]),
    );
  }
  add(r: number[]) {
    this.keys(r[0], r[1], r[2], r[3], (key) => {
      const list = this.cells.get(key);
      if (list) list.push(r);
      else this.cells.set(key, [r]);
      return undefined;
    });
  }
}

export function drawGraph(f: Frame) {
  const { ctx, w, h, dpr, view, pal } = f;
  const { k } = view;
  const ox = w / 2 + view.x,
    oy = h / 2 + view.y;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // what is in view, in the graph's units, with room for a halo or a name reaching in from the side
  const pad = 40 / k;
  const vx0 = -ox / k - pad - 220 / k,
    vx1 = (w - ox) / k + pad,
    vy0 = -oy / k - pad,
    vy1 = (h - oy) / k + pad;
  const inView = (it: DrawItem) => it.x > vx0 && it.x < vx1 && it.y > vy0 && it.y < vy1;
  // lines never thinner than this on screen, however far out the view is
  const hairline = 0.75 / k;
  const faded = (it: DrawItem) =>
    f.lit ? (f.lit.has(it.id) ? 1 : lerp(1, pal.dim, f.fade)) : f.finding && !f.matches(it) ? pal.dim : 1;

  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);

  /* lines: grouped by kind, state and (in a replay) how far in they are, each group one path */
  const groups = new Map<string, { kind: string; state: string; alpha: number; path: number[]; heads: number[] }>();
  for (const l of f.links) {
    const { a, b } = l;
    const ba = f.born(a),
      bb = f.born(b);
    if (!ba || !bb) continue;
    if ((a.x < vx0 && b.x < vx0) || (a.x > vx1 && b.x > vx1) || (a.y < vy0 && b.y < vy0) || (a.y > vy1 && b.y > vy1))
      continue;
    const lit = !!f.lit && f.lit.has(a.id) && f.lit.has(b.id) && (a.id === f.lead || b.id === f.lead);
    const state = lit ? "lit" : f.lit ? "faded" : f.finding ? "dim" : "plain";
    const alpha = Math.round(Math.min(ba, bb) * 10) / 10;
    const id = `${l.kind}|${state}|${alpha}`;
    let g = groups.get(id);
    if (!g) {
      g = { kind: l.kind, state, alpha, path: [], heads: [] };
      groups.set(id, g);
    }
    if (l.kind === "builds-on") {
      // "a builds on b" runs from b, the foundation, to the edge of a's circle, where its head points
      const dx = a.x - b.x,
        dy = a.y - b.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length,
        uy = dy / length;
      const tx = a.x - ux * (a.r * f.grow(a) + 2),
        ty = a.y - uy * (a.r * f.grow(a) + 2);
      g.path.push(b.x, b.y, tx, ty);
      g.heads.push(tx, ty, ux, uy);
    } else g.path.push(a.x, a.y, b.x, b.y);
  }
  for (const g of groups.values()) {
    const line = pal.lines[g.kind] ?? pal.lines.related;
    const opacity =
      g.state === "lit"
        ? pal.lit.opacity
        : g.state === "faded"
          ? lerp(line.opacity, pal.lineDim, f.fade)
          : g.state === "dim"
            ? pal.lineDim
            : line.opacity;
    ctx.globalAlpha = opacity * g.alpha;
    ctx.strokeStyle = g.state === "lit" ? pal.lit.stroke : line.stroke;
    ctx.lineWidth = Math.max(hairline, g.state === "lit" ? pal.lit.width : line.width);
    ctx.setLineDash(line.dash);
    ctx.beginPath();
    for (let i = 0; i < g.path.length; i += 4) {
      ctx.moveTo(g.path[i], g.path[i + 1]);
      ctx.lineTo(g.path[i + 2], g.path[i + 3]);
    }
    ctx.stroke();
    if (g.heads.length) {
      ctx.fillStyle = pal.arrow;
      ctx.beginPath();
      for (let i = 0; i < g.heads.length; i += 4) {
        const [tx, ty, ux, uy] = [g.heads[i], g.heads[i + 1], g.heads[i + 2], g.heads[i + 3]];
        // the marker's head: 7 long, its base 2.8 either side of the line
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - ux * 7 - uy * 2.8, ty - uy * 7 + ux * 2.8);
        ctx.lineTo(tx - ux * 7 + uy * 2.8, ty - uy * 7 - ux * 2.8);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.setLineDash([]);

  /* marks: most in groups of one look; the picked, hovered, focused and arriving ones one by one, on top */
  const shown: DrawItem[] = [];
  const alone: DrawItem[] = [];
  const marks = new Map<string, { key: string; hit: boolean; alpha: number; list: DrawItem[] }>();
  for (const it of f.items) {
    const born = f.born(it);
    if (!born || !inView(it)) continue;
    shown.push(it);
    if (it.id === f.selected || it.id === f.hover || it.id === f.focused || born < 1 || f.grow(it) !== 1) {
      alone.push(it);
      continue;
    }
    const hit = f.finding && f.matches(it);
    const alpha = Math.round(faded(it) * 50) / 50;
    const key = markKey(it.kind, it.level);
    const id = `${key}|${hit}|${alpha}`;
    const g = marks.get(id);
    if (g) g.list.push(it);
    else marks.set(id, { key, hit, alpha, list: [it] });
  }
  // a circle never smaller than this on screen, so far out every item still shows
  const least = 1.6 / k;
  const disc = (key: string, hit: boolean, list: DrawItem[], scale: (it: DrawItem) => number) => {
    const m = pal.marks[key];
    ctx.beginPath();
    for (const it of list) {
      const r = Math.max(least, it.r * scale(it));
      ctx.moveTo(it.x + r, it.y);
      ctx.arc(it.x, it.y, r, 0, Math.PI * 2);
    }
    if (m.fill) {
      ctx.fillStyle = m.fill;
      ctx.fill();
    }
    const stroke = hit ? pal.hit.stroke : m.stroke;
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(hairline, hit ? pal.hit.width : m.width);
      ctx.setLineDash(hit ? [] : m.dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  const ring = (it: DrawItem, r: number) => {
    if (it.level !== "weak" && it.level !== "ok") return;
    const m = pal.marks[markKey(it.kind, it.level)];
    const fraction = Math.max(0.001, Math.min(0.9999, it.mastery ?? 0));
    ctx.beginPath();
    ctx.arc(it.x, it.y, r, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
    ctx.strokeStyle = m.ring;
    ctx.lineWidth = Math.max(hairline, 2.2);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineCap = "butt";
  };
  for (const g of marks.values()) {
    ctx.globalAlpha = g.alpha;
    disc(g.key, g.hit, g.list, () => 1);
    for (const it of g.list) ring(it, it.r);
  }
  for (const it of alone) {
    const born = f.born(it);
    // a replay's item grows into place as it fades in
    const scale = f.grow(it) * (born < 1 ? lerp(0.7, 1, born) : 1);
    const r = it.r * scale;
    ctx.globalAlpha = faded(it) * born;
    const picked = it.id === f.selected;
    const focused = it.id === f.focused && f.focusRing;
    if (picked || focused || it.id === f.hover) {
      ctx.globalAlpha *= picked || focused ? 1 : 0.8;
      ctx.beginPath();
      ctx.arc(it.x, it.y, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = pal.halo;
      ctx.fill();
      if (picked || focused) {
        ctx.strokeStyle = pal.haloRing;
        ctx.lineWidth = Math.max(hairline, focused ? 2 : pal.haloWidth);
        ctx.stroke();
      }
      ctx.globalAlpha = faded(it) * born;
    }
    disc(markKey(it.kind, it.level), f.finding && f.matches(it), [it], () => scale);
    ring(it, r);
  }

  /* icons and names, in device pixels */
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const it of shown) {
    const paths = f.icons[it.kind];
    const scale = f.grow(it) * (f.born(it) < 1 ? lerp(0.7, 1, f.born(it)) : 1);
    // an icon too small to read is left out
    if (!paths || it.r * scale * k < 5) continue;
    const px = Math.max(4, Math.round(iconSize(it.r) * scale * k * dpr));
    const s = sprite(paths, it.kind, pal.marks[markKey(it.kind, it.level)].icon, px, f.iconStroke);
    ctx.globalAlpha = faded(it) * f.born(it);
    ctx.drawImage(s, Math.round((it.x * k + ox) * dpr - px / 2), Math.round((it.y * k + oy) * dpr - px / 2));
  }

  const { text } = pal;
  // names grow with the view a little, and stay readable far out
  const zoom = Math.min(1.25, Math.max(0.9, k));
  const taken = new Taken();
  const names: { it: DrawItem; x: number; y: number; weight: string; size: number; text: string }[] = [];
  const first = [f.selected, f.focused, f.hover].filter(Boolean) as string[];
  const byId = new Map(shown.map((it) => [it.id, it]));
  const order: DrawItem[] = [];
  const queued = new Set<string>();
  const queue = (it: DrawItem | undefined) => {
    if (it && !queued.has(it.id) && byId.has(it.id)) {
      queued.add(it.id);
      order.push(it);
    }
  };
  for (const id of first) queue(byId.get(id));
  if (f.lit) for (const id of f.lit) queue(byId.get(id));
  if (f.finding) for (const it of shown) if (f.matches(it)) queue(it);
  for (const it of f.byImportance) queue(byId.get(it.id));
  let ringBox: number[] | null = null;
  for (const it of order) {
    if (names.length >= MOST_NAMES) break;
    const book = it.kind === "book";
    const weight = it.id === f.selected ? text.pickedWeight : book ? text.bookWeight : text.weight;
    const size = (book ? text.bookSize : text.size) * zoom;
    const label = it.id === f.hover ? it.label : it.short;
    const width = (widthOf(ctx, weight, text.family, label) * size) / 100;
    const scale = f.grow(it) * (f.born(it) < 1 ? lerp(0.7, 1, f.born(it)) : 1);
    const sx = it.x * k + ox,
      sy = it.y * k + oy;
    const x = sx + it.r * scale * k + 6;
    const box = [x - 2, sy - size * 0.7, x + width + 2, sy + size * 0.7];
    const forced = first.includes(it.id);
    if (!forced && (box[2] < 0 || box[0] > w || box[3] < 0 || box[1] > h || taken.hits(box))) continue;
    taken.add(box);
    names.push({ it, x, y: sy, weight, size, text: label });
    if (it.id === f.focused && f.focusRing) ringBox = [sx - (it.r * scale + 6) * k - 4, sy, x + width + 4, size];
  }
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = text.halo;
  ctx.fillStyle = text.fill;
  let font = "";
  for (const n of names) {
    const next = `${n.weight} ${n.size * dpr}px ${text.family}`;
    if (next !== font) ctx.font = font = next;
    ctx.globalAlpha = faded(n.it) * f.born(n.it);
    ctx.lineWidth = text.haloWidth * zoom * dpr;
    ctx.strokeText(n.text, n.x * dpr, n.y * dpr);
    ctx.fillText(n.text, n.x * dpr, n.y * dpr);
  }

  /* the keyboard's ring, round the focused item and its name */
  const focused = f.focusRing && f.focused ? byId.get(f.focused) : undefined;
  if (focused) {
    // round its halo (6 past the circle), and its name if it has one
    const r = (focused.r * f.grow(focused) + 6) * k;
    const sx = focused.x * k + ox,
      sy = focused.y * k + oy;
    const [x0, , x1, size] = ringBox ?? [sx - r - 4, sy, sx + r + 4, 0];
    const half = Math.max(r + 4, size * 0.7 + 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.focus;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.roundRect(x0 * dpr, (sy - half) * dpr, (x1 - x0) * dpr, half * 2 * dpr, 12 * dpr);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
