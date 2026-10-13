// The figure engine: the expression language, every reference figure, validation, time and steps,
// and that specs can't inject markup.
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../shared/scene/examples.ts";
import { compile, evalNum, fillTemplate, formatNumber } from "../shared/scene/expr.ts";
import {
  buildScope,
  defaults,
  type FrameState,
  normalize,
  renderScene,
  type Scene,
  stepParamTargets,
  timelineOf,
  visibilityAt,
} from "../shared/scene/index.ts";
import { coerceToSchema, KIND_SCHEMAS, sceneSchema } from "../shared/scene/schema.ts";
import { validateScene } from "../shared/scene/validate.ts";

const view = { zoom: 1, panX: 0, panY: 0, azimuth: 35, elevation: 28, moved: {} };
function frame(spec: Scene, t = 0, params = defaults(spec)): FrameState {
  const probe = buildScope(spec, params, 0, { mode: "none", length: 0, stops: [] });
  const scope = buildScope(spec, params, t, timelineOf(spec, probe));
  return { scope, vis: () => 1, focus: new Set(), hover: null, view, theme: "light", uid: "t" };
}

describe("expressions", () => {
  it("does arithmetic with the usual precedence", () => {
    expect(evalNum("1 + 2 * 3 ^ 2", {})).toBe(19);
    expect(evalNum("-x^2", { x: 3 })).toBe(-9);
    expect(evalNum("2x + 1", { x: 4 })).toBe(9);
    expect(evalNum("3(1 + 1)", {})).toBe(6);
    expect(evalNum("sqrt(16) + abs(-2) + max(1, 5)", {})).toBe(11);
  });
  it("handles comparisons, logic, ternaries and strings", () => {
    expect(compile("a > 1 && b ? 'yes' : 'no'")({ a: 2, b: 1 })).toBe("yes");
    expect(compile("v == 0 ? 'COMMIT' : 'ABORT'")({ v: 1 })).toBe("ABORT");
    expect(evalNum("not 0", {})).toBe(1);
    expect(evalNum("pick(2, 10, 20, 30)", {})).toBe(30);
  });
  it("never reaches outside the scope", () => {
    expect(() => compile("constructor.constructor('x')")).toThrow();
    expect(() => compile("window")({})).toThrow(/unknown name/);
    expect(() => compile("alert(1)")).toThrow(/unknown function/);
    expect(evalNum("process", {}, -1)).toBe(-1);
  });
  it("fills templates, digits included", () => {
    expect(fillTemplate("v = {v:2} m/s", { v: 1.23456 })).toBe("v = 1.23 m/s");
    expect(fillTemplate("{n} items, {ok ? 'fine' : 'bad'}", { n: 4, ok: 0 })).toBe("4 items, bad");
    expect(fillTemplate("{missing}", {})).toBe("—");
    expect(formatNumber(-2.5, 1)).toBe("−2.5");
  });
});

describe("reference figures", () => {
  for (const [name, raw] of Object.entries(EXAMPLES)) {
    it(`${name} validates and renders at several moments`, () => {
      const result = validateScene(raw);
      expect(result.errors).toEqual([]);
      const spec = normalize(raw);
      const memo = {};
      for (const t of [0, 1.3, 4.7]) {
        const out = renderScene(spec, frame(spec, t), memo);
        expect(out.svg.length).toBeGreaterThan(100);
        expect(out.svg).not.toMatch(/NaN/);
      }
    });
    it(`${name} matches its kind's structured-output schema`, () => {
      const kind = (raw as { kind: keyof typeof KIND_SCHEMAS }).kind;
      const coerced = coerceToSchema(raw, KIND_SCHEMAS[kind]) as Record<string, unknown>;
      // every property the schema requires is present
      for (const key of (KIND_SCHEMAS[kind] as { required: string[] }).required) expect(coerced).toHaveProperty(key);
    });
  }
  it("the union schema wraps one scene", () => {
    const s = sceneSchema("auto") as { properties: { scene: { anyOf: unknown[] } } };
    expect(s.properties.scene.anyOf).toHaveLength(5);
  });
});

