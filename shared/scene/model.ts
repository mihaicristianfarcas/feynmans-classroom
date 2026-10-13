/* The time model and scope shared by every scene kind, plus normalize(), which turns whatever a
 * model (or a hand edit) produced into a complete spec with sane defaults and bounds. */
import { evalAny, evalNum, type Scope } from "./expr.ts";
import type { Actor, Fill, GEdge, GGroup, GNode, Key, Param, Part, PlotLayer, Predict, Scene, SeqEvent, Shape, Stat, Step, Token, Tone } from "./types.ts";
import { TONES } from "./types.ts";

/* ---------------- normalize ---------------- */

const str = (v: unknown, max = 400) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v)).trim().slice(0, max);
const numOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
const expr = (v: unknown, d: string | number = "0"): string | number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() ? v.trim().slice(0, 600) : d);
const tone = (v: unknown, d: Tone = "hi"): Tone => (TONES.includes(v as Tone) ? (v as Tone) : d);
const bool = (v: unknown, d = false) => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const ident = (v: unknown, fallback: string) => {
  const s = str(v, 60).replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return s || fallback;
};
/** Element ids end up in SVG attributes and selectors: keep only inert characters. */
const sid = (v: unknown) => str(v, 60).replace(/[^A-Za-z0-9_.:-]/g, "_");
const ids = (v: unknown) => arr<unknown>(v).map(sid).filter(Boolean);

function uniq<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((item, i) => {
    let id = item.id || `${prefix}${i + 1}`;
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    return { ...item, id };
  });
}

function normParam(raw: Record<string, unknown>, i: number): Param {
  const kind = raw.kind === "toggle" || raw.kind === "choice" ? raw.kind : "slider";
  const options = arr<unknown>(raw.options).map((o) => str(o, 40)).filter(Boolean).slice(0, 8);
  let min = numOr(raw.min, 0),
    max = numOr(raw.max, kind === "slider" ? 10 : 1);
  if (kind === "toggle") [min, max] = [0, 1];
  if (kind === "choice") [min, max] = [0, Math.max(1, options.length - 1)];
  if (max < min) [min, max] = [max, min];
  if (max === min) max = min + 1;
  const step = kind === "slider" ? Math.max(Math.abs(numOr(raw.step, (max - min) / 100)) || (max - min) / 100, 1e-9) : 1;
  const value = Math.min(max, Math.max(min, numOr(raw.value, min)));
  return { id: ident(raw.id, `p${i + 1}`), label: str(raw.label, 40) || str(raw.id, 40), kind, min, max, step, value, unit: str(raw.unit, 16), options };
}

function normBase(raw: Record<string, unknown>) {
  const params = uniq(arr<Record<string, unknown>>(raw.params).slice(0, 6).map(normParam), "p");
  const steps: Step[] = arr<Record<string, unknown>>(raw.steps)
    .slice(0, 16)
    .map((s) => ({
      title: str(s.title, 60),
      narration: str(s.narration, 800),
      set: arr<Record<string, unknown>>(s.set)
        .map((x) => ({ param: sid(x.param), value: expr(x.value) }))
        .filter((x) => x.param),
      show: ids(s.show),
      hide: ids(s.hide),
      focus: ids(s.focus),
    }));
  const p = raw.predict as Record<string, unknown> | null;
  const choices = p ? arr<unknown>(p.choices).map((c) => str(c, 120)).filter(Boolean).slice(0, 4) : [];
  const predict: Predict | null = p && str(p.question) && choices.length >= 2 ? { question: str(p.question, 300), choices, answer: Math.max(0, Math.min(choices.length - 1, Math.round(numOr(p.answer, 0)))), explain: str(p.explain, 500) } : null;
  return {
    title: str(raw.title, 48) || "Figure",
    hint: str(raw.hint, 60),
    caption: str(raw.caption, 400),
    params,
    derived: uniq(
      arr<Record<string, unknown>>(raw.derived)
        .slice(0, 24)
        .map((d, i) => ({ id: ident(d.id, `d${i + 1}`), expr: expr(d.expr) })),
      "d",
    ),
    readout: str(raw.readout, 400),
    stats: arr<Record<string, unknown>>(raw.stats)
      .slice(0, 5)
      .map((s): Stat => ({ label: str(s.label, 40), value: str(s.value, 300) }))
      .filter((s) => s.label || s.value),
    keys: arr<Record<string, unknown>>(raw.keys)
      .slice(0, 5)
      .map((k): Key => ({ tone: tone(k.tone, "hi"), label: str(k.label, 40), style: (["line", "dashed", "dot", "fill"].includes(k.style as string) ? k.style : "line") as Key["style"] }))
      .filter((k) => k.label),
    duration: Math.max(0, Math.min(600, numOr(raw.duration, 0))),
    loop: bool(raw.loop, true),
    steps,
    stepSeconds: Math.max(0.8, Math.min(20, numOr(raw.stepSeconds, 3))),
    tour: params.some((x) => x.id === sid(raw.tour) && x.kind === "slider") ? sid(raw.tour) : "",
    predict,
  };
}

