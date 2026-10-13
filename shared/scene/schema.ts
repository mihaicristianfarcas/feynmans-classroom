/* JSON Schemas for structured output (strict mode: every property required, no extra keys,
 * nullable via anyOf). One schema per kind, plus a union for "pick the kind yourself". Every
 * expression field is a string ("2" is fine), so the model never has to choose a type. */
import type { SceneKind } from "./types.ts";

type S = Record<string, unknown>;
const str = (description?: string): S => (description ? { type: "string", description } : { type: "string" });
const num = (description?: string): S => (description ? { type: "number", description } : { type: "number" });
const bool = (description?: string): S => (description ? { type: "boolean", description } : { type: "boolean" });
const int = (description?: string): S => (description ? { type: "integer", description } : { type: "integer" });
const arr = (items: S, description?: string): S => ({ type: "array", items, ...(description ? { description } : {}) });
const enm = (values: string[], description?: string): S => ({
  type: "string",
  enum: values,
  ...(description ? { description } : {}),
});
const nullable = (schema: S): S => ({ anyOf: [schema, { type: "null" }] });
const obj = (properties: Record<string, S>, description?: string): S => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...(description ? { description } : {}),
});

const EXPR = 'expression over params, derived ids, t, clock, p, step (e.g. "a*sin(x)", "2")';
const TONE = enm(
  ["hi", "mid", "lo", "faint", "lit", "red", "green", "blue"],
  "hi subject · mid structure · lo/faint guides · lit the ONE thing to watch · red/green/blue only to tell things apart",
);
const WHEN = str('expression; element shown only while truthy; "" = always');
const INFO = str('one plain sentence shown when the reader taps it; "" = none');

const base: Record<string, S> = {
  title: str("card title, at most 32 characters"),
  hint: str("what to do, at most 36 characters, e.g. 'Drag the point · zoom in'"),
  caption: str("one or two plain sentences (max ~30 words): what the reader sees and why it matters"),
  params: arr(
    obj({
      id: str("identifier used in expressions, e.g. lat, voteB"),
      label: str("short control label"),
      kind: enm(["slider", "toggle", "choice"]),
      min: num(),
      max: num(),
      step: num(),
      value: num("default: the book's value"),
      unit: str('unit shown after the value, or ""'),
      options: arr(str(), "choice labels (value is the index); [] otherwise"),
    }),
    "0–4 controls the reader can change",
  ),
  derived: arr(
    obj({ id: str(), expr: str("expression; may use params and earlier derived ids") }),
    "named quantities computed every frame, in order",
  ),
  readout: str('template for the live readout, e.g. "v = {v:2} m/s" ({expr} or {expr:digits})'),
  stats: arr(obj({ label: str(), value: str("template") }), "0–4 live numbers"),
  keys: arr(obj({ tone: TONE, label: str(), style: enm(["line", "dashed", "dot", "fill"]) }), "legend, 2–4 entries"),
  duration: num("seconds of animation on the progress bar; 0 = none (with steps, ignored)"),
  loop: bool(),
  steps: arr(
    obj({
      title: str("2–4 words"),
      narration: str("one or two sentences shown under the figure during this step"),
      set: arr(obj({ param: str("param id"), value: str(EXPR) }), "param values this step eases to"),
      show: arr(str(), "element ids that appear at this step (hidden before)"),
      hide: arr(str(), "element ids that disappear at this step"),
      focus: arr(str(), "element ids drawn lit during this step"),
    }),
    "optional walkthrough, 0–8 steps",
  ),
  stepSeconds: num("seconds per step when playing, 2.5–5"),
  tour: str('a slider param id swept back and forth while idle, or ""'),
  predict: nullable(
    obj(
      { question: str(), choices: arr(str()), answer: int("index of the right choice"), explain: str() },
      "a 'predict first' question when a tempting wrong intuition exists",
    ),
  ),
};

