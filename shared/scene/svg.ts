/* SVG markup helpers for the scene renderers. Everything returns strings, so a scene renders the
 * same in the browser and in Node (dry runs, tests). Styling lives in scene.css: tones are data
 * attributes resolved by CSS variables that follow the light/dark theme. */
import type { Tone } from "./types.ts";

export type Pt = [number, number];

export const r1 = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
export const esc = (t: unknown) =>
  String(t ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function attrs(o: Record<string, unknown>): string {
  let out = "";
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === false || v === "") continue;
    out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
  }
  return out;
}

export const pathOf = (points: Pt[], closed = false) =>
  points.length ? `M${points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}${closed ? "Z" : ""}` : "";

export interface Style {
  tone?: Tone;
  width?: number;
  dashed?: boolean;
  dotted?: boolean;
  id?: string;
  opacity?: number;
  cls?: string;
}

function common(s: Style): Record<string, unknown> {
  return {
    "data-tone": s.tone || "mid",
    "data-dashed": s.dashed || undefined,
    "data-dotted": s.dotted || undefined,
    "data-id": s.id,
    style:
      [
        s.width ? `stroke-width:${s.width}px` : "",
        s.opacity !== undefined && s.opacity < 0.999 ? `opacity:${r1(s.opacity * 100) / 100}` : "",
      ]
        .filter(Boolean)
        .join(";") || undefined,
  };
}

export const line = (points: Pt[], s: Style = {}) =>
  points.length < 2
    ? ""
    : `<path${attrs({ d: pathOf(points), class: `sc-line${s.cls ? ` ${s.cls}` : ""}`, ...common(s) })}/>`;
export const path = (d: string, s: Style = {}) =>
  d ? `<path${attrs({ d, class: `sc-line${s.cls ? ` ${s.cls}` : ""}`, ...common(s) })}/>` : "";

export type Fill = "paper" | "tint" | "solid" | "none";
export const shape = (d: string, fill: Fill, s: Style = {}) =>
  `<path${attrs({ d, class: `sc-shape${s.cls ? ` ${s.cls}` : ""}`, "data-fill": fill, ...common(s) })}/>`;
export const circle = (cx: number, cy: number, r: number, fill: Fill, s: Style = {}) =>
  `<circle${attrs({ cx: r1(cx), cy: r1(cy), r: r1(Math.max(0, r)), class: `sc-shape${s.cls ? ` ${s.cls}` : ""}`, "data-fill": fill, ...common(s) })}/>`;
export const rect = (x: number, y: number, w: number, h: number, fill: Fill, s: Style & { rx?: number } = {}) =>
  `<rect${attrs({ x: r1(x), y: r1(y), width: r1(Math.max(0, w)), height: r1(Math.max(0, h)), rx: s.rx ? r1(s.rx) : undefined, class: `sc-shape${s.cls ? ` ${s.cls}` : ""}`, "data-fill": fill, ...common(s) })}/>`;
export const dot = (x: number, y: number, r = 3, s: Style = {}) =>
  circle(x, y, r, "solid", { ...s, tone: s.tone || "hi" });

export function arrowHead(from: Pt, to: Pt, size = 7, spread = 0.42): Pt[] {
  const [x1, y1] = from,
    [x2, y2] = to;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len,
    uy = (y2 - y1) / len;
  const h = Math.min(size, len * 0.6);
  const a: Pt = [
    x2 - h * (ux * Math.cos(spread) - uy * Math.sin(spread)),
    y2 - h * (uy * Math.cos(spread) + ux * Math.sin(spread)),
  ];
  const b: Pt = [
    x2 - h * (ux * Math.cos(-spread) - uy * Math.sin(-spread)),
    y2 - h * (uy * Math.cos(-spread) + ux * Math.sin(-spread)),
  ];
  return [a, to, b];
}

export function arrow(from: Pt, to: Pt, s: Style & { head?: number } = {}) {
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.5) return "";
  const head = arrowHead(from, to, s.head ?? 7);
  return `<path${attrs({ d: `${pathOf([from, to])}${pathOf(head)}`, class: "sc-line", ...common(s), "data-dashed": undefined })}/>${s.dashed ? `<path${attrs({ d: pathOf([from, to]), class: "sc-line sc-under", ...common(s) })}/>` : ""}`;
}