const when = (v: unknown) => expr(v, "");
const info = (v: unknown) => str(v, 300);

function normLayer(raw: Record<string, unknown>, i: number): PlotLayer | null {
  const base = { id: ident(raw.id, `l${i + 1}`), label: str(raw.label, 240), tone: tone(raw.tone, "hi"), when: when(raw.when), info: info(raw.info) };
  const pair = (v: unknown, d: [string | number, string | number]): [string | number, string | number] => {
    const a = arr<unknown>(v);
    return a.length >= 2 ? [expr(a[0], d[0]), expr(a[1], d[1])] : d;
  };
  switch (raw.type) {
    case "function": {
      const dom = arr<unknown>(raw.domain);
      return { type: "function", ...base, expr: expr(raw.expr, "x"), dashed: bool(raw.dashed), domain: dom.length >= 2 && (dom[0] !== "" || dom[1] !== "") ? [expr(dom[0], "-inf"), expr(dom[1], "inf")] : null };
    }
    case "parametric":
      return { type: "parametric", ...base, x: expr(raw.x, "cos(s)"), y: expr(raw.y, "sin(s)"), from: expr(raw.from, 0), to: expr(raw.to, "tau"), dashed: bool(raw.dashed) };
    case "area":
      return { type: "area", ...base, tone: tone(raw.tone, "mid"), expr: expr(raw.expr, "x"), base: expr(raw.base, 0), from: expr(raw.from, 0), to: expr(raw.to, 1) };
    case "series":
      return {
        type: "series",
        ...base,
        points: arr<unknown>(raw.points)
          .map((p) => arr<unknown>(p).map((v) => numOr(v, NaN)) as [number, number])
          .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .slice(0, 2000),
        dashed: bool(raw.dashed),
        dots: bool(raw.dots, true),
        line: bool(raw.line, true),
      };
    case "bars":
      return { type: "bars", ...base, tone: tone(raw.tone, "mid"), xs: arr<unknown>(raw.xs).map((v) => expr(v)).slice(0, 60), heights: arr<unknown>(raw.heights).map((v) => expr(v)).slice(0, 60), width: Math.max(0, numOr(raw.width, 0.6)), labels: arr<unknown>(raw.labels).map((v) => str(v, 24)) };
    case "point": {
      const drag = raw.drag as Record<string, unknown> | null;
      return { type: "point", ...base, tone: tone(raw.tone, "lit"), x: expr(raw.x), y: expr(raw.y), drag: drag && (str(drag.x) || str(drag.y)) ? { x: sid(drag.x), y: sid(drag.y) } : null, trail: bool(raw.trail) };
    }
    case "vector":
      return { type: "vector", ...base, from: pair(raw.from, [0, 0]), to: pair(raw.to, [1, 1]), arrow: bool(raw.arrow, true), dashed: bool(raw.dashed) };
    case "tangent":
      return { type: "tangent", ...base, tone: tone(raw.tone, "lit"), of: sid(raw.of), at: expr(raw.at), dashed: bool(raw.dashed) };
    case "hline":
    case "vline":
      return { type: raw.type, ...base, tone: tone(raw.tone, "mid"), at: expr(raw.at), dashed: bool(raw.dashed, true) };
    case "label":
      return { type: "label", ...base, tone: tone(raw.tone, "mid"), x: expr(raw.x), y: expr(raw.y), text: str(raw.text, 240) };
  }
  return null;
}

