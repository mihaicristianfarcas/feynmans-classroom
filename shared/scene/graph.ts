/* graph: nodes and edges — networks, state machines, dependency graphs, trees, arrays (row of
 * cells), hash rings (circle). Layouts are deterministic, so the same spec always draws the same
 * picture; tokens (packets, requests, goods) travel along paths of nodes while the clock runs. */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import { evalNum, fillTemplate } from "./expr.ts";
import { Labels } from "./labels.ts";
import { circle, curvedArrow, type Pt, pathOf, r1, rect, shape, text, textWidth } from "./svg.ts";
import type { FrameState, GNode, GraphScene, RenderOut, Tone } from "./types.ts";
import { HEIGHT, WIDTH } from "./types.ts";

const PAD = { x: 44, top: 34, bottom: 30 };

interface Size {
  w: number;
  h: number;
  r: number;
}

export function nodeSize(node: GNode): Size {
  const label = node.label || node.id;
  // a sublabel sits inside boxes (but under circles), so boxes grow to hold it
  const sub =
    node.sublabel && node.shape !== "circle" ? textWidth(node.sublabel.replace(/\{[^}]*\}/g, "0000"), 10, true) : 0;
  const tw = Math.max(textWidth(label, 12), sub);
  switch (node.shape) {
    case "circle": {
      const r = Math.max(17, Math.min(34, tw / 2 + 9));
      return { w: r * 2, h: r * 2, r };
    }
    case "cell":
      return { w: Math.max(38, tw + 14), h: 34, r: 0 };
    case "diamond":
      // text must fit inside the rhombus, which is half as wide at the sublabel's line
      return { w: Math.max(56, tw * (node.sublabel ? 1.7 : 1.3) + 30), h: node.sublabel ? 50 : 40, r: 0 };
    case "database":
      return { w: Math.max(54, tw + 18), h: 44, r: 0 };
    default:
      return { w: Math.max(56, tw + 22), h: node.sublabel ? 40 : 32, r: node.shape === "pill" ? 16 : 3 };
  }
}

/** Node positions in stage px, computed once per spec (the reader's drags are applied on top). */
export function layoutGraph(spec: GraphScene): Map<string, Pt> {
  return separate(spec, placeNodes(spec));
}

/** Pushes overlapping nodes apart (a model's hand-placed positions are often too close). */
function separate(spec: GraphScene, pos: Map<string, Pt>): Map<string, Pt> {
  const nodes = spec.nodes.map((n) => ({
    id: n.id,
    s: nodeSize(n),
    p: [...(pos.get(n.id) || [WIDTH / 2, HEIGHT / 2])] as Pt,
  }));
  const gap = 16;
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        const ox = (a.s.w + b.s.w) / 2 + gap - Math.abs(a.p[0] - b.p[0]);
        const oy = (a.s.h + b.s.h) / 2 + gap - Math.abs(a.p[1] - b.p[1]);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // move along the axis that needs the smaller push
        if (ox < oy) {
          const d = (ox / 2 + 0.5) * (a.p[0] <= b.p[0] ? 1 : -1);
          a.p[0] -= d;
          b.p[0] += d;
        } else {
          const d = (oy / 2 + 0.5) * (a.p[1] <= b.p[1] ? 1 : -1);
          a.p[1] -= d;
          b.p[1] += d;
        }
      }
    if (!moved) break;
  }
  return new Map(nodes.map((n) => [n.id, n.p]));
}