const axis = obj({
  label: str("axis name with unit, e.g. 'h (m)'"),
  min: num(),
  max: num(),
  ticks: arr(num(), "[] for automatic"),
  log: bool(),
});
const pair = arr(str(EXPR), "exactly two expressions [x, y]");
const layer = (type: string, props: Record<string, S>) =>
  obj({ type: enm([type]), id: str("unique id"), ...props, when: WHEN, info: INFO });

export const PLOT_SCHEMA = obj({
  kind: enm(["plot"]),
  ...base,
  x: axis,
  y: axis,
  grid: bool(),
  equal: bool("same scale on both axes (geometry)"),
  layers: arr(
    {
      anyOf: [
        layer("function", {
          expr: str('y as an expression of x, e.g. "a*x^2"'),
          label: str('short curve label, or ""'),
          tone: TONE,
          dashed: bool(),
          domain: nullable(arr(str(EXPR), "[from, to]")),
        }),
        layer("parametric", {
          x: str("x(s)"),
          y: str("y(s)"),
          from: str(EXPR),
          to: str(EXPR),
          label: str(),
          tone: TONE,
          dashed: bool(),
        }),
        layer("area", {
          expr: str("top y(x)"),
          base: str('bottom y(x), often "0"'),
          from: str(EXPR),
          to: str(EXPR),
          label: str(),
          tone: TONE,
        }),
        layer("series", {
          points: arr(arr(num()), "[[x, y], …] data from the text"),
          label: str(),
          tone: TONE,
          dashed: bool(),
          dots: bool(),
          line: bool(),
        }),
        layer("bars", {
          xs: arr(str(EXPR)),
          heights: arr(str(EXPR)),
          width: num("in x units"),
          labels: arr(str(), "category names under the bars, or []"),
          tone: TONE,
        }),
        layer("point", {
          x: str(EXPR),
          y: str(EXPR),
          label: str("template"),
          tone: TONE,
          drag: nullable(
            obj({
              x: str('slider param set by dragging horizontally, or ""'),
              y: str('slider param set by dragging vertically, or ""'),
            }),
          ),
          trail: bool(),
        }),
        layer("vector", { from: pair, to: pair, label: str("template"), tone: TONE, arrow: bool(), dashed: bool() }),
        layer("tangent", {
          of: str("id of a function layer"),
          at: str("x where it touches"),
          label: str("template"),
          tone: TONE,
          dashed: bool(),
        }),
        layer("hline", { at: str("y"), label: str("template"), tone: TONE, dashed: bool() }),
        layer("vline", { at: str("x"), label: str("template"), tone: TONE, dashed: bool() }),
        layer("label", { x: str(EXPR), y: str(EXPR), text: str("template"), tone: TONE }),
      ],
    },
    "drawn in order: areas first, then curves, then points",
  ),
});

const event = (type: string, props: Record<string, S>) =>
  obj({
    type: enm([type]),
    id: str("unique id"),
    ...props,
    narration: str('sentence shown when time reaches this event, or ""'),
    when: WHEN,
  });

export const SEQUENCE_SCHEMA = obj({
  kind: enm(["sequence"]),
  ...base,
  actors: arr(
    obj({
      id: str(),
      label: str("short name"),
      sublabel: str('role, or ""'),
      shape: enm(["node", "client", "server", "database", "queue", "person", "process"]),
      info: INFO,
    }),
    "2–6 actors, left to right",
  ),
  events: arr({
    anyOf: [
      event("message", {
        from: str("actor id"),
        to: str("actor id"),
        at: str("send time (expression)"),
        arrive: str("arrival time (expression)"),
        label: str("template"),
        tone: TONE,
        lost: bool(),
        reply: bool("drawn dashed"),
      }),
      event("state", {
        actor: str("actor id"),
        at: str(EXPR),
        text: str("template, e.g. 'x = 5', 'LEADER'"),
        tone: TONE,
      }),
      event("span", { actor: str("actor id"), at: str(EXPR), until: str(EXPR), label: str(), tone: TONE }),
      event("crash", { actor: str("actor id"), at: str(EXPR), label: str() }),
      event("recover", { actor: str("actor id"), at: str(EXPR), label: str() }),
      event("partition", {
        actors: arr(str(), "actor ids cut off from the rest"),
        at: str(EXPR),
        until: str(EXPR),
        label: str(),
      }),
    ],
  }),
  unitSeconds: num("animation seconds per time unit, ~0.8–1.5"),
  timeLabel: str("time unit, e.g. 'ms', or \"\""),
  clocks: enm(["none", "lamport", "vector"]),
});

