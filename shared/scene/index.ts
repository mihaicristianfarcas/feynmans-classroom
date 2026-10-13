/* Scene engine entry point: one render call for every kind. */
import { renderDiagram } from "./diagram.ts";
import { renderGraph } from "./graph.ts";
import { renderObject3D } from "./object3d.ts";
import { renderPlot } from "./plot.ts";
import { renderSequence } from "./sequence.ts";
import type { FrameState, RenderOut, Scene, View } from "./types.ts";

export * from "./types.ts";
export { normalize, timelineOf, buildScope, stepAt, visibilityAt, stepParamTargets, defaults, type Timeline } from "./model.ts";
export { fillTemplate, evalNum, compile, formatNumber } from "./expr.ts";
export { validateScene, type Validation } from "./validate.ts";

/** Renders one frame. `memo` is the player's scratch space (layouts, meshes, trails); reset it when the spec changes. */
export function renderScene(spec: Scene, state: FrameState, memo: Record<string, unknown>): RenderOut {
  switch (spec.kind) {
    case "plot":
      return renderPlot(spec, state, memo);
    case "sequence":
      return renderSequence(spec, state);
    case "graph":
      return renderGraph(spec, state, memo);
    case "object3d":
      return renderObject3D(spec, state, memo);
    case "diagram":
      return renderDiagram(spec, state);
  }
}

export function initialView(spec: Scene): View {
  return { zoom: 1, panX: 0, panY: 0, azimuth: spec.kind === "object3d" ? spec.azimuth : 35, elevation: spec.kind === "object3d" ? spec.elevation : 28, moved: {} };
}

/** Kinds whose zoom is a plain magnification of the stage (the player applies it). */
export const zoomsByTransform = (spec: Scene) => spec.kind === "sequence" || spec.kind === "graph";