function placeNodes(spec: GraphScene): Map<string, Pt> {
  const nodes = spec.nodes;
  const raw = new Map<string, Pt>();
  const n = nodes.length;
  const hinted = nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
  switch (spec.layout) {
    case "manual":
      for (const [i, node] of nodes.entries()) {
        raw.set(node.id, [
          Number.isFinite(node.x) ? node.x : (i / Math.max(1, n - 1)) * 100,
          Number.isFinite(node.y) ? node.y : 50,
        ]);
      }
      return fit(spec, raw, { keepAspect: false, fromPercent: true });
    case "circle":
      nodes.forEach((node, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        raw.set(node.id, [Math.cos(a), Math.sin(a)]);
      });
      return fit(spec, raw, { keepAspect: true });
    case "row": {
      // cells touch, like an array or a log; other shapes get a gap
      let x = 0;
      for (const node of nodes) {
        const s = nodeSize(node);
        raw.set(node.id, [x + s.w / 2, 0]);
        x += s.w + (node.shape === "cell" ? 0 : 26);
      }
      return fit(spec, raw, { keepAspect: true, maxScale: 1 });
    }
    case "grid": {
      const cols = Math.ceil(Math.sqrt(n * 1.6));
      for (const [i, node] of nodes.entries()) raw.set(node.id, [i % cols, Math.floor(i / cols)]);
      return fit(spec, raw, { keepAspect: false });
    }
    case "layered":
    case "tree":
      return layeredFit(spec);
    default: {
      // force: deterministic start (hints or a circle), a fixed number of ticks, no randomness
      type N = SimulationNodeDatum & { id: string; r: number };
      const sim: N[] = nodes.map((node, i) => {
        const a = (i / n) * Math.PI * 2;
        const s = nodeSize(node);
        return {
          id: node.id,
          r: Math.max(s.w, s.h) / 2,
          x: hinted ? (node.x - 50) * 6 : Math.cos(a) * 150,
          y: hinted ? (node.y - 50) * 4 : Math.sin(a) * 100,
        };
      });
      const links = spec.edges.map((e) => ({ source: e.from, target: e.to }));
      const simulation = forceSimulation(sim)
        .force(
          "link",
          forceLink(links)
            .id((d) => (d as N).id)
            .distance(90)
            .strength(0.7),
        )
        .force("charge", forceManyBody().strength(-380))
        .force(
          "collide",
          forceCollide<N>().radius((d) => d.r + 14),
        )
        .force("x", forceX(0).strength(0.06))
        .force("y", forceY(0).strength(0.1))
        .stop();
      simulation.randomSource(() => 0.5);
      for (let i = 0; i < 320; i++) simulation.tick();
      for (const d of sim) raw.set(d.id, [d.x ?? 0, d.y ?? 0]);
      return fit(spec, raw, { keepAspect: true, maxScale: 1.4 });
    }
  }
}

/**
 * Layers at their natural spacing, flowing down or across, whichever needs less shrinking to fit
 * the stage (a long chain flows across; a wide, shallow tree flows down).
 */
function layeredFit(spec: GraphScene): Map<string, Pt> {
  const grid = layered(spec);
  const sizes = new Map(spec.nodes.map((n) => [n.id, nodeSize(n)]));
  const maxW = Math.max(40, ...[...sizes.values()].map((x) => x.w));
  const maxH = Math.max(30, ...[...sizes.values()].map((x) => x.h));
  const area = { w: WIDTH - 2 * PAD.x, h: HEIGHT - PAD.top - PAD.bottom - 10 };
  const place = (across: boolean) => {
    const out = new Map<string, Pt>();
    const step = across ? { along: maxW + 34, side: maxH + 26 } : { along: maxH + 42, side: maxW + 26 };
    for (const [id, [order, layer]] of grid)
      out.set(id, across ? [layer * step.along, order * step.side] : [order * step.side, layer * step.along]);
    const xs = [...out.values()].map((q) => q[0]),
      ys = [...out.values()].map((q) => q[1]);
    const w = Math.max(...xs) - Math.min(...xs) + maxW,
      h = Math.max(...ys) - Math.min(...ys) + maxH;
    return {
      out,
      scale: Math.min(1, area.w / w, area.h / h),
      cx: (Math.max(...xs) + Math.min(...xs)) / 2,
      cy: (Math.max(...ys) + Math.min(...ys)) / 2,
    };
  };
  const down = place(false),
    across = place(true);
  const best = across.scale > down.scale + 0.02 ? across : down;
  const cx = WIDTH / 2,
    cy = PAD.top + (HEIGHT - PAD.top - PAD.bottom) / 2;
  const out = new Map<string, Pt>();
  // positions shrink to fit; nodes keep their size (the renderer scales the whole drawing if it must)
  for (const [id, [x, y]] of best.out) out.set(id, [cx + (x - best.cx) * best.scale, cy + (y - best.cy) * best.scale]);
  return out;
}