describe("validation catches what a model gets wrong", () => {
  const base = EXAMPLES.tangent as Record<string, unknown>;
  it("unknown names", () => {
    const bad = { ...base, readout: "slope = {slop:2}" };
    expect(validateScene(bad).errors.join(" ")).toMatch(/unknown name "slop"/);
  });
  it("references to elements and params that don't exist", () => {
    const bad = {
      ...base,
      steps: [
        { title: "x", narration: "", set: [{ param: "nope", value: "1" }], show: ["ghost"], hide: [], focus: [] },
      ],
    };
    const errors = validateScene(bad).errors.join(" ");
    expect(errors).toMatch(/param "nope"/);
    expect(errors).toMatch(/"ghost"/);
  });
  it("reserved names for params", () => {
    const bad = {
      ...base,
      params: [{ id: "t", label: "t", kind: "slider", min: 0, max: 1, step: 0.1, value: 0, unit: "", options: [] }],
    };
    expect(validateScene(bad).errors.join(" ")).toMatch(/platform defines/);
  });
  it("derived values used before they are defined", () => {
    const bad = {
      ...base,
      derived: [
        { id: "a2", expr: "b2 + 1" },
        { id: "b2", expr: "2" },
      ],
    };
    expect(validateScene(bad).errors.join(" ")).toMatch(/not defined before it/);
  });
  it("crowded states on a lifeline", () => {
    const seq = EXAMPLES.twoPhaseCommit as { events: Record<string, unknown>[] };
    const bad = {
      ...seq,
      events: [
        ...seq.events,
        { type: "state", id: "dup", actor: "A", at: "lat + 0.16", text: "X", tone: "hi", narration: "", when: "" },
      ],
    };
    expect(validateScene(bad).errors.join(" ")).toMatch(/boxes overlap/);
  });
  it("an unknown kind", () => {
    expect(validateScene({ kind: "hologram" }).ok).toBe(false);
  });
});

describe("time, steps and visibility", () => {
  const raft = normalize(EXAMPLES.raft);
  it("steps make a timeline with one stop per step", () => {
    const tl = timelineOf(raft, {});
    expect(tl.mode).toBe("steps");
    expect(tl.stops).toHaveLength(5);
  });
  it("ids shown by a later step are hidden until it", () => {
    expect(visibilityAt(raft, 0)("timeout")).toBe(false);
    expect(visibilityAt(raft, 1)("timeout")).toBe(true);
    expect(visibilityAt(raft, 0)("follower")).toBe(true);
  });
  it("sequence timelines follow the event times and their params", () => {
    const seq = normalize(EXAMPLES.twoPhaseCommit);
    const fast = timelineOf(seq, { ...defaults(seq), lat: 0.5 });
    const slow = timelineOf(seq, { ...defaults(seq), lat: 2 });
    expect(slow.length).toBeGreaterThan(fast.length);
  });
  it("steps set params", () => {
    const spec = normalize({
      ...EXAMPLES.tangent,
      steps: [{ title: "a", narration: "", set: [{ param: "dx", value: "0.1" }], show: [], hide: [], focus: [] }],
    });
    expect(stepParamTargets(spec, 0, {}).dx).toBeCloseTo(0.1);
  });
});

describe("specs can't inject markup", () => {
  it("strips unsafe characters from ids and references", () => {
    const spec = normalize({
      kind: "graph",
      layout: "row",
      nodes: [
        { id: 'a" onmouseover="alert(1)', label: "<b>A</b>" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: 'a" onmouseover="alert(1)', to: "b" }],
    });
    const out = renderScene(spec, frame(spec), {});
    expect(out.svg).not.toMatch(/onmouseover="/);
    expect(out.svg).not.toMatch(/<b>/);
    expect(spec.kind === "graph" && spec.edges.length).toBe(1);
  });
});
