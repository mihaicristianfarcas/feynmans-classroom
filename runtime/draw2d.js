/* d2: small 2D drawing helpers for simple, intuitive demos, styled with the anatomy tokens.
 * Every function returns an SVG markup string (or, for axes, an object with mappers + markup).
 * Coordinates are SVG viewBox units (y grows downward). Tones: "hi" | "mid" | "lo" | "faint" | "lit"
 * | "red" | "green" | "blue" (colour only when colour is the subject).
 */
(() => {
  "use strict";
  const r1 = (v) => Math.round(v * 10) / 10;
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const attrs = (o) =>
    Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== null && v !== false)
      .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
      .join("");
  const pathOf = (points, closed = false) => (points.length ? `M${points.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L")}${closed ? "Z" : ""}` : "");

  function lineStyle({ tone = "mid", width, dashed, dotted, part, cls, opacity } = {}) {
    return {
      class: `d2-line${cls ? ` ${cls}` : ""}`,
      "data-tone": tone,
      "data-dashed": dashed || undefined,
      "data-dotted": dotted || undefined,
      "data-part": part,
      style: [width ? `stroke-width:${width}px` : "", opacity !== undefined ? `opacity:${opacity}` : ""].filter(Boolean).join(";") || undefined,
    };
  }

  const d2 = {
    pathOf,
    /** Polyline through [[x,y],...]. */
    line(points, style = {}) {
      return `<path${attrs({ d: pathOf(points, style.closed), ...lineStyle(style) })}/>`;
    },
    /** Raw SVG path data. */
    path(d, style = {}) {
      return `<path${attrs({ d, ...lineStyle(style) })}/>`;
    },
    /** Shape with a fill: fill "paper" hides what is behind, "tone" uses a soft tint of the tone, "solid" fills with the tone. */
    shape(d, { fill = "paper", tone = "mid", part, width, lit } = {}) {
      return `<path${attrs({ d, class: "d2-shape", "data-fill": fill, "data-tone": lit ? "lit" : tone, "data-part": part, style: width ? `stroke-width:${width}px` : undefined })}/>`;
    },
    circle(cx, cy, r, { fill = "paper", tone = "hi", part, width, lit } = {}) {
      return `<circle${attrs({ cx: r1(cx), cy: r1(cy), r: r1(r), class: "d2-shape", "data-fill": fill, "data-tone": lit ? "lit" : tone, "data-part": part, style: width ? `stroke-width:${width}px` : undefined })}/>`;
    },
    rect(x, y, w, h, { fill = "paper", tone = "mid", r = 0, part, width, lit } = {}) {
      return `<rect${attrs({ x: r1(x), y: r1(y), width: r1(Math.max(0, w)), height: r1(Math.max(0, h)), rx: r || undefined, class: "d2-shape", "data-fill": fill, "data-tone": lit ? "lit" : tone, "data-part": part, style: width ? `stroke-width:${width}px` : undefined })}/>`;
    },
    /** Filled dot, for points on curves and pivots. */
    dot(x, y, { r = 2.2, tone = "hi", part } = {}) {
      return `<circle${attrs({ cx: r1(x), cy: r1(y), r, class: "d2-dot", "data-tone": tone, "data-part": part })}/>`;
    },
    /** Arrow from -> to with an open head; head length in px. */
    arrow(from, to, { tone = "hi", head = 6, width, part, spread = 0.42 } = {}) {
      const [x1, y1] = from,
        [x2, y2] = to;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 0.5) return "";
      const ux = (x2 - x1) / len,
        uy = (y2 - y1) / len;
      const h = Math.min(head, len * 0.6);
      const a = [x2 - h * (ux * Math.cos(spread) - uy * Math.sin(spread)), y2 - h * (uy * Math.cos(spread) + ux * Math.sin(spread))];
      const b = [x2 - h * (ux * Math.cos(-spread) - uy * Math.sin(-spread)), y2 - h * (uy * Math.cos(-spread) + ux * Math.sin(-spread))];
      return `<path${attrs({ d: `${pathOf([from, to])}${pathOf([a, to, b])}`, ...lineStyle({ tone, width, part }) })}/>`;
    },
    /** Small label. Keep labels few and short: axis names, point names, a symbol on a curve. */
    text(x, y, str, { tone = "mid", size = 11, anchor = "start", italic = false, mono = false, part, baseline } = {}) {
      return `<text${attrs({ x: r1(x), y: r1(y), class: "d2-text", "data-tone": tone, "data-mono": mono || undefined, "data-italic": italic || undefined, "text-anchor": anchor, "dominant-baseline": baseline, "font-size": size, "data-part": part })}>${esc(str)}</text>`;
    },
    /** Ground line with short hatches below it (the classic textbook floor). */
    ground(x1, x2, y, { tone = "mid", gap = 9, depth = 7 } = {}) {
      let d = pathOf([[x1, y], [x2, y]]);
      for (let x = x1 + gap * 0.6; x <= x2; x += gap) d += pathOf([[x, y], [x - depth * 0.8, y + depth]]);
      return `<path${attrs({ d, ...lineStyle({ tone }) })}/>`;
    },
    /** Zig-zag spring between two points. */
    spring(from, to, { coils = 8, width = 8, tone = "mid", part, ends = 6 } = {}) {
      const [x1, y1] = from,
        [x2, y2] = to;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len,
        uy = (y2 - y1) / len;
      const e = Math.min(ends, len / 4);
      const pts = [from, [x1 + ux * e, y1 + uy * e]];
      const n = coils * 2;
      for (let i = 1; i < n; i++) {
        const t = e + ((len - 2 * e) * i) / n;
        const side = (i % 2 ? 1 : -1) * width * 0.5;
        pts.push([x1 + ux * t - uy * side, y1 + uy * t + ux * side]);
      }
      pts.push([x2 - ux * e, y2 - uy * e], to);
      return `<path${attrs({ d: pathOf(pts), ...lineStyle({ tone, part }) })}/>`;
    },
    /** Arc of a circle (angles in radians, SVG convention: 0 = +x, positive = clockwise on screen). */
    arc(cx, cy, r, a0, a1, style = {}) {
      const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 3));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      return d2.line(pts, style);
    },
    /** Sample y = f(x) between a and b into points, mapped by an axes object (or identity). */
    sample(fn, a, b, n = 160, map) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const x = a + ((b - a) * i) / n;
        const y = fn(x);
        if (!Number.isFinite(y)) continue;
        pts.push(map ? map(x, y) : [x, y]);
      }
      return pts;
    },
    /**
     * Axes in a box. Returns { svg, sx, sy, at(x,y), box, clip(points) }.
     * opts: { x, y, w, h, xRange:[a,b], yRange:[c,d], xTicks:[...], yTicks:[...], xLabel, yLabel,
     *         grid:false, logY:false, logX:false, tickFormat:(v)=>string, arrows:true }
     */
    axes(opts) {
      const { x, y, w, h, xRange = [0, 1], yRange = [0, 1], xLabel, yLabel, grid = false, logX = false, logY = false, arrows = true } = opts;
      const fx = logX ? Math.log10 : (v) => v;
      const fy = logY ? Math.log10 : (v) => v;
      const [xa, xb] = xRange.map(fx),
        [ya, yb] = yRange.map(fy);
      const sx = (v) => x + ((fx(v) - xa) / (xb - xa)) * w;
      const sy = (v) => y + h - ((fy(v) - ya) / (yb - ya)) * h;
      const fmtTick = opts.tickFormat || ((v) => (logX || logY) && Math.abs(v) >= 10 ? `1e${Math.round(Math.log10(v))}` : String(+v.toFixed(4)));
      const out = [];
      if (grid) {
        for (const t of opts.xTicks || []) out.push(d2.line([[sx(t), y], [sx(t), y + h]], { tone: "faint" }));
        for (const t of opts.yTicks || []) out.push(d2.line([[x, sy(t)], [x + w, sy(t)]], { tone: "faint" }));
      }
      const ox = Math.min(Math.max(sx(xRange[0] <= 0 && xRange[1] >= 0 && !logX ? 0 : xRange[0]), x), x + w);
      const oy = Math.min(Math.max(sy(yRange[0] <= 0 && yRange[1] >= 0 && !logY ? 0 : yRange[0]), y), y + h);
      out.push(arrows ? d2.arrow([x - 4, oy], [x + w + 10, oy], { tone: "mid", head: 5 }) : d2.line([[x, oy], [x + w, oy]], { tone: "mid" }));
      out.push(arrows ? d2.arrow([ox, y + h + 4], [ox, y - 10], { tone: "mid", head: 5 }) : d2.line([[ox, y + h], [ox, y]], { tone: "mid" }));
      for (const t of opts.xTicks || []) {
        out.push(d2.line([[sx(t), oy], [sx(t), oy + 4]], { tone: "mid" }));
        out.push(d2.text(sx(t), oy + 16, fmtTick(t), { tone: "mid", size: 10, anchor: "middle", mono: true }));
      }
      for (const t of opts.yTicks || []) {
        out.push(d2.line([[ox - 4, sy(t)], [ox, sy(t)]], { tone: "mid" }));
        out.push(d2.text(ox - 8, sy(t) + 3.5, fmtTick(t), { tone: "mid", size: 10, anchor: "end", mono: true }));
      }
      if (xLabel) out.push(d2.text(x + w + 14, oy + 4, xLabel, { tone: "hi", size: 12, italic: true }));
      if (yLabel) out.push(d2.text(ox + 6, y - 6, yLabel, { tone: "hi", size: 12, italic: true }));
      const at = (vx, vy) => [sx(vx), sy(vy)];
      const clip = (points) => points.filter(([px, py]) => px >= x - 0.5 && px <= x + w + 0.5 && py >= y - 0.5 && py <= y + h + 0.5);
      return { svg: out.join(""), sx, sy, at, clip, box: { x, y, w, h }, origin: [ox, oy] };
    },
    /** A labelled bar meter (e.g. energy bars): returns markup for a vertical bar from base up to value. */
    bar(x, base, width, height, { tone = "hi", fill = "tone", part } = {}) {
      const top = base - Math.max(0, height);
      return d2.rect(x, Math.min(top, base), width, Math.abs(height), { tone, fill, part });
    },
  };

  globalThis.d2 = d2;
})();