/** Longest-path layers from the sources, ordered by the mean position of their parents. */
function layered(spec: GraphScene): Map<string, Pt> {
  const ids = spec.nodes.map((n) => n.id);
  const parents = new Map(ids.map((id) => [id, [] as string[]]));
  for (const e of spec.edges) if (e.from !== e.to) parents.get(e.to)?.push(e.from);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0; // a cycle: cut it here
    visiting.add(id);
    const d = Math.max(-1, ...parents.get(id)!.map(depthOf)) + 1;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  ids.forEach(depthOf);
  const layers: string[][] = [];
  for (const id of ids) {
    const layer = depth.get(id)!;
    layers[layer] ??= [];
    layers[layer].push(id);
  }
  const order = new Map<string, number>();
  layers.forEach((layer, li) => {
    if (li > 0) {
      const score = (id: string) => {
        const ps = parents.get(id)!.filter((p) => order.has(p));
        return ps.length ? ps.reduce((s, p) => s + order.get(p)!, 0) / ps.length : 0;
      };
      layer.sort((a, b) => score(a) - score(b));
    }
    for (const [i, id] of layer.entries()) order.set(id, i - (layer.length - 1) / 2);
  });
  const out = new Map<string, Pt>();
  for (const [li, layer] of layers.entries()) for (const id of layer) out.set(id, [order.get(id)!, li]);
  return out;
}

function fit(
  spec: GraphScene,
  raw: Map<string, Pt>,
  opts: { keepAspect: boolean; fromPercent?: boolean; maxScale?: number },
): Map<string, Pt> {
  const pts = [...raw.values()];
  const sizes = new Map(spec.nodes.map((n) => [n.id, nodeSize(n)]));
  const maxW = Math.max(40, ...[...sizes.values()].map((s) => s.w));
  const maxH = Math.max(30, ...[...sizes.values()].map((s) => s.h));
  const groupPad = spec.groups.length ? 18 : 0;
  const box = {
    x: PAD.x + maxW / 2 + groupPad,
    y: PAD.top + maxH / 2 + groupPad + (spec.groups.length ? 10 : 0),
    w: WIDTH - 2 * PAD.x - maxW - 2 * groupPad,
    h: HEIGHT - PAD.top - PAD.bottom - maxH - 2 * groupPad - 14,
  };
  if (opts.fromPercent) {
    const out = new Map<string, Pt>();
    for (const [id, [x, y]] of raw) out.set(id, [box.x + (x / 100) * box.w, box.y + (y / 100) * box.h]);
    return out;
  }
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const wx = x1 - x0 || 1,
    wy = y1 - y0 || 1;
  let sx = box.w / wx,
    sy = box.h / wy;
  if (x1 === x0) sx = 0;
  if (y1 === y0) sy = 0;
  if (opts.keepAspect) {
    const s = Math.min(sx || Infinity, sy || Infinity, opts.maxScale ?? Infinity);
    sx = sy = Number.isFinite(s) ? s : 1;
    if (spec.layout === "row") sx = sy = Math.min(1, box.w / wx);
  }
  // layered/tree/grid: cap the spacing so a small graph doesn't stretch across the whole card
  if (!opts.keepAspect) {
    sx = Math.min(sx, 170);
    sy = Math.min(sy, 105);
  }
  const cx = WIDTH / 2,
    cy = PAD.top + (HEIGHT - PAD.top - PAD.bottom) / 2 + (spec.groups.length ? 6 : 0);
  const out = new Map<string, Pt>();
  for (const [id, [x, y]] of raw) out.set(id, [cx + (x - (x0 + x1) / 2) * sx, cy + (y - (y0 + y1) / 2) * sy]);
  return out;
}

/** Where the segment from the centre toward `toward` leaves a node's outline. */
function boundary(node: GNode, size: Size, c: Pt, toward: Pt): Pt {
  const dx = toward[0] - c[0],
    dy = toward[1] - c[1];
  const len = Math.hypot(dx, dy) || 1;
  if (node.shape === "circle") return [c[0] + (dx / len) * (size.r + 2), c[1] + (dy / len) * (size.r + 2)];
  const hw = size.w / 2 + 2,
    hh = size.h / 2 + 2;
  if (node.shape === "diamond") {
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return [c[0] + dx * t, c[1] + dy * t];
  }
  const t = Math.min(
    Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity,
    Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity,
  );
  return [c[0] + dx * t, c[1] + dy * t];
}