function normAxis(raw: unknown, d: { min: number; max: number }) {
  const a = (raw || {}) as Record<string, unknown>;
  let min = numOr(a.min, d.min),
    max = numOr(a.max, d.max);
  if (max < min) [min, max] = [max, min];
  if (max === min) max = min + 1;
  const log = bool(a.log) && min > 0;
  return { label: str(a.label, 40), min, max, ticks: arr<unknown>(a.ticks).map((v) => numOr(v, NaN)).filter(Number.isFinite).slice(0, 20), log };
}

const ACTOR_SHAPES = ["node", "client", "server", "database", "queue", "person", "process"];
const NODE_SHAPES = ["circle", "box", "pill", "diamond", "database", "cell"];
const PART_SHAPES = ["box", "cylinder", "cone", "sphere", "torus", "capsule", "prism", "tube", "plate"];
const LAYOUTS = ["force", "layered", "tree", "circle", "row", "grid", "manual"];

/** Completes and bounds a spec. Throws only when the kind is unknown. */
export function normalize(input: unknown): Scene {
  const raw = (input || {}) as Record<string, unknown>;
  const base = normBase(raw);
  switch (raw.kind) {
    case "plot": {
      const layers = uniq(arr<Record<string, unknown>>(raw.layers).slice(0, 24).map(normLayer).filter((l): l is PlotLayer => !!l), "l");
      return { kind: "plot", ...base, x: normAxis(raw.x, { min: -5, max: 5 }), y: normAxis(raw.y, { min: -5, max: 5 }), grid: bool(raw.grid), equal: bool(raw.equal), layers };
    }
    case "sequence": {
      const actors = uniq(
        arr<Record<string, unknown>>(raw.actors)
          .slice(0, 8)
          .map((a, i): Actor => ({ id: ident(a.id, `a${i + 1}`), label: str(a.label, 24) || str(a.id, 24), sublabel: str(a.sublabel, 32), shape: (ACTOR_SHAPES.includes(a.shape as string) ? a.shape : "node") as Actor["shape"], info: info(a.info) })),
        "a",
      );
      const events = uniq(
        arr<Record<string, unknown>>(raw.events)
          .slice(0, 80)
          .map((e, i): SeqEvent | null => {
            const b = { id: ident(e.id, `e${i + 1}`), at: expr(e.at, i), narration: str(e.narration, 800), when: when(e.when) };
            switch (e.type) {
              case "message":
                return { type: "message", ...b, from: sid(e.from), to: sid(e.to), arrive: expr(e.arrive, ""), label: str(e.label, 240), tone: tone(e.tone, "hi"), lost: bool(e.lost), reply: bool(e.reply) };
              case "state":
                return { type: "state", ...b, actor: sid(e.actor), text: str(e.text, 240), tone: tone(e.tone, "hi") };
              case "span":
                return { type: "span", ...b, actor: sid(e.actor), until: expr(e.until, ""), label: str(e.label, 32), tone: tone(e.tone, "mid") };
              case "crash":
              case "recover":
                return { type: e.type, ...b, actor: sid(e.actor), label: str(e.label, 32) };
              case "partition":
                return { type: "partition", ...b, actors: ids(e.actors), until: expr(e.until, ""), label: str(e.label, 32) };
            }
            return null;
          })
          .filter((e): e is SeqEvent => !!e),
        "e",
      );
      return { kind: "sequence", ...base, actors, events, unitSeconds: Math.max(0.1, Math.min(10, numOr(raw.unitSeconds, 1))), timeLabel: str(raw.timeLabel, 12), clocks: raw.clocks === "lamport" || raw.clocks === "vector" ? raw.clocks : "none" };
    }
    case "graph": {
      const nodes = uniq(
        arr<Record<string, unknown>>(raw.nodes)
          .slice(0, 48)
          .map((n, i): GNode => ({
            id: sid(n.id) || `n${i + 1}`,
            label: str(n.label, 200),
            sublabel: str(n.sublabel, 240),
            shape: (NODE_SHAPES.includes(n.shape as string) ? n.shape : "circle") as GNode["shape"],
            x: Math.max(0, Math.min(100, numOr(n.x, NaN))),
            y: Math.max(0, Math.min(100, numOr(n.y, NaN))),
            group: sid(n.group),
            tone: tone(n.tone, "hi"),
            when: when(n.when),
            info: info(n.info),
          })),
        "n",
      );
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edges = uniq(
        arr<Record<string, unknown>>(raw.edges)
          .slice(0, 96)
          .map((e, i): GEdge => ({ id: sid(e.id) || `e${i + 1}`, from: sid(e.from), to: sid(e.to), label: str(e.label, 240), tone: tone(e.tone, "mid"), dashed: bool(e.dashed), arrow: bool(e.arrow, true), curve: Math.max(-1, Math.min(1, numOr(e.curve, 0))), when: when(e.when), info: info(e.info) }))
          .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)),
        "e",
      );
      const tokens = uniq(
        arr<Record<string, unknown>>(raw.tokens)
          .slice(0, 24)
          .map((k, i): Token => ({ id: sid(k.id) || `k${i + 1}`, path: ids(k.path).filter((id) => nodeIds.has(id)), at: expr(k.at, 0), speed: expr(k.speed, 1), label: str(k.label, 24), tone: tone(k.tone, "lit"), loop: bool(k.loop), when: when(k.when) }))
          .filter((k) => k.path.length >= 2),
        "k",
      );
      const groups = uniq(
        arr<Record<string, unknown>>(raw.groups)
          .slice(0, 12)
          .map((g, i): GGroup => ({ id: sid(g.id) || `g${i + 1}`, label: str(g.label, 32), nodes: ids(g.nodes).filter((id) => nodeIds.has(id)) })),
        "g",
      );
      // nodes that name a group they are not listed in join it
      for (const node of nodes) {
        const g = groups.find((x) => x.id === node.group);
        if (g && !g.nodes.includes(node.id)) g.nodes.push(node.id);
      }
      return { kind: "graph", ...base, layout: (LAYOUTS.includes(raw.layout as string) ? raw.layout : "force") as never, nodes, edges, tokens, groups: groups.filter((g) => g.nodes.length) };
    }
    case "object3d": {
      const triple = (v: unknown, d: string | number = 0): [string | number, string | number, string | number] => {
        const a = arr<unknown>(v);
        return [expr(a[0], d), expr(a[1], d), expr(a[2], d)];
      };
      const parts = uniq(
        arr<Record<string, unknown>>(raw.parts)
          .slice(0, 80)
          .map((p, i): Part => ({
            id: sid(p.id) || `part${i + 1}`,
            label: str(p.label, 32),
            shape: (PART_SHAPES.includes(p.shape as string) ? p.shape : "box") as Part["shape"],
            size: arr<unknown>(p.size)
              .map((v) => Math.max(0, numOr(v, 0)))
              .slice(0, 3),
            position: triple(p.position),
            rotation: triple(p.rotation),
            tone: tone(p.tone, "hi"),
            explode: arr<unknown>(p.explode).length >= 3 ? (arr<unknown>(p.explode).slice(0, 3).map((v) => numOr(v, 0)) as [number, number, number]) : [0, 0, 0],
            group: sid(p.group),
            when: when(p.when),
            info: info(p.info),
          })),
        "part",
      );
      const cutaway = ids(raw.cutaway).filter((id) => parts.some((p) => p.id === id || p.group === id));
      const explodable = bool(raw.explodable) || parts.some((p) => p.explode.some((v) => v !== 0));
      const params = [...base.params];
      if (explodable && parts.some((p) => p.explode.some((v) => v !== 0)) && !params.some((p) => p.id === "explode")) params.push({ id: "explode", label: "Take apart", kind: "slider", min: 0, max: 1, step: 0.01, value: 0, unit: "", options: [] });
      if (cutaway.length && !params.some((p) => p.id === "cutaway")) params.push({ id: "cutaway", label: "Cutaway", kind: "toggle", min: 0, max: 1, step: 1, value: 0, unit: "", options: [] });
      return { kind: "object3d", ...base, params, parts, azimuth: numOr(raw.azimuth, 35), elevation: Math.max(-89, Math.min(89, numOr(raw.elevation, 28))), explodable, labels: bool(raw.labels, true), cutaway };
    }
    case "diagram": {
      const fill = (v: unknown, d: Fill = "paper"): Fill => (["paper", "tint", "solid", "none"].includes(v as string) ? (v as Fill) : d);
      const pt = (v: unknown): [string | number, string | number] => {
        const a = arr<unknown>(v);
        return [expr(a[0], 0), expr(a[1], 0)];
      };
      const drag = (v: unknown) => {
        const d = v as Record<string, unknown> | null;
        return d && (str(d.x) || str(d.y)) ? { x: sid(d.x), y: sid(d.y) } : null;
      };
      const shapes = uniq(
        arr<Record<string, unknown>>(raw.shapes)
          .slice(0, 80)
          .map((sh, i): Shape | null => {
            const b = { id: ident(sh.id, `s${i + 1}`), tone: tone(sh.tone, "hi"), label: str(sh.label, 240), when: when(sh.when), info: info(sh.info) };
            switch (sh.type) {
              case "rect":
                return { type: "rect", ...b, x: expr(sh.x), y: expr(sh.y), w: expr(sh.w, 1), h: expr(sh.h, 1), rotate: expr(sh.rotate, 0), fill: fill(sh.fill), drag: drag(sh.drag) };
              case "circle":
                return { type: "circle", ...b, x: expr(sh.x), y: expr(sh.y), r: expr(sh.r, 1), fill: fill(sh.fill), drag: drag(sh.drag) };
              case "line":
                return { type: "line", ...b, points: arr<unknown>(sh.points).map(pt).slice(0, 60), dashed: bool(sh.dashed), arrow: bool(sh.arrow), width: Math.max(0, Math.min(6, numOr(sh.width, 0))) };
              case "polygon":
                return { type: "polygon", ...b, points: arr<unknown>(sh.points).map(pt).slice(0, 60), fill: fill(sh.fill, "tint") };
              case "curve":
                return { type: "curve", ...b, x: expr(sh.x, "s"), y: expr(sh.y, "0"), from: expr(sh.from, 0), to: expr(sh.to, 1), dashed: bool(sh.dashed), fill: fill(sh.fill, "none") };
              case "dots":
                return { type: "dots", ...b, count: Math.max(1, Math.min(400, Math.round(numOr(sh.count, 20)))), x: expr(sh.x, "i"), y: expr(sh.y, "0"), r: expr(sh.r, 0.1) };
              case "spring":
                return { type: "spring", ...b, from: pt(sh.from), to: pt(sh.to), coils: Math.round(numOr(sh.coils, 8)) };
              case "arc":
                return { type: "arc", ...b, x: expr(sh.x), y: expr(sh.y), r: expr(sh.r, 1), from: expr(sh.from, 0), to: expr(sh.to, 90), arrow: bool(sh.arrow) };
              case "ground":
                return { type: "ground", ...b, tone: tone(sh.tone, "mid"), x1: expr(sh.x1, 0), x2: expr(sh.x2, numOr(raw.width, 10)), y: expr(sh.y, 0) };
              case "text":
                return { type: "text", ...b, tone: tone(sh.tone, "mid"), x: expr(sh.x), y: expr(sh.y), text: str(sh.text, 240), size: Math.max(9, Math.min(18, numOr(sh.size, 12))) };
            }
            return null;
          })
          .filter((x): x is Shape => !!x),
        "s",
      );
      return { kind: "diagram", ...base, width: Math.max(1e-3, numOr(raw.width, 10)), height: Math.max(1e-3, numOr(raw.height, 6)), shapes };
    }
  }
  throw new Error(`unknown scene kind "${String(raw.kind)}"`);
}

