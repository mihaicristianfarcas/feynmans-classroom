/* diagram: a 2D sketch of a physical setup that moves — a blackboard drawing come alive. A cup and
 * a wick with liquid climbing, a pendulum, rays through a lens, molecules in a box, a lever, a cell
 * membrane. World units with y pointing up, fitted to the stage; every coordinate is an expression,
 * `dots` draws a whole field of particles from one rule in i, and `curve` a path in s. */
import { compile, evalNum, fillTemplate, type Scope } from "./expr.ts";
import { AROUND, Labels } from "./labels.ts";
import { arrow, arrowHead, circle, line, type Pt, pathOf, r1, rect, shape, text } from "./svg.ts";
import type { DiagramScene, FrameState, RenderOut, Tone } from "./types.ts";
import { HEIGHT, WIDTH } from "./types.ts";

const PAD = 26;

export function diagramFrame(spec: DiagramScene, view: FrameState["view"]) {
  const w = Math.max(1e-6, spec.width),
    h = Math.max(1e-6, spec.height);
  const k0 = Math.min((WIDTH - 2 * PAD) / w, (HEIGHT - 2 * PAD) / h);
  const k = k0 * Math.max(0.2, view.zoom || 1);
  const ox = WIDTH / 2 - (w / 2) * k + (view.panX || 0) * WIDTH;
  const oy = HEIGHT / 2 + (h / 2) * k + (view.panY || 0) * HEIGHT;
  return {
    k,
    sx: (x: number) => ox + x * k,
    sy: (y: number) => oy - y * k,
    ix: (px: number) => (px - ox) / k,
    iy: (py: number) => (oy - py) / k,
  };
}