function nodeShape(node: GNode, size: Size, [x, y]: Pt, tone: Tone, opacity: number): string {
  const s = { tone, id: node.id, opacity };
  switch (node.shape) {
    case "circle":
      return circle(x, y, size.r, "paper", s);
    case "diamond":
      return shape(
        pathOf(
          [
            [x, y - size.h / 2],
            [x + size.w / 2, y],
            [x, y + size.h / 2],
            [x - size.w / 2, y],
          ],
          true,
        ),
        "paper",
        s,
      );
    case "database": {
      const w = size.w / 2,
        h = size.h / 2,
        ry = 5;
      return (
        shape(
          `M${r1(x - w)} ${r1(y - h + ry)}v${r1(size.h - 2 * ry)}a${r1(w)} ${ry} 0 0 0 ${r1(2 * w)} 0v${r1(-(size.h - 2 * ry))}`,
          "paper",
          s,
        ) +
        `<ellipse cx="${r1(x)}" cy="${r1(y - h + ry)}" rx="${r1(w)}" ry="${ry}" class="sc-shape" data-fill="paper" data-tone="${tone}"/>`
      );
    }
    case "cell":
      return rect(x - size.w / 2, y - size.h / 2, size.w, size.h, "paper", { ...s, rx: 0 });
    default:
      return rect(x - size.w / 2, y - size.h / 2, size.w, size.h, "paper", { ...s, rx: size.r });
  }
}