export const GRAPH_SCHEMA = obj({
  kind: enm(["graph"]),
  ...base,
  layout: enm(["force", "layered", "tree", "circle", "row", "grid", "manual"]),
  nodes: arr(
    obj({
      id: str(),
      label: str("short, ≤ 16 chars"),
      sublabel: str('template under the label, or ""'),
      shape: enm(["circle", "box", "pill", "diamond", "database", "cell"]),
      x: num("0–100, used by manual layout"),
      y: num("0–100, used by manual layout"),
      group: str('group id or ""'),
      tone: TONE,
      when: WHEN,
      info: INFO,
    }),
    "2–16 nodes",
  ),
  edges: arr(
    obj({
      id: str(),
      from: str("node id"),
      to: str("node id"),
      label: str('template or ""'),
      tone: TONE,
      dashed: bool(),
      arrow: bool(),
      curve: num("-1…1 bend, 0 straight"),
      when: WHEN,
      info: INFO,
    }),
  ),
  tokens: arr(
    obj({
      id: str(),
      path: arr(str(), "node ids it travels through"),
      at: str("start time in seconds (expression)"),
      speed: str("seconds per hop (expression)"),
      label: str(),
      tone: TONE,
      loop: bool(),
      when: WHEN,
    }),
    "moving dots: requests, packets, goods",
  ),
  groups: arr(
    obj({ id: str(), label: str(), nodes: arr(str()) }),
    "boxes around related nodes (datacenters, partitions)",
  ),
});

export const OBJECT3D_SCHEMA = obj({
  kind: enm(["object3d"]),
  ...base,
  parts: arr(
    obj({
      id: str(),
      label: str('part name, or ""'),
      shape: enm(["box", "cylinder", "cone", "sphere", "torus", "capsule", "prism", "tube", "plate"]),
      size: arr(
        num(),
        "box/plate [w, d, h] · cylinder [r, h] · cone [r, h, topR] · sphere [r] · torus [R, tube] · capsule [r, h] · prism [r, h, sides] · tube [r, h, wall]",
      ),
      position: arr(str(EXPR), "[x, y, z] centre, z up; expressions may move it"),
      rotation: arr(str(EXPR), "[rx, ry, rz] degrees; cylinders stand along z"),
      tone: TONE,
      explode: arr(num(), "[dx, dy, dz] offset when taken apart"),
      group: str('group id or ""'),
      when: WHEN,
      info: INFO,
    }),
    "4–40 parts",
  ),
  azimuth: num("camera degrees, ~30–45"),
  elevation: num("camera degrees, ~18–35"),
  explodable: bool(),
  labels: bool("show part names beside the object"),
  cutaway: arr(str(), "part or group ids hidden by the Cutaway toggle"),
});

const FILL = enm(
  ["paper", "tint", "solid", "none"],
  "paper: opaque body · tint: soft fill (liquids, regions) · solid: filled with the tone · none: outline",
);
const DRAG = nullable(
  obj({
    x: str('slider param set by dragging horizontally, or ""'),
    y: str('slider param set by dragging vertically, or ""'),
  }),
);
const shapeOf = (type: string, props: Record<string, S>) =>
  obj({
    type: enm([type]),
    id: str("unique id"),
    ...props,
    tone: TONE,
    label: str('short name drawn beside it (template), or ""'),
    when: WHEN,
    info: INFO,
  });
const XY = arr(arr(str(EXPR), "[x, y]"), "points [[x, y], …] in world units");

