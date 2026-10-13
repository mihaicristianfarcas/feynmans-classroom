/* plot: graphs of functions and data on one pair of axes, in the Feynman-lecture blackboard style:
 * thin axes with arrow tips, mono tick numbers, italic variable names, one lit thing to watch.
 * Zoom rescales the axes and resamples every curve (zoom into a curve and watch it straighten). */
import { compile, evalNum, fillTemplate, type Scope } from "./expr.ts";
import { AROUND, Labels } from "./labels.ts";
import { arrow, circle, dot, line, niceTicks, pathOf, type Pt, r1, rect, shape, text, textWidth, tickLabel } from "./svg.ts";
import type { FrameState, PlotLayer, PlotScene, RenderOut, Tone } from "./types.ts";
import { HEIGHT, WIDTH } from "./types.ts";

const BOX = { x: 62, y: 30, w: WIDTH - 62 - 40, h: HEIGHT - 30 - 46 };

export interface PlotFrame {
  sx: (x: number) => number;
  sy: (y: number) => number;
  ix: (px: number) => number;
  iy: (py: number) => number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The visible ranges after zoom and pan, and the mappers between data and stage px. */
export function plotFrame(spec: PlotScene, view: FrameState["view"]): PlotFrame {
  const zoom = Math.max(0.05, view.zoom || 1);
  const span = (axis: PlotScene["x"], pan: number) => {
    const lo = axis.log ? Math.log10(axis.min) : axis.min;
    const hi = axis.log ? Math.log10(axis.max) : axis.max;
    const half = (hi - lo) / 2 / zoom;
    const mid = (lo + hi) / 2 + pan * (hi - lo);
    return [mid - half, mid + half];
  };
  let [x0, x1] = span(spec.x, view.panX || 0);
  let [y0, y1] = span(spec.y, view.panY || 0);
  if (spec.equal && !spec.x.log && !spec.y.log) {
    // one unit is the same length on both axes: widen the tighter range
    const ux = (x1 - x0) / BOX.w,
      uy = (y1 - y0) / BOX.h;
    if (ux > uy) {
      const mid = (y0 + y1) / 2;
      [y0, y1] = [mid - (ux * BOX.h) / 2, mid + (ux * BOX.h) / 2];
    } else {
      const mid = (x0 + x1) / 2;
      [x0, x1] = [mid - (uy * BOX.w) / 2, mid + (uy * BOX.w) / 2];
    }
  }
  const fx = spec.x.log ? (v: number) => Math.log10(v) : (v: number) => v;
  const fy = spec.y.log ? (v: number) => Math.log10(v) : (v: number) => v;
  const gx = spec.x.log ? (v: number) => 10 ** v : (v: number) => v;
  const gy = spec.y.log ? (v: number) => 10 ** v : (v: number) => v;
  return {
    sx: (x) => BOX.x + ((fx(x) - x0) / (x1 - x0)) * BOX.w,
    sy: (y) => BOX.y + BOX.h - ((fy(y) - y0) / (y1 - y0)) * BOX.h,
    ix: (px) => gx(x0 + ((px - BOX.x) / BOX.w) * (x1 - x0)),
    iy: (py) => gy(y0 + ((BOX.y + BOX.h - py) / BOX.h) * (y1 - y0)),
    x0: gx(x0),
    x1: gx(x1),
    y0: gy(y0),
    y1: gy(y1),
  };
}

const inBox = ([x, y]: Pt, pad = 0) => x >= BOX.x - pad && x <= BOX.x + BOX.w + pad && y >= BOX.y - pad && y <= BOX.y + BOX.h + pad;

/** Samples y = f(x) into polylines, broken where the function is undefined or jumps off the box. */
function sampleRuns(fn: (x: number) => number, a: number, b: number, F: PlotFrame, n = 360, log = false): Pt[][] {
  const runs: Pt[][] = [];
  let run: Pt[] = [];
  let prev: Pt | null = null;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = log ? 10 ** (Math.log10(a) + (Math.log10(b) - Math.log10(a)) * u) : a + (b - a) * u;
    const y = fn(x);
    if (!Number.isFinite(y)) {
      if (run.length > 1) runs.push(run);
      run = [];
      prev = null;
      continue;
    }
    let py = F.sy(y);
    // keep paths finite: far off-box values are clamped (the clip path hides them)
    py = Math.max(BOX.y - BOX.h * 2, Math.min(BOX.y + BOX.h * 3, py));
    const pt: Pt = [F.sx(x), py];
    if (prev && Math.abs(pt[1] - prev[1]) > BOX.h * 1.5 && (!inBox(pt) || !inBox(prev))) {
      // an asymptote: don't join across it
      if (run.length > 1) runs.push(run);
      run = [];
    }
    run.push(pt);
    prev = pt;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function fnOf(layer: Extract<PlotLayer, { type: "function" }>, scope: Scope): (x: number) => number {
  const compiled = compile(layer.expr);
  const local: Scope = { ...scope, x: 0 };
  return (x) => {
    local.x = x;
    try {
      const v = compiled(local);
      return typeof v === "number" ? v : Number(v);
    } catch {
      return NaN;
    }
  };
}

export function renderPlot(spec: PlotScene, state: FrameState, memo: Record<string, unknown>): RenderOut {
  const { scope, vis, focus } = state;
  const F = plotFrame(spec, state.view);
  const clipId = `pc-${state.uid}`;
  const labels = new Labels({ x: 4, y: 4, w: WIDTH - 8, h: HEIGHT - 8 });
  const back: string[] = [];
  const body: string[] = [];
  const front: string[] = [];
  const toneOf = (l: { id: string; tone: Tone }): Tone => (focus.has(l.id) ? "lit" : l.tone);

  /* axes */
  const xt = spec.x.ticks.length && state.view.zoom === 1 && !state.view.panX ? spec.x.ticks.filter((v) => v >= Math.min(F.x0, F.x1) && v <= Math.max(F.x0, F.x1)) : spec.x.log ? logTicks(F.x0, F.x1) : niceTicks(F.x0, F.x1, 7);
  const yt = spec.y.ticks.length && state.view.zoom === 1 && !state.view.panY ? spec.y.ticks.filter((v) => v >= Math.min(F.y0, F.y1) && v <= Math.max(F.y0, F.y1)) : spec.y.log ? logTicks(F.y0, F.y1) : niceTicks(F.y0, F.y1, 6);
  const ox = Math.min(Math.max(F.sx(!spec.x.log && F.x0 <= 0 && F.x1 >= 0 ? 0 : F.x0), BOX.x), BOX.x + BOX.w);
  const oy = Math.min(Math.max(F.sy(!spec.y.log && F.y0 <= 0 && F.y1 >= 0 ? 0 : F.y0), BOX.y), BOX.y + BOX.h);
  if (spec.grid) {
    for (const v of xt) back.push(line([[F.sx(v), BOX.y], [F.sx(v), BOX.y + BOX.h]], { tone: "faint" }));
    for (const v of yt) back.push(line([[BOX.x, F.sy(v)], [BOX.x + BOX.w, F.sy(v)]], { tone: "faint" }));
  }
  back.push(arrow([BOX.x - 6, oy], [BOX.x + BOX.w + 14, oy], { tone: "mid", head: 6 }));
  back.push(arrow([ox, BOX.y + BOX.h + 6], [ox, BOX.y - 14], { tone: "mid", head: 6 }));
  if (spec.x.label) {
    const w = textWidth(spec.x.label, 12);
    const lx = Math.min(WIDTH - 6 - w, BOX.x + BOX.w + 4);
    const ly = oy + (oy > BOX.y + BOX.h - 20 ? 30 : 18);
    labels.reserve({ x: lx, y: ly - 11, w, h: 14 });
    back.push(text(lx, ly, spec.x.label, { size: 12, tone: "hi", italic: true }));
  }
  if (spec.y.label) {
    const lx = ox + 8;
    labels.reserve({ x: lx, y: BOX.y - 24, w: textWidth(spec.y.label, 12), h: 14 });
    back.push(text(lx, BOX.y - 13, spec.y.label, { size: 12, tone: "hi", italic: true }));
  }

  const barLabels = spec.layers.filter((l): l is Extract<PlotLayer, { type: "bars" }> => l.type === "bars" && l.labels.some(Boolean) && vis(l.id) > 0);
  if (!barLabels.length) {
    for (const v of xt) {
      const px = F.sx(v);
      if (px < BOX.x - 1 || px > BOX.x + BOX.w + 1) continue;
      back.push(line([[px, oy], [px, oy + 4]], { tone: "mid" }));
      if (Math.abs(px - ox) < 2 && v === 0 && !spec.y.log) continue;
      const label = tickLabel(v);
      const box = { x: px - textWidth(label, 10, true) / 2, y: oy + 7, w: textWidth(label, 10, true), h: 11 };
      if (!labels.free(box)) continue;
      labels.reserve(box);
      back.push(text(px, oy + 16, label, { size: 10, anchor: "middle", mono: true, tone: "mid" }));
    }
  }
  for (const v of yt) {
    const py = F.sy(v);
    if (py < BOX.y - 1 || py > BOX.y + BOX.h + 1) continue;
    back.push(line([[ox - 4, py], [ox, py]], { tone: "mid" }));
    if (Math.abs(py - oy) < 2 && v === 0 && !spec.x.log) continue;
    const label = tickLabel(v);
    const box = { x: ox - 8 - textWidth(label, 10, true), y: py - 5, w: textWidth(label, 10, true), h: 11 };
    if (!labels.free(box)) continue;
    labels.reserve(box);
    back.push(text(ox - 8, py + 3.5, label, { size: 10, anchor: "end", mono: true, tone: "mid" }));
  }
  /* layers */
  const fns = new Map<string, (x: number) => number>();
  const curveLabels: { x: number; y: number; text: string; tone: Tone; opacity: number }[] = [];
  for (const layer of spec.layers) {
    if (layer.type === "function") fns.set(layer.id, fnOf(layer, scope));
  }
  const shown = (l: PlotLayer) => {
    const v = vis(l.id);
    if (v <= 0.01) return 0;
    if (l.when !== "" && !evalNum(l.when, scope, 1)) return 0;
    return v;
  };
  const xLo = Math.min(F.x0, F.x1),
    xHi = Math.max(F.x0, F.x1);

  for (const layer of spec.layers) {
    const opacity = shown(layer);
    if (!opacity) continue;
    const tone = toneOf(layer);
    const id = layer.id;
    switch (layer.type) {
      case "function": {
        const fn = fns.get(id)!;
        let a = xLo,
          b = xHi;
        if (layer.domain) {
          a = Math.max(a, evalNum(layer.domain[0], scope, -Infinity));
          b = Math.min(b, evalNum(layer.domain[1], scope, Infinity));
        }
        if (!(b > a)) break;
        const runs = sampleRuns(fn, a, b, F, 360, spec.x.log);
        for (const run of runs) body.push(line(run, { tone, dashed: layer.dashed, id, opacity, width: tone === "lit" ? 2.2 : tone === "hi" ? 1.7 : undefined }));
        if (layer.label) {
          const last = runs.flat().filter((p) => inBox(p, -4));
          const at = last[Math.max(0, last.length - 1 - Math.round(last.length * 0.04))];
          if (at) curveLabels.push({ x: at[0], y: at[1], text: layer.label, tone: tone === "faint" ? "mid" : tone, opacity });
        }
        break;
      }
      case "parametric": {
        const cx = compile(layer.x),
          cy = compile(layer.y);
        const s0 = evalNum(layer.from, scope, 0),
          s1 = evalNum(layer.to, scope, 1);
        const local: Scope = { ...scope, s: 0 };
        const pts: Pt[] = [];
        for (let i = 0; i <= 360; i++) {
          local.s = s0 + ((s1 - s0) * i) / 360;
          try {
            const x = Number(cx(local)),
              y = Number(cy(local));
            if (Number.isFinite(x) && Number.isFinite(y)) pts.push([F.sx(x), F.sy(y)]);
          } catch {}
        }
        body.push(line(pts, { tone, dashed: layer.dashed, id, opacity, width: tone === "lit" ? 2.2 : tone === "hi" ? 1.7 : undefined }));
        if (layer.label && pts.length) {
          const at = pts[Math.round(pts.length * 0.9)] || pts[pts.length - 1];
          curveLabels.push({ x: at[0], y: at[1], text: layer.label, tone, opacity });
        }
        break;
      }
      case "area": {
        const fn = fnOf({ ...layer, type: "function", domain: null, dashed: false } as Extract<PlotLayer, { type: "function" }>, scope);
        const baseFn = fnOf({ ...layer, type: "function", expr: layer.base, domain: null, dashed: false } as Extract<PlotLayer, { type: "function" }>, scope);
        const a = Math.max(xLo, evalNum(layer.from, scope, xLo)),
          b = Math.min(xHi, evalNum(layer.to, scope, xHi));
        if (!(b > a)) break;
        const top: Pt[] = [],
          bottom: Pt[] = [];
        for (let i = 0; i <= 160; i++) {
          const x = a + ((b - a) * i) / 160;
          const y = fn(x),
            y0 = baseFn(x);
          if (!Number.isFinite(y) || !Number.isFinite(y0)) continue;
          top.push([F.sx(x), F.sy(y)]);
          bottom.push([F.sx(x), F.sy(y0)]);
        }
        if (top.length > 1) back.push(shape(pathOf([...top, ...bottom.reverse()], true), "tint", { tone, id, opacity }));
        if (layer.label && top.length) {
          const mid = top[Math.floor(top.length / 2)];
          const base = bottom[bottom.length - 1 - Math.floor(top.length / 2)] || mid;
          curveLabels.push({ x: mid[0], y: (mid[1] + base[1]) / 2 + 4, text: layer.label, tone: tone === "faint" ? "mid" : tone, opacity });
        }
        break;
      }
      case "series": {
        const pts = layer.points.map(([x, y]) => [F.sx(x), F.sy(y)] as Pt);
        if (layer.line) body.push(line(pts, { tone, dashed: layer.dashed, id, opacity }));
        if (layer.dots) for (const p of pts) if (inBox(p, 2)) body.push(dot(p[0], p[1], 2.6, { tone, id, opacity }));
        if (layer.label && pts.length) {
          const at = [...pts].reverse().find((p) => inBox(p)) || pts[pts.length - 1];
          curveLabels.push({ x: at[0], y: at[1], text: layer.label, tone, opacity });
        }
        break;
      }
      case "bars": {
        const zeroY = F.sy(spec.y.log ? F.y0 : Math.min(Math.max(0, F.y0), F.y1));
        layer.xs.forEach((xe, i) => {
          const x = evalNum(xe, scope, i),
            h = evalNum(layer.heights[i] ?? 0, scope, 0);
          const half = (F.sx(x + layer.width / 2) - F.sx(x - layer.width / 2)) / 2;
          const px = F.sx(x),
            py = F.sy(h);
          body.push(rect(px - half, Math.min(py, zeroY), half * 2, Math.abs(zeroY - py), "tint", { tone: focus.has(`${id}.${i}`) ? "lit" : tone, id, opacity }));
          const label = layer.labels[i];
          if (label) back.push(text(px, oy + 16, label, { size: 10, anchor: "middle", tone: "mid" }));
        });
        break;
      }
      case "point": {
        const x = evalNum(layer.x, scope),
          y = evalNum(layer.y, scope);
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        const p: Pt = [F.sx(x), F.sy(y)];
        if (layer.trail) {
          const key = `trail:${id}`;
          const trail = ((memo[key] as Pt[]) || []).slice(-80);
          const lastPt = trail[trail.length - 1];
          if (!lastPt || Math.hypot(lastPt[0] - x, lastPt[1] - y) > 1e-9) trail.push([x, y]);
          memo[key] = trail;
          trail.forEach(([tx, ty], i) => {
            if (i % 2) return;
            const tp: Pt = [F.sx(tx), F.sy(ty)];
            if (inBox(tp)) body.push(dot(tp[0], tp[1], 1.5, { tone: "lo", opacity: opacity * (0.3 + (0.7 * i) / trail.length) }));
          });
        }
        if (!inBox(p, 8)) break;
        labels.reserve({ x: p[0] - 6, y: p[1] - 6, w: 12, h: 12 });
        const ring = tone === "lit" || focus.has(id);
        front.push(`<g data-id="${id}"${layer.drag ? ` data-drag="${id}" class="sc-draggable"` : ""}${opacity < 1 ? ` style="opacity:${r1(opacity * 100) / 100}"` : ""}>${layer.drag ? circle(p[0], p[1], 16, "none", { cls: "sc-hit" }) : ""}${ring ? circle(p[0], p[1], 7.5, "paper", { tone }) : ""}${dot(p[0], p[1], ring ? 3.2 : 4, { tone })}</g>`);
        if (layer.label) {
          const label = fillTemplate(layer.label, scope);
          const at = labels.place(p[0], p[1], label, 12, AROUND);
          front.push(text(at.x, at.y, label, { size: 12, anchor: at.anchor, tone: tone === "lit" ? "hi" : tone, opacity, halo: true }));
        }
        break;
      }
      case "vector": {
        const a: Pt = [F.sx(evalNum(layer.from[0], scope, 0)), F.sy(evalNum(layer.from[1], scope, 0))];
        const b: Pt = [F.sx(evalNum(layer.to[0], scope, 0)), F.sy(evalNum(layer.to[1], scope, 0))];
        if (![...a, ...b].every(Number.isFinite)) break;
        body.push(layer.arrow ? arrow(a, b, { tone, dashed: layer.dashed, id, opacity, width: tone === "lit" ? 2 : 1.5, head: 8 }) : line([a, b], { tone, dashed: layer.dashed, id, opacity }));
        if (layer.label) {
          const label = fillTemplate(layer.label, scope);
          const mx = (a[0] + b[0]) / 2,
            my = (a[1] + b[1]) / 2;
          const nx = -(b[1] - a[1]),
            ny = b[0] - a[0];
          const len = Math.hypot(nx, ny) || 1;
          const side = ny / len > 0 ? -1 : 1;
          const at = labels.place(mx + (side * nx * 12) / len, my + (side * ny * 12) / len + 4, label, 12, [[0, 0, "middle"], [0, -14, "middle"], [0, 16, "middle"]]);
          front.push(text(at.x, at.y, label, { size: 12, anchor: at.anchor, tone: tone === "faint" ? "mid" : tone, opacity, halo: true }));
        }
        break;
      }
      case "tangent": {
        const fn = fns.get(layer.of);
        if (!fn) break;
        const x = evalNum(layer.at, scope);
        const y = fn(x);
        const h = Math.max(1e-6, (xHi - xLo) * 1e-4);
        const slope = (fn(x + h) - fn(x - h)) / (2 * h);
        if (![x, y, slope].every(Number.isFinite)) break;
        const pts: Pt[] = [
          [F.sx(xLo), F.sy(y + slope * (xLo - x))],
          [F.sx(xHi), F.sy(y + slope * (xHi - x))],
        ];
        body.push(line(pts, { tone, dashed: layer.dashed, id, opacity, width: tone === "lit" ? 1.8 : undefined }));
        if (layer.label) {
          const label = fillTemplate(layer.label, scope);
          const p: Pt = [F.sx(x), F.sy(y)];
          const ux = Math.min(BOX.x + BOX.w - 20, p[0] + 60);
          const uy = F.sy(y + slope * (F.ix(ux) - x));
          const at = labels.place(ux, Math.max(BOX.y + 12, Math.min(BOX.y + BOX.h - 6, uy)), label, 11, [[4, -8, "start"], [4, 16, "start"], [-4, -8, "end"]]);
          front.push(text(at.x, at.y, label, { size: 11, anchor: at.anchor, tone: tone === "lit" ? "hi" : tone, opacity, halo: true }));
        }
        break;
      }
      case "hline":
      case "vline": {
        const v = evalNum(layer.at, scope);
        if (!Number.isFinite(v)) break;
        const pts: Pt[] = layer.type === "hline" ? [[BOX.x, F.sy(v)], [BOX.x + BOX.w, F.sy(v)]] : [[F.sx(v), BOX.y], [F.sx(v), BOX.y + BOX.h]];
        body.push(line(pts, { tone, dashed: layer.dashed, id, opacity }));
        if (layer.label) {
          const label = fillTemplate(layer.label, scope);
          const at = layer.type === "hline" ? labels.place(BOX.x + BOX.w - 4, F.sy(v), label, 11, [[0, -6, "end"], [0, 14, "end"]]) : labels.place(F.sx(v), BOX.y + 4, label, 11, [[5, 8, "start"], [-5, 8, "end"]]);
          front.push(text(at.x, at.y, label, { size: 11, anchor: at.anchor, tone: tone === "faint" ? "mid" : tone, opacity, halo: true }));
        }
        break;
      }
      case "label": {
        const x = evalNum(layer.x, scope),
          y = evalNum(layer.y, scope);
        if (!Number.isFinite(x) || !Number.isFinite(y)) break;
        const label = fillTemplate(layer.text, scope);
        const at = labels.place(F.sx(x), F.sy(y), label, 12, [[0, 0, "middle"], [0, -14, "middle"], [0, 16, "middle"]]);
        front.push(text(at.x, at.y, label, { size: 12, anchor: at.anchor, tone, id, opacity, halo: true }));
        break;
      }
    }
  }

  for (const l of curveLabels) {
    const label = fillTemplate(l.text, scope);
    const at = labels.place(l.x, l.y, label, 12, [[6, -8, "start"], [-6, -9, "end"], [6, 16, "start"], [-6, 16, "end"], [0, -14, "middle"]]);
    front.push(text(at.x, at.y, label, { size: 12, anchor: at.anchor, tone: l.tone, opacity: l.opacity, halo: true }));
  }

  const clip = `<clipPath id="${clipId}"><rect x="${BOX.x - 2}" y="${BOX.y - 12}" width="${BOX.w + 16}" height="${BOX.h + 14}"/></clipPath>`;
  return {
    svg: `<defs>${clip}</defs><g class="sc-back">${back.join("")}</g><g clip-path="url(#${clipId})">${body.join("")}</g><g class="sc-front">${front.join("")}</g>`,
    invert: (px, py) => [F.ix(px), F.iy(py)],
  };
}

function logTicks(a: number, b: number): number[] {
  const lo = Math.floor(Math.log10(Math.min(a, b))),
    hi = Math.ceil(Math.log10(Math.max(a, b)));
  const out: number[] = [];
  const stride = Math.max(1, Math.ceil((hi - lo) / 7));
  for (let e = lo; e <= hi; e += stride) out.push(10 ** e);
  return out;
}

export const PLOT_BOX = BOX;
