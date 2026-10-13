/* Checks a scene before anyone sees it: every expression parses and only uses names it may use,
 * every reference points at something, and a dry run (several moments, params at their ends)
 * renders without throwing. Errors go back to the model for one repair turn. */
import { BUILTIN_NAMES, compile, evalNum, ExprError, templateExprs } from "./expr.ts";
import { buildScope, defaults, normalize, RESERVED, scopeNames, stepParamTargets, timelineOf, visibilityAt } from "./model.ts";
import { renderDiagram } from "./diagram.ts";
import { renderGraph } from "./graph.ts";
import { renderObject3D } from "./object3d.ts";
import { renderPlot } from "./plot.ts";
import { renderSequence } from "./sequence.ts";
import type { FrameState, Scene } from "./types.ts";

export interface Validation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  scene: Scene | null;
}

export function elementIds(spec: Scene): Set<string> {
  switch (spec.kind) {
    case "plot":
      return new Set(spec.layers.map((l) => l.id));
    case "sequence":
      return new Set([...spec.actors.map((a) => a.id), ...spec.events.map((e) => e.id)]);
    case "graph":
      return new Set([...spec.nodes.map((n) => n.id), ...spec.edges.map((e) => e.id), ...spec.tokens.map((t) => t.id), ...spec.groups.map((g) => g.id)]);
    case "object3d":
      return new Set([...spec.parts.map((p) => p.id), ...spec.parts.map((p) => p.group).filter(Boolean)]);
    case "diagram":
      return new Set(spec.shapes.map((s) => s.id));
  }
}

/** Every expression in a spec with where it sits and the extra names it may use. */
function expressions(spec: Scene): { where: string; src: string | number; extra?: string[]; template?: boolean }[] {
  const out: { where: string; src: string | number; extra?: string[]; template?: boolean }[] = [];
  const add = (where: string, src: string | number, extra?: string[]) => {
    if (src !== "" && src !== undefined && src !== null) out.push({ where, src, extra });
  };
  const tpl = (where: string, src: string) => {
    for (const e of templateExprs(src)) out.push({ where, src: e, template: true });
  };
  tpl("readout", spec.readout);
  spec.stats.forEach((s, i) => tpl(`stats[${i}]`, s.value));
  spec.steps.forEach((s, i) => s.set.forEach((x, j) => add(`steps[${i}].set[${j}]`, x.value)));
  switch (spec.kind) {
    case "plot":
      for (const l of spec.layers) {
        const w = `layer "${l.id}"`;
        add(`${w}.when`, l.when);
        if ("label" in l && l.label) tpl(`${w}.label`, l.label);
        switch (l.type) {
          case "function":
            add(`${w}.expr`, l.expr, ["x"]);
            if (l.domain) l.domain.forEach((d, i) => add(`${w}.domain[${i}]`, d));
            break;
          case "parametric":
            add(`${w}.x`, l.x, ["s"]);
            add(`${w}.y`, l.y, ["s"]);
            add(`${w}.from`, l.from);
            add(`${w}.to`, l.to);
            break;
          case "area":
            add(`${w}.expr`, l.expr, ["x"]);
            add(`${w}.base`, l.base, ["x"]);
            add(`${w}.from`, l.from);
            add(`${w}.to`, l.to);
            break;
          case "bars":
            l.xs.forEach((x, i) => add(`${w}.xs[${i}]`, x));
            l.heights.forEach((x, i) => add(`${w}.heights[${i}]`, x));
            break;
          case "point":
          case "label":
            add(`${w}.x`, l.x);
            add(`${w}.y`, l.y);
            if (l.type === "label") tpl(`${w}.text`, l.text);
            break;
          case "vector":
            [...l.from, ...l.to].forEach((x, i) => add(`${w}.${i < 2 ? "from" : "to"}`, x));
            break;
          case "tangent":
          case "hline":
          case "vline":
            add(`${w}.at`, l.at);
            break;
        }
      }
      break;
    case "sequence":
      for (const e of spec.events) {
        const w = `event "${e.id}"`;
        add(`${w}.at`, e.at);
        add(`${w}.when`, e.when);
        if (e.type === "message") add(`${w}.arrive`, e.arrive);
        if (e.type === "span" || e.type === "partition") add(`${w}.until`, e.until);
        if (e.type === "message" && e.label) tpl(`${w}.label`, e.label);
        if (e.type === "state") tpl(`${w}.text`, e.text);
      }
      break;
    case "graph":
      for (const n of spec.nodes) {
        add(`node "${n.id}".when`, n.when);
        tpl(`node "${n.id}".label`, n.label);
        tpl(`node "${n.id}".sublabel`, n.sublabel);
      }
      for (const e of spec.edges) {
        add(`edge "${e.id}".when`, e.when);
        tpl(`edge "${e.id}".label`, e.label);
      }
      for (const t of spec.tokens) {
        add(`token "${t.id}".at`, t.at);
        add(`token "${t.id}".speed`, t.speed);
        add(`token "${t.id}".when`, t.when);
      }
      break;
    case "object3d":
      for (const p of spec.parts) {
        p.position.forEach((x, i) => add(`part "${p.id}".position[${i}]`, x));
        p.rotation.forEach((x, i) => add(`part "${p.id}".rotation[${i}]`, x));
        add(`part "${p.id}".when`, p.when);
      }
      break;
    case "diagram":
      for (const sh of spec.shapes) {
        const w = `shape "${sh.id}"`;
        add(`${w}.when`, sh.when);
        if (sh.label) tpl(`${w}.label`, sh.label);
        switch (sh.type) {
          case "rect":
            [sh.x, sh.y, sh.w, sh.h, sh.rotate].forEach((x, i) => add(`${w}.${["x", "y", "w", "h", "rotate"][i]}`, x));
            break;
          case "circle":
            [sh.x, sh.y, sh.r].forEach((x, i) => add(`${w}.${["x", "y", "r"][i]}`, x));
            break;
          case "line":
          case "polygon":
            sh.points.forEach(([x, y], i) => (add(`${w}.points[${i}]`, x), add(`${w}.points[${i}]`, y)));
            break;
          case "curve":
            add(`${w}.x`, sh.x, ["s"]);
            add(`${w}.y`, sh.y, ["s"]);
            add(`${w}.from`, sh.from);
            add(`${w}.to`, sh.to);
            break;
          case "dots":
            add(`${w}.x`, sh.x, ["i", "N"]);
            add(`${w}.y`, sh.y, ["i", "N"]);
            add(`${w}.r`, sh.r, ["i", "N"]);
            break;
          case "spring":
            [...sh.from, ...sh.to].forEach((x) => add(`${w}.ends`, x));
            break;
          case "arc":
            [sh.x, sh.y, sh.r, sh.from, sh.to].forEach((x, i) => add(`${w}.${["x", "y", "r", "from", "to"][i]}`, x));
            break;
          case "ground":
            [sh.x1, sh.x2, sh.y].forEach((x) => add(`${w}`, x));
            break;
          case "text":
            add(`${w}.x`, sh.x);
            add(`${w}.y`, sh.y);
            tpl(`${w}.text`, sh.text);
            break;
        }
      }
      break;
  }
  return out;
}