/* ---------------- timeline ---------------- */

export interface Timeline {
  mode: "steps" | "clock" | "events" | "none";
  /** Seconds. 0 for none. */
  length: number;
  /** Times (seconds) the step buttons jump between. */
  stops: number[];
}

export function eventTime(e: SeqEvent, scope: Scope): number {
  return evalNum(e.at, scope, 0);
}
export function arriveTime(e: Extract<SeqEvent, { type: "message" }>, scope: Scope): number {
  const at = eventTime(e, scope);
  const arrive = e.arrive === "" ? at + 1 : evalNum(e.arrive, scope, at + 1);
  return Math.max(at, arrive);
}

export function timelineOf(spec: Scene, scope: Scope): Timeline {
  if (spec.steps.length) {
    return { mode: "steps", length: spec.steps.length * spec.stepSeconds, stops: spec.steps.map((_, i) => i * spec.stepSeconds) };
  }
  if (spec.kind === "sequence" && spec.events.length) {
    const times: number[] = [];
    let end = 0;
    for (const e of spec.events) {
      const at = eventTime(e, scope);
      times.push(at);
      end = Math.max(end, at);
      if (e.type === "message") {
        const arrive = arriveTime(e, scope);
        times.push(arrive);
        end = Math.max(end, arrive);
      }
      if ((e.type === "span" || e.type === "partition") && e.until !== "") end = Math.max(end, evalNum(e.until, scope, at));
    }
    const u = spec.unitSeconds;
    const stops = [...new Set([0, ...times.filter(Number.isFinite).map((x) => Math.max(0, x))])].sort((a, b) => a - b).map((x) => x * u);
    return { mode: "events", length: Math.max(spec.duration, (end + 0.6) * u), stops };
  }
  if (spec.duration > 0) return { mode: "clock", length: spec.duration, stops: [] };
  return { mode: "none", length: 0, stops: [] };
}