/** An arrow along a quadratic curve bent by `bend` px sideways. */
export function curvedArrow(
  from: Pt,
  to: Pt,
  bend: number,
  s: Style & { head?: number; arrow?: boolean } = {},
): { svg: string; mid: Pt; at: (u: number) => Pt } {
  const mx = (from[0] + to[0]) / 2,
    my = (from[1] + to[1]) / 2;
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const nx = -(to[1] - from[1]) / len,
    ny = (to[0] - from[0]) / len;
  const c: Pt = [mx + nx * bend, my + ny * bend];
  const at = (u: number): Pt => [
    (1 - u) * (1 - u) * from[0] + 2 * (1 - u) * u * c[0] + u * u * to[0],
    (1 - u) * (1 - u) * from[1] + 2 * (1 - u) * u * c[1] + u * u * to[1],
  ];
  const d =
    Math.abs(bend) < 0.5
      ? pathOf([from, to])
      : `M${r1(from[0])} ${r1(from[1])}Q${r1(c[0])} ${r1(c[1])} ${r1(to[0])} ${r1(to[1])}`;
  const head = s.arrow === false ? "" : pathOf(arrowHead(at(0.92), to, s.head ?? 7));
  const svg = `<path${attrs({ d, class: "sc-line", ...common(s) })}/>${head ? `<path${attrs({ d: head, class: "sc-line", ...common({ ...s, dashed: false }) })}/>` : ""}`;
  return { svg, mid: at(0.5), at };
}

export interface TextStyle {
  tone?: Tone;
  size?: number;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
  mono?: boolean;
  weight?: number;
  id?: string;
  opacity?: number;
  baseline?: "middle" | "hanging" | "auto";
  halo?: boolean;
}

/**
 * Text with light math formatting: x^2, x^{n+1}, v_0, v_{max} become super/subscripts; a label
 * that is a single variable (x, v, F, Δy) is set in italics.
 */
export function text(x: number, y: number, str: string, s: TextStyle = {}) {
  const raw = String(str ?? "");
  if (!raw) return "";
  const italic = s.italic ?? /^[A-Za-zα-ωΑ-ΩΔ][′']?(_\{?[A-Za-z0-9]+\}?)?$/.test(raw);
  const body = mathSpans(raw);
  const a = attrs({
    x: r1(x),
    y: r1(y),
    class: `sc-text${s.halo ? " sc-knock" : ""}`,
    "data-tone": s.tone || "mid",
    "data-italic": italic || undefined,
    "data-mono": s.mono || undefined,
    "text-anchor": s.anchor || "start",
    "dominant-baseline": s.baseline === "auto" ? undefined : s.baseline || undefined,
    "font-size": s.size || 12,
    "font-weight": s.weight,
    "data-id": s.id,
    style: s.opacity !== undefined && s.opacity < 0.999 ? `opacity:${r1(s.opacity * 100) / 100}` : undefined,
  });
  return `<text${a}>${body}</text>`;
}

function mathSpans(raw: string): string {
  if (!/[\^_]/.test(raw)) return esc(raw);
  let out = "";
  let i = 0;
  let shifted = 0;
  while (i < raw.length) {
    const c = raw[i];
    if ((c === "^" || c === "_") && i + 1 < raw.length && i > 0) {
      let j = i + 1;
      let inner = "";
      if (raw[j] === "{") {
        const end = raw.indexOf("}", j);
        inner = raw.slice(j + 1, end < 0 ? raw.length : end);
        j = end < 0 ? raw.length : end + 1;
      } else {
        const m = /^[A-Za-z0-9+\-−′*]+/.exec(raw.slice(j)) || [raw[j]];
        inner = c === "_" ? m[0].slice(0, 3) : m[0];
        j += inner.length;
      }
      const dy = c === "^" ? -0.42 : 0.28;
      out += `<tspan dy="${dy}em" font-size="72%">${esc(inner)}</tspan><tspan dy="${-dy}em">​</tspan>`;
      shifted++;
      i = j;
      continue;
    }
    out += esc(c);
    i++;
  }
  return shifted ? out : esc(raw);
}

/** Rough text width in px for layout (sans 12px ≈ 6.4 px per character). */
export const textWidth = (str: string, size = 12, mono = false) =>
  String(str ?? "").replace(/[\^_{}]/g, "").length * size * (mono ? 0.62 : 0.56);

/** "Nice" tick values covering [a, b]. */
export function niceTicks(a: number, b: number, count = 6): number[] {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return [a];
  const lo = Math.min(a, b),
    hi = Math.max(a, b);
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step)
    out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return out;
}

export function tickLabel(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) return v.toExponential(0).replace("e+", "e");
  return String(+v.toPrecision(6)).replace("-", "−");
}
