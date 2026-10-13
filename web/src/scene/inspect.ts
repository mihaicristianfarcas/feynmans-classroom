/* What the player needs to know about a figure's spec: whether it moves with time, what its parts are
 * called and say, and which parts can be dragged. */
import { compile } from "../../../shared/scene/expr.ts";
import type { Scene } from "../../../shared/scene/index.ts";

/** Does any expression in the spec read the clock? (Decides whether Play means anything.) */
export function usesTime(spec: Scene): boolean {
  const json = JSON.stringify(spec);
  const strings = json.match(/"(?:[^"\\]|\\.)*"/g) || [];
  for (const s of strings) {
    const v = s.slice(1, -1);
    if (!/[a-z]/i.test(v) || v.length > 600) continue;
    for (const src of v.includes("{") ? [...v.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]) : [v]) {
      try {
        const names = compile(src.replace(/:\d$/, "")).names;
        if (names.some((n) => n === "t" || n === "clock" || n === "p" || n === "now")) return true;
      } catch {}
    }
  }
  return spec.kind === "graph" && spec.tokens.length > 0;
}

/** Each part's label and note (what tapping it, or reading it with the arrow keys, shows). */
export function infoMap(spec: Scene): Map<string, { label: string; info: string }> {
  const out = new Map<string, { label: string; info: string }>();
  const add = (id: string, label: string, info: string) => (label || info) && out.set(id, { label, info });
  switch (spec.kind) {
    case "plot":
      for (const l of spec.layers) add(l.id, "label" in l ? l.label.replace(/\{[^}]*\}/g, "").trim() : "", l.info);
      break;
    case "sequence":
      for (const a of spec.actors) add(a.id, a.label, a.info);
      break;
    case "graph":
      for (const n of spec.nodes) add(n.id, n.label, n.info);
      for (const e of spec.edges) add(e.id, e.label, e.info);
      break;
    case "object3d":
      for (const p of spec.parts) add(p.id, p.label, p.info);
      break;
    case "diagram":
      for (const sh of spec.shapes) add(sh.id, sh.label.replace(/\{[^}]*\}/g, "").trim(), sh.info);
      break;
  }
  return out;
}

/** The parts the reader can drag: plot points and diagram shapes move their sliders (x, y), graph nodes
 * move themselves (null). */
export function movableParts(spec: Scene): Map<string, { x: string; y: string } | null> {
  const out = new Map<string, { x: string; y: string } | null>();
  if (spec.kind === "plot") for (const l of spec.layers) if ("drag" in l && l.drag) out.set(l.id, l.drag);
  if (spec.kind === "diagram") for (const sh of spec.shapes) if ("drag" in sh && sh.drag) out.set(sh.id, sh.drag);
  if (spec.kind === "graph") for (const n of spec.nodes) out.set(n.id, null);
  return out;
}

/** Figures whose motion is driven by the free-running clock keep moving after their timeline ends. */
export function usesClock(spec: Scene): boolean {
  return /\bclock\b/.test(JSON.stringify(spec));
}