/* ---------------- steps ---------------- */

export function stepAt(spec: Scene, t: number): { step: number; stepT: number } {
  if (!spec.steps.length) return { step: 0, stepT: 0 };
  const i = Math.max(0, Math.min(spec.steps.length - 1, Math.floor(t / spec.stepSeconds + 1e-9)));
  return { step: i, stepT: Math.max(0, Math.min(1, t / spec.stepSeconds - i)) };
}

/** Which ids are shown at a step: ids introduced by a later step are hidden until it. */
export function visibilityAt(spec: Scene, step: number): (id: string) => boolean {
  if (!spec.steps.length) return () => true;
  const introduced = new Set(spec.steps.flatMap((s) => s.show));
  const state = new Map<string, boolean>();
  for (let i = 0; i <= Math.min(step, spec.steps.length - 1); i++) {
    for (const id of spec.steps[i].show) state.set(id, true);
    for (const id of spec.steps[i].hide) state.set(id, false);
  }
  return (id) => (state.has(id) ? state.get(id)! : !introduced.has(id));
}

/** Parameter targets for a step: the latest value any step up to it set (expressions over the base scope). */
export function stepParamTargets(spec: Scene, step: number, base: Scope): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i <= Math.min(step, spec.steps.length - 1); i++) {
    for (const s of spec.steps[i].set) {
      const v = evalNum(s.value, { ...base, ...out }, NaN);
      if (Number.isFinite(v)) out[s.param] = v;
    }
  }
  return out;
}