export function renderGraph(spec: GraphScene, state: FrameState, memo: Record<string, unknown>): RenderOut {
  const { scope, vis, focus } = state;
  memo.layout ??= layoutGraph(spec);
  const base = memo.layout as Map<string, Pt>;
  const pos = new Map(base);
  for (const [id, p] of Object.entries(state.view.moved || {})) if (pos.has(id)) pos.set(id, p);
  const sizes = new Map(spec.nodes.map((n) => [n.id, nodeSize(n)]));
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const shown = (id: string, when: string | number) => {
    const v = vis(id);
    if (v <= 0.01) return 0;
    if (when !== "" && !evalNum(when, scope, 1)) return 0;
    return v;
  };
  const nodeOpacity = new Map(spec.nodes.map((n) => [n.id, shown(n.id, n.when)]));
  const labels = new Labels({ x: 2, y: 2, w: WIDTH - 4, h: HEIGHT - 4 });
  for (const node of spec.nodes) {
    const p = pos.get(node.id)!,
      s = sizes.get(node.id)!;
    if (nodeOpacity.get(node.id))
      labels.reserve({
        x: p[0] - s.w / 2,
        y: p[1] - s.h / 2,
        w: s.w,
        h: s.h + (node.sublabel && node.shape === "circle" ? 14 : 0),
      });
  }
  const back: string[] = [],
    edgesSvg: string[] = [],
    nodesSvg: string[] = [],
    front: string[] = [];

  /* groups */
  for (const g of spec.groups) {
    const o = Math.max(0, ...g.nodes.map((id) => nodeOpacity.get(id) || 0)) * (vis(g.id) || 0);
    if (!o) continue;
    const members = g.nodes.map((id) => [pos.get(id)!, sizes.get(id)!] as const).filter(([p]) => p);
    const x0 = Math.min(...members.map(([p, s]) => p[0] - s.w / 2)) - 16,
      x1 = Math.max(...members.map(([p, s]) => p[0] + s.w / 2)) + 16;
    const y0 = Math.min(...members.map(([p, s]) => p[1] - s.h / 2)) - 24,
      y1 = Math.max(...members.map(([p, s]) => p[1] + s.h / 2)) + 14;
    back.push(
      rect(x0, y0, x1 - x0, y1 - y0, "tint", { tone: focus.has(g.id) ? "lit" : "faint", rx: 6, id: g.id, opacity: o }),
    );
    if (g.label) back.push(text(x0 + 9, y0 + 14, g.label, { size: 10, mono: true, tone: "mid", opacity: o }));
    labels.reserve({ x: x0 + 6, y: y0 + 3, w: textWidth(g.label, 10, true) + 6, h: 13 });
  }

  /* edges */
  const geometry = new Map<string, (u: number) => Pt>();
  const pairCount = new Map<string, number>();
  for (const e of spec.edges) {
    const key = [e.from, e.to].sort().join("|");
    pairCount.set(key, (pairCount.get(key) || 0) + 1);
  }
  for (const e of spec.edges) {
    const a = byId.get(e.from)!,
      b = byId.get(e.to)!;
    const pa = pos.get(e.from)!,
      pb = pos.get(e.to)!;
    const o = Math.min(nodeOpacity.get(e.from) || 0, nodeOpacity.get(e.to) || 0, shown(e.id, e.when));
    const tone: Tone = focus.has(e.id) ? "lit" : e.tone;
    if (e.from === e.to) {
      const s = sizes.get(e.from)!;
      const top: Pt = [pa[0], pa[1] - s.h / 2];
      const d = `M${r1(top[0] - 8)} ${r1(top[1])}C${r1(top[0] - 26)} ${r1(top[1] - 34)} ${r1(top[0] + 26)} ${r1(top[1] - 34)} ${r1(top[0] + 8)} ${r1(top[1])}`;
      geometry.set(e.id, (u) => [top[0] + Math.sin(u * Math.PI * 2) * 14, top[1] - Math.sin(u * Math.PI) * 26]);
      if (!o) continue;
      edgesSvg.push(
        `<path d="${d}" class="sc-line" data-tone="${tone}" data-id="${e.id}"${e.dashed ? " data-dashed" : ""}/>`,
      );
      if (e.label)
        front.push(
          text(top[0], top[1] - 30, fillTemplate(e.label, scope), {
            size: 10.5,
            anchor: "middle",
            tone: "mid",
            halo: true,
            opacity: o,
          }),
        );
      continue;
    }
    // two edges between the same pair bend apart automatically
    const dup = (pairCount.get([e.from, e.to].sort().join("|")) || 1) > 1;
    const bend =
      (e.curve || (dup ? 0.35 * (e.from < e.to ? 1 : -1) : 0)) *
      Math.min(120, Math.hypot(pb[0] - pa[0], pb[1] - pa[1])) *
      0.5;
    const mid: Pt = [
      (pa[0] + pb[0]) / 2 + (-(pb[1] - pa[1]) / (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1)) * bend,
      (pa[1] + pb[1]) / 2 + ((pb[0] - pa[0]) / (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1)) * bend,
    ];
    const from = boundary(a, sizes.get(a.id)!, pa, mid);
    const to = boundary(b, sizes.get(b.id)!, pb, mid);
    const curved = curvedArrow(from, to, bend * 0.92, {
      tone,
      dashed: e.dashed,
      id: e.id,
      arrow: e.arrow,
      opacity: o,
      width: tone === "lit" ? 2 : undefined,
    });
    geometry.set(e.id, curved.at);
    geometry.set(`${e.from}>${e.to}`, curved.at);
    if (!o) continue;
    edgesSvg.push(curved.svg);
    if (e.label) {
      const label = fillTemplate(e.label, scope);
      const [mx, my] = curved.mid;
      // beside the edge, on its outer side: offset along the normal by half the label's extent
      const [ax, ay] = curved.at(0.45),
        [bx, by] = curved.at(0.55);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let nx = -(by - ay) / len,
        ny = (bx - ax) / len;
      if (bend < 0 || (Math.abs(bend) < 0.5 && ny > 0)) [nx, ny] = [-nx, -ny];
      const w = textWidth(label, 10.5);
      const off = 7 + Math.abs(nx) * (w / 2) + Math.abs(ny) * 5;
      const lx = mx + nx * off,
        ly = my + ny * off + 3.5;
      // a label with nowhere to go is dropped rather than drawn over another (its edge still shows it on hover)
      const at =
        labels.placeOptional(lx, ly, label, 10.5, [
          [0, 0, "middle"],
          [-nx * off * 2, -ny * off * 2, "middle"],
          [0, -12, "middle"],
          [0, 14, "middle"],
        ]) || (focus.has(e.id) ? labels.place(lx, ly, label, 10.5, [[0, 0, "middle"]]) : null);
      if (at)
        front.push(
          text(at.x, at.y, label, {
            size: 10.5,
            anchor: at.anchor,
            tone: tone === "faint" || tone === "lo" ? "mid" : tone,
            halo: true,
            opacity: o,
            id: e.id,
          }),
        );
    }
  }

  /* nodes */
  for (const node of spec.nodes) {
    const o = nodeOpacity.get(node.id) || 0;
    if (!o) continue;
    const p = pos.get(node.id)!,
      s = sizes.get(node.id)!;
    const tone: Tone = focus.has(node.id) || state.hover === node.id ? "lit" : node.tone;
    const label = fillTemplate(node.label, scope);
    const sub = fillTemplate(node.sublabel, scope);
    const inside = node.shape !== "circle" || !sub;
    const labelY = inside && sub ? p[1] - 2 : p[1] + 4;
    nodesSvg.push(
      `<g data-id="${node.id}" data-drag="${node.id}" class="sc-draggable"${o < 1 ? ` style="opacity:${r1(o * 100) / 100}"` : ""}>${nodeShape(node, s, p, tone, 1)}${text(p[0], labelY, label, { size: 12, anchor: "middle", tone: tone === "lit" ? "lit" : "hi", weight: 500 })}${
        sub
          ? text(p[0], inside ? p[1] + 11 : p[1] + s.r + 14, sub, {
              size: 10,
              anchor: "middle",
              mono: true,
              tone: "mid",
              halo: !inside,
            })
          : ""
      }</g>`,
    );
  }

  /* tokens */
  const t = Number(scope.t) || 0;
  for (const k of spec.tokens) {
    const o = shown(k.id, k.when);
    if (!o) continue;
    const at = evalNum(k.at, scope, 0),
      speed = Math.max(0.05, evalNum(k.speed, scope, 1));
    let elapsed = (t - at) / speed;
    if (elapsed < 0) continue;
    const hops = k.path.length - 1;
    if (k.loop) elapsed %= hops;
    else if (elapsed > hops) elapsed = hops;
    const i = Math.min(hops - 1, Math.floor(elapsed));
    const u = elapsed - i;
    const from = k.path[i],
      to = k.path[i + 1];
    const along = geometry.get(`${from}>${to}`);
    const back2 = !along ? geometry.get(`${to}>${from}`) : null;
    const pa = pos.get(from)!,
      pb = pos.get(to)!;
    const ease = u * u * (3 - 2 * u);
    const p: Pt = along
      ? along(ease)
      : back2
        ? back2(1 - ease)
        : [pa[0] + (pb[0] - pa[0]) * ease, pa[1] + (pb[1] - pa[1]) * ease];
    const tone: Tone = focus.has(k.id) ? "lit" : k.tone;
    front.push(circle(p[0], p[1], 5.5, "solid", { tone, opacity: o, id: k.id }));
    if (k.label) {
      const label = fillTemplate(k.label, scope);
      const at2 = labels.place(
        p[0],
        p[1],
        label,
        10.5,
        [
          [0, -10, "middle"],
          [0, 18, "middle"],
          [9, 4, "start"],
          [-9, 4, "end"],
        ],
        true,
      );
      front.push(
        text(at2.x, at2.y, label, {
          size: 10.5,
          anchor: at2.anchor,
          mono: true,
          tone: tone === "lit" ? "hi" : tone,
          halo: true,
          opacity: o,
        }),
      );
    }
  }

  // nodes that would stick out of the stage: shrink the whole drawing around its centre
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const node of spec.nodes) {
    const p = pos.get(node.id)!,
      sz = sizes.get(node.id)!;
    x0 = Math.min(x0, p[0] - sz.w / 2);
    x1 = Math.max(x1, p[0] + sz.w / 2);
    y0 = Math.min(y0, p[1] - sz.h / 2);
    y1 = Math.max(y1, p[1] + sz.h / 2 + (node.sublabel && node.shape === "circle" ? 14 : 0));
  }
  const k = Math.min(1, (WIDTH - 24) / Math.max(1, x1 - x0), (HEIGHT - 40) / Math.max(1, y1 - y0));
  const body = `<g class="sc-back">${back.join("")}</g><g>${edgesSvg.join("")}</g><g>${nodesSvg.join("")}</g><g class="sc-front">${front.join("")}</g>`;
  if (k > 0.985) return { svg: body, invert: (px, py) => [px, py] };
  const mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2;
  return {
    svg: `<g transform="translate(${r1(WIDTH / 2)} ${r1(HEIGHT / 2 + 4)}) scale(${k.toFixed(3)}) translate(${r1(-mx)} ${r1(-my)})">${body}</g>`,
    invert: (px, py) => [(px - WIDTH / 2) / k + mx, (py - HEIGHT / 2 - 4) / k + my],
  };
}
