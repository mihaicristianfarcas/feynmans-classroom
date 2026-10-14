/* A figure as a still picture: one frame of its scene, drawn once (no player, no controls), for
 * indexes and lists. The frame is taken late enough that the figure has shown what it is about. */
import { memo, useMemo } from "react";
import {
  buildScope,
  defaults,
  type FrameState,
  initialView,
  normalize,
  renderScene,
  stepParamTargets,
  timelineOf,
  visibilityAt,
} from "../../../shared/scene/index.ts";
import { HEIGHT, WIDTH } from "../../../shared/scene/types.ts";
import "./scene.css";

/** The SVG of one frame, `at` (0–1) of the way through the figure; null when it can't be drawn. */
export function sceneStill(spec: unknown, theme: "light" | "dark", at = 0.6): string | null {
  try {
    const scene = normalize(spec);
    const params = defaults(scene);
    const timeline = timelineOf(scene, buildScope(scene, params, 0, { mode: "none", length: 0, stops: [] }));
    const t = timeline.length * at;
    let scope = buildScope(scene, params, t, timeline);
    const step = Number(scope.step) || 0;
    if (scene.steps.length)
      scope = buildScope(scene, { ...params, ...stepParamTargets(scene, step, scope) }, t, timeline);
    const visible = visibilityAt(scene, step);
    const state: FrameState = {
      scope,
      vis: (id) => (visible(id) ? 1 : 0),
      focus: new Set(scene.steps[step]?.focus || []),
      hover: null,
      view: initialView(scene),
      theme,
      uid: `still${Math.random().toString(36).slice(2, 7)}`,
    };
    return renderScene(scene, state, {}).svg;
  } catch {
    return null;
  }
}

export const SceneThumb = memo(function SceneThumb({
  spec,
  theme,
  className = "",
}: {
  spec: unknown;
  theme: "light" | "dark";
  className?: string;
}) {
  const key = JSON.stringify(spec);
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn again only when the spec's content (key) or the theme changes
  const svg = useMemo(() => sceneStill(spec, theme), [key, theme]);
  return (
    <span className={`scene scene-thumb ${className}`} data-theme={theme} aria-hidden="true">
      {svg ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="sc-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the platform's own renderer writes this SVG from a validated spec (values only, every text escaped)
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
    </span>
  );
});