/* ---------------- scope ---------------- */

export function defaults(spec: Scene): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.id, p.value]));
}

/** The full scope for a frame: params, time, step and derived values (in order; a failing one is NaN). */
export function buildScope(spec: Scene, params: Record<string, number>, t: number, timeline: Timeline, clock = t): Scope {
  const { step, stepT } = stepAt(spec, t);
  const scope: Scope = { ...params, t, clock, p: timeline.length ? Math.min(1, t / timeline.length) : 0, step, stepT, steps: spec.steps.length };
  if (spec.kind === "sequence") scope.now = t / spec.unitSeconds;
  for (const d of spec.derived) {
    scope[d.id] = (() => {
      try {
        return evalAnyValue(d.expr, scope);
      } catch {
        return NaN;
      }
    })();
  }
  return scope;
}

function evalAnyValue(e: string | number, scope: Scope) {
  const v = evalAny(e, scope);
  return typeof v === "boolean" ? (v ? 1 : 0) : v;
}

/** Names the platform defines; params and derived values may not take them. */
export const RESERVED = new Set(["t", "clock", "p", "step", "stepT", "steps", "now", "x", "s", "i", "N"]);

/** Built-in names every expression may use, per kind (on top of params and derived values). */
export function scopeNames(spec: Scene): Set<string> {
  const names = new Set(["t", "clock", "p", "step", "stepT", "steps", ...spec.params.map((p) => p.id), ...spec.derived.map((d) => d.id)]);
  if (spec.kind === "sequence") names.add("now");
  return names;
}
