/* The graph's look, read from its styles: a hidden drawing of every kind of mark and line, styled by the
 * same .g-* rules the legend draws with, whose computed colours, widths, dashes and fonts the canvas
 * then draws with. So the canvas follows the theme and the styles, and always matches the legend. */
import type { Ref } from "react";
import type { GraphData } from "../../api";

type Kind = GraphData["nodes"][number]["kind"];
export type Level = "none" | "weak" | "ok" | "strong";

export interface Mark {
  fill: string | null;
  stroke: string | null;
  width: number;
  dash: number[];
  icon: string;
  ring: string;
}
export interface Line {
  stroke: string;
  width: number;
  dash: number[];
  opacity: number;
}
export interface Palette {
  /** By kind, and a concept's by how well it is known ("concept-weak"). */
  marks: Record<string, Mark>;
  /** A found item's circle. */
  hit: { stroke: string; width: number };
  /** The halo round a picked (or focused) item, and its ring. */
  halo: string;
  haloRing: string;
  haloWidth: number;
  /** How faint an item, and a line, is when something else is lit. */
  dim: number;
  lineDim: number;
  lines: Record<string, Line>;
  /** A line of the lit item's. */
  lit: { stroke: string; width: number; opacity: number };
  arrow: string;
  /** The keyboard focus ring. */
  focus: string;
  text: {
    weight: string;
    bookWeight: string;
    pickedWeight: string;
    size: number;
    bookSize: number;
    family: string;
    fill: string;
    halo: string;
    haloWidth: number;
  };
}

/** The marks drawn, as [key, kind, level]. */
const MARKS: [string, Kind, Level | undefined][] = [
  ["book", "book", undefined],
  ["note", "note", undefined],
  ["annotation", "annotation", undefined],
  ["concept-none", "concept", "none"],
  ["concept-weak", "concept", "weak"],
  ["concept-ok", "concept", "ok"],
  ["concept-strong", "concept", "strong"],
];
export const markKey = (kind: Kind, level: Level | null) => (kind === "concept" ? `concept-${level ?? "none"}` : kind);

/** Every kind of line the graph draws (GraphEdge's kinds). */
const LINES = ["source", "related", "about", "mentions", "link", "embed", "ai", "suggested", "builds-on", "concept"];

/** The hidden drawing the palette is read from. */
export function PaletteProbe({ probe }: { probe: Ref<SVGSVGElement> }) {
  return (
    <svg ref={probe} className="graph-probe" aria-hidden="true" focusable="false">
      {MARKS.map(([key, kind, level]) => (
        <g key={key} className={`g-node g-${kind}`} data-level={level} data-probe={key}>
          <circle className="g-disc" r="1" />
          <path className="g-ring" d="M0 0" />
          <g className="g-icon" />
          <text>x</text>
        </g>
      ))}
      <g className="g-node g-concept" data-hit data-probe="hit">
        <circle className="g-disc" r="1" />
      </g>
      <g className="g-node g-concept" data-selected data-probe="selected">
        <circle className="g-halo" r="1" />
        <text>x</text>
      </g>
      <g className="g-node" data-dim data-probe="dim" />
      {LINES.map((kind) => (
        <line key={kind} className="g-edge" data-kind={kind} data-probe-line={kind} />
      ))}
      <line className="g-edge" data-lit data-probe-line="lit" />
      <line className="g-edge" data-dim data-probe-line="dim" />
      <path className="g-arrow" data-probe="arrow" d="M0 0" />
      <g data-probe="focus" style={{ color: "var(--focus)" }} />
    </svg>
  );
}

let swatch: CanvasRenderingContext2D | null = null;
const colours = new Map<string, string | null>();
/** A CSS colour as the canvas takes it (rgba), whatever form the styles computed it in; null for none. */
function colour(css: string): string | null {
  if (colours.has(css)) return colours.get(css)!;
  let out: string | null = null;
  if (css && css !== "none" && css !== "transparent") {
    swatch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (swatch) {
      swatch.clearRect(0, 0, 1, 1);
      swatch.fillStyle = "#000";
      swatch.fillStyle = css;
      swatch.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data;
      out = a ? `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})` : null;
    }
  }
  colours.set(css, out);
  return out;
}

const number = (value: string, fallback = 0) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};
const dashes = (value: string) =>
  !value || value === "none"
    ? []
    : value
        .split(/[\s,]+/)
        .map((v) => Number.parseFloat(v))
        .filter(Number.isFinite);

/** Reads the palette from the probe (again when the theme changes). */
export function readPalette(probe: SVGSVGElement): Palette {
  colours.clear();
  const at = (selector: string) => {
    const el = probe.querySelector(selector);
    if (!el) throw new Error(`the graph's probe has no ${selector}`);
    return getComputedStyle(el);
  };
  const marks: Record<string, Mark> = {};
  for (const [key] of MARKS) {
    const disc = at(`[data-probe="${key}"] .g-disc`);
    marks[key] = {
      fill: colour(disc.fill),
      stroke: colour(disc.stroke),
      width: number(disc.strokeWidth, 1),
      dash: dashes(disc.strokeDasharray),
      icon: colour(at(`[data-probe="${key}"] .g-icon`).color) ?? "#000",
      ring: colour(at(`[data-probe="${key}"] .g-ring`).stroke) ?? "#000",
    };
  }
  const lines: Record<string, Line> = {};
  for (const kind of LINES) {
    const line = at(`[data-probe-line="${kind}"]`);
    lines[kind] = {
      stroke: colour(line.stroke) ?? "#888",
      width: number(line.strokeWidth, 1),
      dash: dashes(line.strokeDasharray),
      opacity: number(line.opacity, 1),
    };
  }
  const hit = at(`[data-probe="hit"] .g-disc`);
  const halo = at(`[data-probe="selected"] .g-halo`);
  const lit = at(`[data-probe-line="lit"]`);
  const text = at(`[data-probe="concept-none"] text`);
  return {
    marks,
    hit: { stroke: colour(hit.stroke) ?? "#000", width: number(hit.strokeWidth, 2) },
    halo: colour(halo.fill) ?? "transparent",
    haloRing: colour(halo.stroke) ?? "#000",
    haloWidth: number(halo.strokeWidth, 1.5),
    dim: number(at(`[data-probe="dim"]`).opacity, 0.2),
    lineDim: number(at(`[data-probe-line="dim"]`).opacity, 0.12),
    lines,
    lit: { stroke: colour(lit.stroke) ?? "#000", width: number(lit.strokeWidth, 1.5), opacity: number(lit.opacity, 1) },
    arrow: colour(at(`[data-probe="arrow"]`).fill) ?? "#000",
    focus: colour(at(`[data-probe="focus"]`).color) ?? "#000",
    text: {
      weight: text.fontWeight,
      bookWeight: at(`[data-probe="book"] text`).fontWeight,
      pickedWeight: at(`[data-probe="selected"] text`).fontWeight,
      size: number(text.fontSize, 12),
      bookSize: number(at(`[data-probe="book"] text`).fontSize, 13),
      family: text.fontFamily,
      fill: colour(text.fill) ?? "#000",
      halo: colour(text.stroke) ?? "#fff",
      haloWidth: number(text.strokeWidth, 7),
    },
  };
}