export function validateScene(input: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let spec: Scene;
  try {
    spec = normalize(input);
  } catch (error) {
    return { ok: false, errors: [(error as Error).message], warnings, scene: null };
  }
  const known = scopeNames(spec);
  const paramIds = new Set(spec.params.map((p) => p.id));
  const ids = elementIds(spec);

  for (const id of [...paramIds, ...spec.derived.map((d) => d.id)]) {
    if (RESERVED.has(id)) errors.push(`"${id}" is a name the platform defines (${[...RESERVED].join(", ")}): rename the param or derived value`);
    else if (BUILTIN_NAMES.has(id)) errors.push(`"${id}" is the name of a function or constant: rename the param or derived value`);
  }
  // derived values may only use names defined before them
  const before = new Set(["t", "clock", "p", "step", "stepT", "steps", "now", ...paramIds]);
  for (const d of spec.derived) {
    try {
      const c = compile(d.expr);
      const missing = c.names.filter((n) => !before.has(n));
      const local = missing.filter((n) => ["i", "N", "x", "s"].includes(n));
      if (local.length) errors.push(`derived "${d.id}" uses ${local.map((m) => `"${m}"`).join(", ")}: derived values are computed once per frame, and ${local.join(", ")} only exist${local.length > 1 ? "" : "s"} inside a shape or layer (i and N in a dots shape, x in a function, s in a curve). Delete "${d.id}" and write its expression directly where it is used`);
      const others = missing.filter((n) => !local.includes(n));
      if (others.length) errors.push(`derived "${d.id}" uses ${others.map((m) => `"${m}"`).join(", ")}, which ${others.length > 1 ? "are" : "is"} not defined before it (params, earlier derived values, t, clock, p, step)`);
    } catch (error) {
      errors.push(`derived "${d.id}": ${(error as Error).message}`);
    }
    if (paramIds.has(d.id)) errors.push(`derived "${d.id}" has the same id as a param`);
    before.add(d.id);
  }

  for (const { where, src, extra, template } of expressions(spec)) {
    try {
      const c = compile(src);
      const allowed = new Set([...known, ...(extra || [])]);
      const missing = c.names.filter((n) => !allowed.has(n) && !BUILTIN_NAMES.has(n));
      if (missing.length) errors.push(`${where}${template ? " (template)" : ""}: unknown name${missing.length > 1 ? "s" : ""} ${missing.map((m) => `"${m}"`).join(", ")} in "${src}". Known: ${[...allowed].filter((n) => !["steps", "stepT"].includes(n)).join(", ")}`);
    } catch (error) {
      errors.push(`${where}: ${error instanceof ExprError ? error.message : String(error)}`);
    }
  }

  // references
  spec.steps.forEach((s, i) => {
    for (const x of s.set) if (!paramIds.has(x.param)) errors.push(`steps[${i}].set names param "${x.param}", which does not exist`);
    for (const id of [...s.show, ...s.hide, ...s.focus]) if (!ids.has(id)) errors.push(`steps[${i}] refers to "${id}", which is not an element id (${[...ids].slice(0, 30).join(", ")})`);
  });
  if (spec.tour && !paramIds.has(spec.tour)) errors.push(`tour names param "${spec.tour}", which does not exist`);
  for (const k of spec.keys) if (!k.label) warnings.push("a legend key has no label");
  if (spec.title.length > 40) warnings.push(`title is ${spec.title.length} characters; keep it under 32`);

  switch (spec.kind) {
    case "plot": {
      const fnIds = new Set(spec.layers.filter((l) => l.type === "function").map((l) => l.id));
      for (const l of spec.layers) {
        if (l.type === "tangent" && !fnIds.has(l.of)) errors.push(`tangent "${l.id}" is "of" "${l.of}", which is not a function layer`);
        if (l.type === "point" && l.drag) {
          for (const p of [l.drag.x, l.drag.y]) {
            if (!p) continue;
            const param = spec.params.find((x) => x.id === p);
            if (!param) errors.push(`point "${l.id}" drags param "${p}", which does not exist`);
            else if (param.kind !== "slider") errors.push(`point "${l.id}" drags param "${p}", which is not a slider`);
          }
        }
        if (l.type === "bars" && l.xs.length !== l.heights.length) errors.push(`bars "${l.id}" has ${l.xs.length} xs but ${l.heights.length} heights`);
      }
      if (!spec.layers.length) errors.push("the plot has no layers");
      break;
    }
    case "sequence": {
      const actors = new Set(spec.actors.map((a) => a.id));
      // boxes on one lifeline need ~20 px between them at the scale the renderer uses
      const scope0 = buildScope(spec, defaults(spec), 0, { mode: "none", length: 0, stops: [] });
      let end = 1;
      for (const e of spec.events) {
        end = Math.max(end, evalNum(e.at, scope0, 0));
        if (e.type === "message") end = Math.max(end, evalNum(e.arrive, scope0, 0));
      }
      const pxPerUnit = 280 / (end + 0.4);
      const byActor = new Map<string, { id: string; at: number }[]>();
      for (const e of spec.events) if (e.type === "state" && e.when === "") (byActor.get(e.actor) || byActor.set(e.actor, []).get(e.actor)!).push({ id: e.id, at: evalNum(e.at, scope0, 0) });
      for (const [actor, list] of byActor) {
        list.sort((a, b) => a.at - b.at);
        for (let i = 1; i < list.length; i++) if ((list[i].at - list[i - 1].at) * pxPerUnit < 19) errors.push(`states "${list[i - 1].id}" and "${list[i].id}" on actor "${actor}" are ${(list[i].at - list[i - 1].at).toFixed(2)} units apart: their boxes overlap. Space them at least ${(19 / pxPerUnit).toFixed(2)} units apart (or drop one)`);
      }
      if (spec.actors.length < 2) errors.push("a sequence needs at least two actors");
      if (!spec.events.length) errors.push("a sequence needs events");
      for (const e of spec.events) {
        const refs = e.type === "message" ? [e.from, e.to] : e.type === "partition" ? e.actors : [e.actor];
        for (const r of refs) if (!actors.has(r)) errors.push(`event "${e.id}" refers to actor "${r}", which does not exist (${[...actors].join(", ")})`);
      }
      break;
    }
    case "graph": {
      if (spec.nodes.length < 2) errors.push("a graph needs at least two nodes");
      const raw = (input || {}) as { edges?: { from?: string; to?: string }[] };
      const nodeIds = new Set(spec.nodes.map((n) => n.id));
      for (const e of raw.edges || []) if (!nodeIds.has(String(e.from)) || !nodeIds.has(String(e.to))) errors.push(`an edge goes from "${e.from}" to "${e.to}", but both ends must be node ids`);
      break;
    }
    case "diagram": {
      if (!spec.shapes.length) errors.push("the diagram has no shapes");
      for (const sh of spec.shapes) {
        if ((sh.type === "rect" || sh.type === "circle") && sh.drag) {
          for (const p of [sh.drag.x, sh.drag.y]) {
            if (!p) continue;
            const param = spec.params.find((x) => x.id === p);
            if (!param || param.kind !== "slider") errors.push(`shape "${sh.id}" drags "${p}", which is not a slider param`);
          }
        }
        if ((sh.type === "line" || sh.type === "polygon") && sh.points.length < (sh.type === "line" ? 2 : 3)) errors.push(`shape "${sh.id}" needs at least ${sh.type === "line" ? 2 : 3} points`);
      }
      break;
    }
    case "object3d": {
      if (!spec.parts.length) errors.push("the object has no parts");
      const dims: Record<string, number> = { box: 3, plate: 3, cylinder: 2, cone: 2, capsule: 2, sphere: 1, torus: 2, prism: 2, tube: 3 };
      for (const p of spec.parts) if (p.size.slice(0, dims[p.shape] ?? 1).filter((v) => v > 0).length < (dims[p.shape] ?? 1)) warnings.push(`part "${p.id}" (${p.shape}) needs ${dims[p.shape]} positive size values`);
      break;
    }
  }

  // dry run: three moments × params at default, min and max
  if (!errors.length) {
    const memo: Record<string, unknown> = {};
    const base = defaults(spec);
    const variants = [base, Object.fromEntries(spec.params.map((p) => [p.id, p.min])), Object.fromEntries(spec.params.map((p) => [p.id, p.max]))];
    let badReadout = 0;
    for (const params of variants) {
      const probe = buildScope(spec, params, 0, { mode: "none", length: 0, stops: [] });
      const timeline = timelineOf(spec, probe);
      for (const frac of [0, 0.5, 0.999]) {
        const t = timeline.length * frac;
        let scope = buildScope(spec, params, t, timeline);
        const step = Number(scope.step) || 0;
        if (spec.steps.length) scope = buildScope(spec, { ...params, ...stepParamTargets(spec, step, scope) }, t, timeline);
        const visible = visibilityAt(spec, step);
        const state: FrameState = { scope, vis: (id) => (visible(id) ? 1 : 0), focus: new Set(spec.steps[step]?.focus || []), hover: null, view: { zoom: 1, panX: 0, panY: 0, azimuth: spec.kind === "object3d" ? spec.azimuth : 35, elevation: spec.kind === "object3d" ? spec.elevation : 28, moved: {} }, theme: "light", uid: "dry" };
        try {
          const out = spec.kind === "plot" ? renderPlot(spec, state, memo) : spec.kind === "sequence" ? renderSequence(spec, state) : spec.kind === "graph" ? renderGraph(spec, state, memo) : spec.kind === "diagram" ? renderDiagram(spec, state) : renderObject3D(spec, state, memo);
          if (/NaN|Infinity/.test(out.svg)) warnings.push(`at t=${t.toFixed(1)} some coordinates are not finite`);
        } catch (error) {
          errors.push(`rendering failed at t=${t.toFixed(1)}: ${(error as Error).message}`);
        }
        for (const src of [spec.readout, ...spec.stats.map((s) => s.value)]) {
          for (const e of templateExprs(src)) {
            try {
              const v = compile(e)(scope);
              if (typeof v === "number" && !Number.isFinite(v)) badReadout++;
            } catch {
              badReadout++;
            }
          }
        }
      }
    }
    if (badReadout) warnings.push(`the readout or stats were not finite in ${badReadout} of the dry-run frames (check divisions by zero at parameter ends)`);
  }
  const unique = (list: string[]) => [...new Set(list)];
  return { ok: errors.length === 0, errors: unique(errors).slice(0, 30), warnings: unique(warnings).slice(0, 20), scene: spec };
}