export function renderDiagram(spec: DiagramScene, state: FrameState): RenderOut {
  const { scope, vis, focus } = state;
  const F = diagramFrame(spec, state.view);
  const P = (x: number, y: number): Pt => [F.sx(x), F.sy(y)];
  const n = (e: string | number, s: Scope = scope, d = 0) => evalNum(e, s, d);
  const labels = new Labels({ x: 2, y: 2, w: WIDTH - 4, h: HEIGHT - 4 });
  const body: string[] = [];
  const front: string[] = [];
  const pending: { at: Pt; label: string; tone: Tone; o: number }[] = [];

  for (const sh of spec.shapes) {
    const o = vis(sh.id);
    if (o <= 0.01) continue;
    if (sh.when !== "" && !evalNum(sh.when, scope, 1)) continue;
    const lit = focus.has(sh.id) || state.hover === sh.id;
    const tone: Tone = lit ? "lit" : sh.tone;
    const style = { tone, id: sh.id, opacity: o };
    let labelAt: Pt | null = null;
    switch (sh.type) {
      case "rect": {
        const x = n(sh.x),
          y = n(sh.y),
          w = n(sh.w, scope, 1),
          h = n(sh.h, scope, 1),
          rot = n(sh.rotate);
        // x, y is the centre
        const [cx, cy] = P(x, y);
        const pw = Math.abs(w) * F.k,
          ph = Math.abs(h) * F.k;
        const svg = rect(cx - pw / 2, cy - ph / 2, pw, ph, sh.fill, { ...style, rx: Math.min(2, pw / 6) });
        const g = rot ? `<g transform="rotate(${r1(-rot)} ${r1(cx)} ${r1(cy)})">${svg}</g>` : svg;
        body.push(sh.drag ? `<g data-drag="${sh.id}" class="sc-draggable">${g}</g>` : g);
        labels.reserve({ x: cx - pw / 2, y: cy - ph / 2, w: pw, h: ph });
        labelAt = [cx + pw / 2, cy - ph / 2];
        break;
      }
      case "circle": {
        const [cx, cy] = P(n(sh.x), n(sh.y));
        const r = Math.abs(n(sh.r, scope, 1)) * F.k;
        const svg = circle(cx, cy, r, sh.fill, style);
        body.push(
          sh.drag
            ? `<g data-drag="${sh.id}" class="sc-draggable">${circle(cx, cy, Math.max(r, 12), "none", { cls: "sc-hit" })}${svg}</g>`
            : svg,
        );
        labels.reserve({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r });
        labelAt = [cx + r * 0.7, cy - r * 0.7];
        break;
      }
      case "line": {
        const pts = sh.points.map(([x, y]) => P(n(x), n(y)));
        if (pts.length < 2) break;
        if (sh.arrow) {
          const head = arrowHead(pts[pts.length - 2], pts[pts.length - 1], 7);
          body.push(
            `<path d="${pathOf(pts)}${pathOf(head)}" class="sc-line" data-tone="${tone}" data-id="${sh.id}"${sh.dashed ? " data-dashed" : ""} style="${sh.width ? `stroke-width:${sh.width}px;` : ""}${o < 1 ? `opacity:${r1(o * 100) / 100}` : ""}"/>`,
          );
        } else body.push(line(pts, { ...style, dashed: sh.dashed, width: sh.width || undefined }));
        const mid = pts[Math.floor((pts.length - 1) / 2)],
          next = pts[Math.floor((pts.length - 1) / 2) + 1];
        labelAt = [(mid[0] + next[0]) / 2, (mid[1] + next[1]) / 2];
        break;
      }
      case "polygon": {
        const pts = sh.points.map(([x, y]) => P(n(x), n(y)));
        if (pts.length >= 3) body.push(shape(pathOf(pts, true), sh.fill, style));
        labelAt = pts[0] || null;
        break;
      }
      case "curve": {
        const cx = compile(sh.x),
          cy = compile(sh.y);
        const s0 = n(sh.from),
          s1 = n(sh.to, scope, 1);
        const local: Scope = { ...scope, s: 0 };
        const pts: Pt[] = [];
        for (let i = 0; i <= 200; i++) {
          local.s = s0 + ((s1 - s0) * i) / 200;
          try {
            const x = Number(cx(local)),
              y = Number(cy(local));
            if (Number.isFinite(x) && Number.isFinite(y)) pts.push(P(x, y));
          } catch {}
        }
        if (pts.length > 1)
          body.push(
            sh.fill !== "none"
              ? shape(pathOf(pts, true), sh.fill, { ...style, dashed: sh.dashed })
              : line(pts, { ...style, dashed: sh.dashed, width: tone === "lit" ? 2 : undefined }),
          );
        labelAt = pts[Math.floor(pts.length * 0.8)] || null;
        break;
      }
      case "dots": {
        const cx = compile(sh.x),
          cy = compile(sh.y),
          cr = compile(sh.r);
        const local: Scope = { ...scope, i: 0, N: sh.count };
        const parts: string[] = [];
        for (let i = 0; i < sh.count; i++) {
          local.i = i;
          try {
            const x = Number(cx(local)),
              y = Number(cy(local));
            const r = Math.max(0.6, Math.abs(Number(cr(local))) * F.k);
            if (Number.isFinite(x) && Number.isFinite(y))
              parts.push(`<circle cx="${r1(F.sx(x))}" cy="${r1(F.sy(y))}" r="${r1(r)}"/>`);
          } catch {}
        }
        body.push(
          `<g class="sc-shape" data-fill="solid" data-tone="${tone}" data-id="${sh.id}"${o < 1 ? ` style="opacity:${r1(o * 100) / 100}"` : ""}>${parts.join("")}</g>`,
        );
        break;
      }
      case "spring": {
        const a = P(n(sh.from[0]), n(sh.from[1])),
          b = P(n(sh.to[0]), n(sh.to[1]));
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const ux = (b[0] - a[0]) / len,
          uy = (b[1] - a[1]) / len;
        const end = Math.min(8, len / 5),
          coils = Math.max(2, Math.min(30, sh.coils || 8)),
          width = 9;
        const pts: Pt[] = [a, [a[0] + ux * end, a[1] + uy * end]];
        for (let i = 1; i < coils * 2; i++) {
          const t = end + ((len - 2 * end) * i) / (coils * 2);
          const side = (i % 2 ? 1 : -1) * width * 0.5;
          pts.push([a[0] + ux * t - uy * side, a[1] + uy * t + ux * side]);
        }
        pts.push([b[0] - ux * end, b[1] - uy * end], b);
        body.push(line(pts, style));
        labelAt = [(a[0] + b[0]) / 2 + 8, (a[1] + b[1]) / 2];
        break;
      }
      case "arc": {
        const [cx, cy] = P(n(sh.x), n(sh.y));
        const r = Math.abs(n(sh.r, scope, 1)) * F.k;
        const a0 = (n(sh.from) * Math.PI) / 180,
          a1 = (n(sh.to, scope, 90) * Math.PI) / 180;
        const pts: Pt[] = [];
        const steps = Math.max(6, Math.ceil(Math.abs(a1 - a0) * 12));
        for (let i = 0; i <= steps; i++) {
          const a = a0 + ((a1 - a0) * i) / steps;
          pts.push([cx + r * Math.cos(a), cy - r * Math.sin(a)]);
        }
        body.push(
          sh.arrow && pts.length > 1
            ? arrow(pts[pts.length - 2], pts[pts.length - 1], { ...style, head: 6 }) + line(pts, style)
            : line(pts, style),
        );
        labelAt = pts[Math.floor(pts.length / 2)] || null;
        break;
      }
      case "ground": {
        const x1 = F.sx(n(sh.x1)),
          x2 = F.sx(n(sh.x2, scope, spec.width)),
          y = F.sy(n(sh.y));
        let d = pathOf([
          [x1, y],
          [x2, y],
        ]);
        for (let x = x1 + 5; x <= x2; x += 9)
          d += pathOf([
            [x, y],
            [x - 6, y + 7],
          ]);
        body.push(`<path d="${d}" class="sc-line" data-tone="${tone}" data-id="${sh.id}"/>`);
        break;
      }
      case "text": {
        const [x, y] = P(n(sh.x), n(sh.y));
        const label = fillTemplate(sh.text, scope);
        const at = labels.place(x, y, label, sh.size || 12, [
          [0, 0, "middle"],
          [0, -14, "middle"],
          [0, 16, "middle"],
        ]);
        front.push(
          text(at.x, at.y, label, { size: sh.size || 12, anchor: at.anchor, tone, id: sh.id, opacity: o, halo: true }),
        );
        break;
      }
    }
    if (sh.label && labelAt)
      pending.push({
        at: labelAt,
        label: fillTemplate(sh.label, scope),
        tone: tone === "faint" || tone === "lo" ? "mid" : tone,
        o,
      });
  }
  for (const p of pending) {
    const at = labels.place(p.at[0], p.at[1], p.label, 11.5, AROUND);
    front.push(
      text(at.x, at.y, p.label, {
        size: 11.5,
        anchor: at.anchor,
        tone: p.tone === "lit" ? "hi" : p.tone,
        opacity: p.o,
        halo: true,
      }),
    );
  }
  return {
    svg: `<g>${body.join("")}</g><g class="sc-front">${front.join("")}</g>`,
    invert: (px, py) => [F.ix(px), F.iy(py)],
  };
}