export const DIAGRAM_SCHEMA = obj({
  kind: enm(["diagram"]),
  ...base,
  width: num("world width in your units (x runs 0 → width)"),
  height: num("world height (y runs 0 → height, UP)"),
  shapes: arr(
    {
      anyOf: [
        shapeOf("rect", {
          x: str("centre x"),
          y: str("centre y"),
          w: str(EXPR),
          h: str(EXPR),
          rotate: str("degrees, counter-clockwise"),
          fill: FILL,
          drag: DRAG,
        }),
        shapeOf("circle", { x: str("centre x"), y: str("centre y"), r: str(EXPR), fill: FILL, drag: DRAG }),
        shapeOf("line", {
          points: XY,
          dashed: bool(),
          arrow: bool("arrow head at the last point"),
          width: num("stroke px, 0 = default"),
        }),
        shapeOf("polygon", { points: XY, fill: FILL }),
        shapeOf("curve", {
          x: str("x(s)"),
          y: str("y(s)"),
          from: str("s from"),
          to: str("s to"),
          dashed: bool(),
          fill: FILL,
        }),
        shapeOf("dots", {
          count: int("how many (≤ 400)"),
          x: str("x of dot i (expression in i, N, t, clock…)"),
          y: str("y of dot i"),
          r: str("radius of dot i"),
        }),
        shapeOf("spring", { from: arr(str(EXPR), "[x, y]"), to: arr(str(EXPR), "[x, y]"), coils: int() }),
        shapeOf("arc", {
          x: str("centre x"),
          y: str("centre y"),
          r: str(EXPR),
          from: str("start angle, degrees"),
          to: str("end angle, degrees"),
          arrow: bool(),
        }),
        shapeOf("ground", { x1: str(EXPR), x2: str(EXPR), y: str(EXPR) }),
        shapeOf("text", { x: str(EXPR), y: str(EXPR), text: str("template"), size: num("px, 10–16") }),
      ],
    },
    "drawn in order: back to front",
  ),
});

export const KIND_SCHEMAS: Record<SceneKind, S> = {
  plot: PLOT_SCHEMA,
  sequence: SEQUENCE_SCHEMA,
  graph: GRAPH_SCHEMA,
  object3d: OBJECT3D_SCHEMA,
  diagram: DIAGRAM_SCHEMA,
};

/** The schema a generation call sends: one kind, or any kind (wrapped, as the root must be an object). */
export function sceneSchema(kind: SceneKind | "auto"): S {
  if (kind !== "auto") return obj({ scene: KIND_SCHEMAS[kind] });
  return obj({ scene: { anyOf: Object.values(KIND_SCHEMAS) } });
}

/** Rewrites a value so it matches a schema's types (numbers where strings are expected become strings). */
export function coerceToSchema(value: unknown, schema: S): unknown {
  if (schema.anyOf) {
    const options = (schema.anyOf as S[]).filter((o) => o.type !== "null");
    if (value === null || value === undefined)
      return (schema.anyOf as S[]).some((o) => o.type === "null") ? null : value;
    // discriminated unions: pick the option whose "type" or "kind" enum names the value's
    const tag = (o: S, key: string) =>
      ((o.properties as Record<string, S> | undefined)?.[key]?.enum as string[] | undefined) || [];
    const v = value as Record<string, unknown>;
    const match =
      options.find((o) => tag(o, "type").includes(v.type as string) || tag(o, "kind").includes(v.kind as string)) ||
      options[0];
    return coerceToSchema(value, match);
  }
  if (schema.type === "string") return typeof value === "number" ? String(value) : (value ?? "");
  if (schema.type === "array")
    return Array.isArray(value) ? value.map((item) => coerceToSchema(item, schema.items as S)) : [];
  if (schema.type === "object" && value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, sub] of Object.entries(schema.properties as Record<string, S>))
      out[k] = coerceToSchema((value as Record<string, unknown>)[k], sub);
    return out;
  }
  return value;
}
