/* The scene player: the universal frame around every generated figure.
 *
 *   ┌ Fig 3.2 ─────────────────────────── TITLE ┐
 *   │                stage (SVG)                │
 *   └ hint ─────────────────────────── readout ─┘
 *   legend · narration
 *   ▶ ↺ ‹ ›  ───●──────── 0:03 / 0:10   − ──●── +  ⤢
 *   params (sliders, toggles, choices)  · Back to text values
 *   stats
 *
 * Framework-free, so the same figure lives in the reader, a note, a flashcard or a bare page.
 * Buttons that don't apply to a figure are shown disabled, never hidden: the frame is always the same. */

import {
  buildScope,
  defaults,
  type FrameState,
  fillTemplate,
  initialView,
  type Param,
  type RenderOut,
  renderScene,
  type Scene,
  stepAt,
  stepParamTargets,
  type Timeline,
  timelineOf,
  type View,
  visibilityAt,
  zoomsByTransform,
} from "../../../shared/scene/index.ts";
import { HEIGHT, WIDTH } from "../../../shared/scene/types.ts";
import { h, ICONS, swatch } from "./dom";
import { infoMap, movableParts, usesClock, usesTime } from "./inspect";
import { predictBox } from "./predict";

export interface PlayerOptions {
  theme: "light" | "dark";
  fig?: string;
  autoplay?: boolean;
  /** Ask the predict-first question before playing. */
  predict?: boolean;
  compact?: boolean;
  onEvent?: (
    event: { type: "predict"; correct: boolean } | { type: "interact" } | { type: "error"; message: string },
  ) => void;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const ease = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let counter = 0;

/** Arrow keys as [dx, dy] with y up. */
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

export class ScenePlayer {
  readonly root: HTMLElement;
  private spec: Scene;
  private opts: PlayerOptions;
  private uid = `s${++counter}`;
  private el!: Record<string, HTMLElement>;
  private svg!: SVGSVGElement;
  private memo: Record<string, unknown> = {};
  private view: View;
  private params: Record<string, number>;
  /** Params the reader set by hand since the current step began (they win over the step). */
  private touched = new Set<string>();
  private shown: Record<string, number>;
  private stepFrom: Record<string, number> = {};
  private lastStep = -1;
  private opacity = new Map<string, number>();
  private t = 0;
  private clock = 0;
  private playing: boolean;
  private predicting = false;
  private timeline: Timeline = { mode: "none", length: 0, stops: [] };
  private animated = false;
  private raf = 0;
  private last = 0;
  private visible = true;
  private lastInput = -Infinity;
  private tourPhase = 0;
  private hover: string | null = null;
  private picked: string | null = null;
  /** The part was picked with the arrow keys, so the info box says how to move it. */
  private pickedByKey = false;
  private lastSvg = "";
  private lastOut: RenderOut | null = null;
  private drag: {
    kind: "point" | "node" | "pan" | "orbit";
    id?: string;
    x: number;
    y: number;
    moved: boolean;
    view: View;
  } | null = null;
  private infos: Map<string, { label: string; info: string }>;
  private movable: Map<string, { x: string; y: string } | null>;
  private observer: IntersectionObserver | null = null;
  private dead = false;
  private stats: HTMLElement[] = [];
  private controls = new Map<string, { input?: HTMLInputElement; out?: HTMLElement; buttons?: HTMLButtonElement[] }>();
  errors: string[] = [];
  frames = 0;

  constructor(root: HTMLElement, spec: Scene, opts: PlayerOptions) {
    this.root = root;
    this.spec = spec;
    this.opts = opts;
    this.view = initialView(spec);
    this.params = defaults(spec);
    this.shown = { ...this.params };
    this.playing = opts.autoplay !== false && !reduced();
    this.infos = infoMap(spec);
    this.movable = movableParts(spec);
    this.build();
    this.recompute();
    if (opts.predict !== false && spec.predict) this.showPredict();
    this.render();
    this.wake();
  }

  /* ---------------- building ---------------- */

  private build() {
    const spec = this.spec;
    this.root.innerHTML = "";
    this.root.className = "scene";
    this.root.dataset.theme = this.opts.theme;
    if (this.opts.compact) this.root.dataset.compact = "";
    const corner = (name: string, text: string) => h("span", { class: "sc-corner", "data-corner": name, text });
    const parts = this.readableParts().length;
    const moves = spec.kind === "object3d" ? "turn it" : this.movable.size ? "move the chosen part" : "pan";
    const stage = h("div", {
      class: "sc-stage",
      tabindex: "0",
      role: "img",
      "aria-label": `${spec.title}. ${spec.caption}`,
      "aria-roledescription": "interactive figure",
      "aria-description": `Space plays and pauses, the left and right arrows step${parts ? ", the up and down arrows read its parts" : ""}, Shift and the arrows ${moves}, plus and minus zoom.`,
    });
    stage.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="sc-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true"></svg>`;
    const info = h("div", { class: "sc-info", "aria-live": "polite" });
    const plate = h("div", { class: "sc-plate" }, [
      corner("fig", this.opts.fig || "Fig"),
      corner("title", spec.title),
      stage,
      corner("hint", spec.hint),
      corner("readout", ""),
      info,
    ]);
    const legend = spec.keys.length
      ? h(
          "figcaption",
          { class: "sc-legend" },
          spec.keys.map((k) => h("span", { class: "sc-key", html: `${swatch(k.tone, k.style)}<span></span>` })),
        )
      : null;
    for (const [i, node] of (legend?.querySelectorAll(".sc-key span:last-child") ?? []).entries())
      node.textContent = spec.keys[i].label;
    const card = h("figure", { class: "sc-card" }, [plate, legend]);
    const narration = h("div", { class: "sc-narration", "aria-live": "polite" });

    const btn = (name: string, icon: string, title: string) =>
      h("button", { class: "sc-btn", type: "button", "data-action": name, title, "aria-label": title, html: icon });
    const play = btn("play", ICONS.play, "Play (space)");
    const restart = btn("restart", ICONS.restart, "Restart");
    const prev = btn("prev", ICONS.prev, "Previous step (←)");
    const next = btn("next", ICONS.next, "Next step (→)");
    const progress = h("input", {
      class: "sc-range",
      type: "range",
      min: "0",
      max: "1000",
      step: "1",
      value: "0",
      "aria-label": "Progress",
    }) as HTMLInputElement;
    const time = h("span", { class: "sc-time", text: "" });
    const zoomOut = btn("zoom-out", ICONS.minus, "Zoom out");
    const zoom = h("input", {
      class: "sc-range",
      type: "range",
      min: "-100",
      max: "200",
      step: "1",
      value: "0",
      "aria-label": "Zoom",
    }) as HTMLInputElement;
    const zoomIn = btn("zoom-in", ICONS.plus, "Zoom in");
    const fit = btn("fit", ICONS.fit, "Reset the view");
    const transport = h("div", { class: "sc-transport" }, [
      play,
      restart,
      prev,
      next,
      h("div", { class: "sc-progress" }, [progress, time]),
      h("span", { class: "sc-sep" }),
      h("div", { class: "sc-zoom" }, [zoomOut, zoom, zoomIn]),
      fit,
    ]);

    const params = h("div", { class: "sc-params" });
    for (const p of spec.params) params.append(this.paramNode(p));
    const reset = h("button", {
      class: "sc-btn",
      type: "button",
      "data-action": "reset",
      text: "Back to text values",
      disabled: true,
    });
    if (spec.params.length) params.append(reset);
    const stats = h("div", { class: "sc-stats" });
    this.stats = spec.stats.map((s) => {
      const value = h("b", { text: "—" });
      stats.append(h("span", { class: "sc-stat" }, [h("span", { class: "sc-stat-label", text: s.label }), value]));
      return value;
    });
    this.root.append(card, narration, transport, params, stats);
    this.svg = stage.querySelector("svg")!;
    this.el = {
      plate,
      stage,
      info,
      narration,
      play,
      restart,
      prev,
      next,
      progress,
      time,
      zoom,
      zoomOut,
      zoomIn,
      fit,
      reset,
      readout: plate.querySelector('[data-corner="readout"]') as HTMLElement,
    };

    play.addEventListener("click", () => this.setPlaying(!this.playing));
    restart.addEventListener("click", () => this.restart());
    prev.addEventListener("click", () => this.stepBy(-1));
    next.addEventListener("click", () => this.stepBy(1));
    progress.addEventListener("input", () => {
      this.touch();
      this.seek((Number(progress.value) / 1000) * this.timeline.length);
    });
    zoom.addEventListener("input", () => this.setZoom(2 ** (Number(zoom.value) / 100)));
    zoomOut.addEventListener("click", () => this.setZoom((this.view.zoom || 1) / 1.4));
    zoomIn.addEventListener("click", () => this.setZoom((this.view.zoom || 1) * 1.4));
    fit.addEventListener("click", () => this.resetView());
    reset.addEventListener("click", () => this.resetParams());
    this.bindStage(stage);
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1].isIntersecting;
        if (this.visible) this.wake();
      });
      this.observer.observe(stage);
    }
  }

  private paramNode(p: Param): HTMLElement {
    const fmt = (v: number) => {
      const digits = p.step >= 1 ? 0 : Math.min(4, Math.max(0, Math.ceil(-Math.log10(p.step) - 1e-9)));
      return `${v.toFixed(digits).replace("-", "−")}${p.unit ? ` ${p.unit}` : ""}`;
    };
    if (p.kind === "toggle") {
      const input = h("input", { type: "checkbox", checked: !!p.value }) as HTMLInputElement;
      input.addEventListener("change", () => this.setParam(p.id, input.checked ? 1 : 0, true));
      this.controls.set(p.id, { input });
      return h("label", { class: "sc-param", "data-kind": "toggle" }, [input, h("span", { text: p.label })]);
    }
    if (p.kind === "choice") {
      const buttons = p.options.map((o, i) => {
        const b = h("button", {
          type: "button",
          class: "sc-choice",
          "aria-pressed": String(i === p.value),
          text: o,
        }) as HTMLButtonElement;
        b.addEventListener("click", () => this.setParam(p.id, i, true));
        return b;
      });
      this.controls.set(p.id, { buttons });
      return h("div", { class: "sc-param", "data-kind": "choice" }, [
        h("span", { class: "sc-param-label", text: p.label }),
        h("span", { class: "sc-choices", role: "group", "aria-label": p.label }, buttons),
      ]);
    }
    const input = h("input", {
      class: "sc-range",
      type: "range",
      min: String(p.min),
      max: String(p.max),
      step: String(p.step),
      value: String(p.value),
      "aria-label": p.label,
    }) as HTMLInputElement;
    const out = h("output", { class: "sc-param-value", text: fmt(p.value) });
    input.addEventListener("input", () => this.setParam(p.id, Number(input.value), true));
    this.controls.set(p.id, { input, out });
    (out as HTMLElement & { fmt?: (v: number) => string }).fmt = fmt;
    return h("label", { class: "sc-param", "data-kind": "slider" }, [
      h("span", { class: "sc-param-label", text: p.label }),
      input,
      out,
    ]);
  }

  /* ---------------- state ---------------- */

  private recompute() {
    const probe = buildScope(this.spec, this.shown, this.t, this.timeline, this.clock);
    this.timeline = timelineOf(this.spec, probe);
    this.animated = this.timeline.mode !== "none" || usesTime(this.spec) || !!this.spec.tour;
    const tl = this.timeline;
    const has = tl.length > 0;
    (this.el.progress as HTMLInputElement).disabled = !has;
    this.setDisabled(this.el.play, !this.animated);
    this.setDisabled(this.el.restart, !this.animated && !this.spec.steps.length);
    this.updateTransport();
  }

  private setDisabled(node: HTMLElement, off: boolean) {
    if (off) node.setAttribute("disabled", "");
    else node.removeAttribute("disabled");
  }

  private updateTransport() {
    const tl = this.timeline;
    const { step } = stepAt(this.spec, this.t);
    this.el.play.innerHTML = this.playing && this.animated ? ICONS.pause : ICONS.play;
    this.el.play.title = this.playing ? "Pause (space)" : "Play (space)";
    const stops = tl.stops;
    this.setDisabled(this.el.prev, stops.length < 2 || this.t <= (stops[0] ?? 0) + 1e-3);
    this.setDisabled(this.el.next, stops.length < 2 || this.t >= stops[stops.length - 1] - 1e-3);
    if (tl.length > 0) {
      (this.el.progress as HTMLInputElement).value = String(Math.round((this.t / tl.length) * 1000));
      this.el.time.textContent =
        tl.mode === "steps"
          ? `step ${step + 1} / ${this.spec.steps.length}`
          : `${this.t.toFixed(1)} / ${tl.length.toFixed(1)} s`;
    } else this.el.time.textContent = this.animated ? `${this.clock.toFixed(0)} s` : "";
    const z = Math.round(Math.log2(this.view.zoom || 1) * 100);
    (this.el.zoom as HTMLInputElement).value = String(clamp(z, -100, 200));
    const initial = initialView(this.spec);
    const dirty =
      Math.abs((this.view.zoom || 1) - 1) > 1e-3 ||
      this.view.panX ||
      this.view.panY ||
      Math.abs(this.view.azimuth - initial.azimuth) > 0.5 ||
      Math.abs(this.view.elevation - initial.elevation) > 0.5 ||
      Object.keys(this.view.moved).length;
    this.setDisabled(this.el.fit, !dirty);
    const paramsDirty = this.spec.params.some((p) => Math.abs((this.params[p.id] ?? p.value) - p.value) > 1e-9);
    this.setDisabled(this.el.reset, !paramsDirty);
  }

  private touch() {
    this.lastInput = performance.now() / 1000;
    this.opts.onEvent?.({ type: "interact" });
  }

  setParam(id: string, value: number, byUser = false) {
    const p = this.spec.params.find((x) => x.id === id);
    if (!p) return;
    let v = clamp(value, p.min, p.max);
    if (p.kind === "slider" && p.step > 0) v = clamp(Math.round((v - p.min) / p.step) * p.step + p.min, p.min, p.max);
    else v = Math.round(v);
    this.params[id] = v;
    if (byUser) {
      this.touched.add(id);
      this.touch();
      this.shown[id] = v;
    }
    this.syncControl(p, v);
    if (this.spec.kind === "sequence") this.recompute();
    this.updateTransport();
    this.wake();
  }

  private syncControl(p: Param, v: number) {
    const c = this.controls.get(p.id);
    if (!c) return;
    if (c.input) {
      if (c.input.type === "checkbox") c.input.checked = !!v;
      else if (Number(c.input.value) !== v) c.input.value = String(v);
    }
    if (c.out) c.out.textContent = (c.out as HTMLElement & { fmt?: (v: number) => string }).fmt?.(v) ?? String(v);
    for (const [i, b] of (c.buttons ?? []).entries()) b.setAttribute("aria-pressed", String(i === Math.round(v)));
  }

  setPlaying(on: boolean) {
    if (on && this.timeline.length && this.t >= this.timeline.length - 1e-3 && !this.spec.loop) this.seek(0);
    this.playing = on;
    this.updateTransport();
    this.wake();
  }

  restart() {
    this.t = 0;
    this.clock = 0;
    this.memo = {};
    this.lastStep = -1;
    this.touched.clear();
    this.playing = this.animated;
    this.updateTransport();
    this.wake();
  }

  private seek(t: number) {
    this.t = clamp(t, 0, this.timeline.length || 0);
    for (const key of Object.keys(this.memo)) if (key.startsWith("trail:")) delete this.memo[key];
    this.updateTransport();
    this.wake();
  }

  stepBy(dir: -1 | 1) {
    this.touch();
    const stops = this.timeline.stops;
    if (stops.length < 2) return;
    const eps = 1e-3;
    const target = dir > 0 ? stops.find((s) => s > this.t + eps) : [...stops].reverse().find((s) => s < this.t - eps);
    if (target === undefined) return;
    this.playing = false;
    // land a little inside a step so its transition has played
    this.seek(this.timeline.mode === "steps" ? target + this.spec.stepSeconds * 0.55 : target);
    if (this.timeline.mode === "steps") this.touched.clear();
  }

  private setZoom(z: number) {
    this.touch();
    this.view = { ...this.view, zoom: clamp(z, 0.5, this.spec.kind === "plot" ? 64 : 4) };
    this.updateTransport();
    this.wake();
  }

  resetView() {
    this.view = initialView(this.spec);
    this.memo = {};
    this.updateTransport();
    this.wake();
  }

  resetParams() {
    for (const p of this.spec.params) {
      this.params[p.id] = p.value;
      this.shown[p.id] = p.value;
      this.syncControl(p, p.value);
    }
    this.touched.clear();
    this.recompute();
    this.restart();
  }

  setTheme(theme: "light" | "dark") {
    this.opts.theme = theme;
    this.root.dataset.theme = theme;
    this.lastSvg = "";
    this.wake();
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.root.innerHTML = "";
  }

  /* ---------------- predict first ---------------- */

  private showPredict() {
    this.predicting = true;
    const box = predictBox(this.spec.predict!, {
      onAnswer: (correct) => this.opts.onEvent?.({ type: "predict", correct }),
      onClose: (hadFocus) => {
        this.predicting = false;
        this.restart();
        if (hadFocus) this.el.stage.focus({ preventScroll: true });
      },
    });
    this.el.plate.append(box);
  }

  /* ---------------- pointer ---------------- */

  private stagePoint(event: PointerEvent): [number, number] {
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return [pt.x, pt.y];
  }

  /** Stage px → the renderer's base coordinates (undoing the zoom transform for sequence/graph). */
  private unzoom([x, y]: [number, number]): [number, number] {
    if (!zoomsByTransform(this.spec)) return [x, y];
    const z = this.view.zoom || 1;
    const cx = WIDTH / 2 + (this.view.panX || 0) * WIDTH,
      cy = HEIGHT / 2 + (this.view.panY || 0) * HEIGHT;
    return [(x - cx) / z + WIDTH / 2, (y - cy) / z + HEIGHT / 2];
  }

  private bindStage(stage: HTMLElement) {
    const kind = this.spec.kind;
    stage.dataset.mode = kind === "object3d" ? "orbit" : "pan";
    stage.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const target = (event.target as Element).closest("[data-drag]") as Element | null;
      const point = this.stagePoint(event);
      const base = { x: point[0], y: point[1], moved: false, view: { ...this.view, moved: { ...this.view.moved } } };
      if (target && (kind === "plot" || kind === "graph" || kind === "diagram"))
        this.drag = { kind: kind === "graph" ? "node" : "point", id: target.getAttribute("data-drag")!, ...base };
      else this.drag = { kind: kind === "object3d" ? "orbit" : "pan", ...base };
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {}
      stage.dataset.grabbing = "";
      this.touch();
      event.preventDefault();
    });
    stage.addEventListener("pointermove", (event) => {
      const point = this.stagePoint(event);
      if (!this.drag) {
        const id = (event.target as Element).closest("[data-id]")?.getAttribute("data-id") || null;
        if (id !== this.hover) {
          this.hover = id;
          this.showInfo();
          this.wake();
        }
        return;
      }
      const d = this.drag;
      const dx = point[0] - d.x,
        dy = point[1] - d.y;
      if (Math.hypot(dx, dy) > 2) d.moved = true;
      if (d.kind === "point" && (this.spec.kind === "plot" || this.spec.kind === "diagram")) {
        const item =
          this.spec.kind === "plot"
            ? this.spec.layers.find((l) => l.id === d.id)
            : this.spec.shapes.find((sh) => sh.id === d.id);
        const drag = item && "drag" in item ? item.drag : null;
        if (drag && this.lastOut?.invert) {
          const [x, y] = this.lastOut.invert(point[0], point[1]);
          if (drag.x) this.setParam(drag.x, x, true);
          if (drag.y) this.setParam(drag.y, y, true);
        }
      } else if (d.kind === "node") {
        const base = this.unzoom(point);
        this.view = {
          ...this.view,
          moved: { ...this.view.moved, [d.id!]: this.lastOut?.invert ? this.lastOut.invert(base[0], base[1]) : base },
        };
      } else if (d.kind === "orbit" || (d.kind === "pan" && d.moved)) this.view = this.draggedView(d.view, dx, dy);
      this.updateTransport();
      this.wake();
    });
    const end = (event: PointerEvent) => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      delete stage.dataset.grabbing;
      if (!d.moved) {
        const id = (event.target as Element).closest("[data-id]")?.getAttribute("data-id") || null;
        this.picked = this.picked === id ? null : id;
        this.pickedByKey = false;
        this.showInfo();
      }
      this.wake();
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    stage.addEventListener("pointerleave", () => {
      if (this.hover && !this.drag) {
        this.hover = null;
        this.showInfo();
        this.wake();
      }
    });
    stage.addEventListener("dblclick", () => this.resetView());
    stage.addEventListener(
      "wheel",
      (event) => {
        if (!event.ctrlKey && !event.metaKey) return; // plain scrolling scrolls the page; pinch zooms
        event.preventDefault();
        this.setZoom((this.view.zoom || 1) * Math.exp(-event.deltaY * 0.01));
      },
      { passive: false },
    );
    stage.addEventListener("keydown", (event) => {
      const arrow = ARROWS[event.key];
      if (arrow && event.shiftKey) {
        event.preventDefault();
        this.nudge(arrow[0], arrow[1]);
      } else if (event.key === " ") {
        event.preventDefault();
        this.setPlaying(!this.playing);
      } else if (event.key === "ArrowRight") this.stepBy(1);
      else if (event.key === "ArrowLeft") this.stepBy(-1);
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        // read the figure's parts one by one: what tapping a part does, for the keyboard (the info box is announced)
        const ids = this.readableParts();
        if (!ids.length) return;
        event.preventDefault();
        const at = this.picked ? ids.indexOf(this.picked) : -1;
        const to = event.key === "ArrowDown" ? at + 1 : at < 0 ? ids.length - 1 : at - 1;
        this.picked = ids[(to + ids.length) % ids.length];
        this.pickedByKey = true;
        this.showInfo();
        this.wake();
      } else if (event.key === "+" || event.key === "=") this.setZoom((this.view.zoom || 1) * 1.25);
      else if (event.key === "-") this.setZoom((this.view.zoom || 1) / 1.25);
      else if (event.key === "0") this.resetView();
    });
  }

  /** The parts the up and down arrows step through: those with something to say, and those that move. */
  private readableParts(): string[] {
    const said = [...this.infos.entries()].filter(([, p]) => p.info).map(([id]) => id);
    return [...said, ...[...this.movable.keys()].filter((id) => !said.includes(id))];
  }

  /** The view after dragging the stage by (dx, dy) px from `from`: pans, or turns a 3D object. */
  private draggedView(from: View, dx: number, dy: number): View {
    if (this.spec.kind === "object3d")
      return { ...this.view, azimuth: from.azimuth - dx * 0.45, elevation: clamp(from.elevation + dy * 0.35, -85, 85) };
    const z = from.zoom || 1;
    if (this.spec.kind === "plot")
      return { ...this.view, panX: from.panX - dx / (WIDTH * 0.87) / z, panY: from.panY + dy / (HEIGHT * 0.81) / z };
    // sequences and graphs pan only once zoomed in
    if (this.spec.kind === "diagram" || (this.view.zoom || 1) > 1.01)
      return { ...this.view, panX: from.panX + dx / WIDTH, panY: from.panY + dy / HEIGHT };
    return this.view;
  }

  /** Shift + an arrow drags one notch that way: the picked part if it moves, else the view.
   * `dy` is +1 for up. A point moves its sliders by a fortieth of their range (or one step). */
  private nudge(dx: number, dy: number) {
    this.touch();
    const id = this.picked;
    const drag = id ? this.movable.get(id) : undefined;
    if (id && drag) {
      for (const [param, by] of [
        [drag.x, dx],
        [drag.y, dy],
      ] as const) {
        const p = param && by ? this.spec.params.find((x) => x.id === param) : null;
        if (p) this.setParam(p.id, this.params[p.id] + by * Math.max(p.step || 0, (p.max - p.min) / 40), true);
      }
      this.showInfo();
    } else if (id && drag === null) {
      const at = this.view.moved?.[id] ?? (this.memo.layout as Map<string, [number, number]> | undefined)?.get(id);
      if (at) this.view = { ...this.view, moved: { ...this.view.moved, [id]: [at[0] + dx * 16, at[1] - dy * 16] } };
    } else this.view = this.draggedView(this.view, dx * 40, -dy * 40);
    this.updateTransport();
    this.wake();
  }

  private showInfo() {
    const id = this.hover || this.picked;
    const entry = id ? this.infos.get(id) : null;
    const box = this.el.info;
    // a part picked from the keyboard that moves says how, and what its sliders read now
    const drag = id && id === this.picked && this.pickedByKey ? this.movable.get(id) : undefined;
    const keys = drag !== undefined;
    if (entry?.info || keys) {
      box.innerHTML = "";
      if (entry?.label) box.append(h("b", { text: entry.label }));
      if (entry?.info) box.append(h("span", { text: entry.info }));
      if (keys) {
        const values = [drag?.x, drag?.y].flatMap((param) => {
          const p = param ? this.spec.params.find((x) => x.id === param) : null;
          const out = p && this.controls.get(p.id)?.out;
          return p && out ? [`${p.label} ${out.textContent}`] : [];
        });
        box.append(h("span", { class: "sc-info-keys", text: [...values, "Shift + arrows move it"].join(" · ") }));
      }
      box.dataset.on = "";
    } else delete box.dataset.on;
  }

  /* ---------------- the loop ---------------- */

  private wake() {
    if (this.dead || this.raf) return;
    this.last = 0;
    this.raf = requestAnimationFrame((time) => this.tick(time));
  }

  private tick(time: number) {
    this.raf = 0;
    if (this.dead) return;
    const now = time / 1000;
    const dt = this.last ? clamp(now - this.last, 0, 1 / 20) : 1 / 60;
    this.last = now;
    let busy = false;
    const tl = this.timeline;
    if (this.playing && this.animated && !this.predicting && this.visible) {
      this.clock += dt;
      if (tl.length > 0) {
        this.t += dt;
        if (this.t >= tl.length) {
          if (this.spec.loop) {
            this.t %= tl.length;
            this.lastStep = -1;
            this.touched.clear();
            for (const key of Object.keys(this.memo)) if (key.startsWith("trail:")) delete this.memo[key];
          } else {
            this.t = tl.length;
            // a figure with its own motion keeps running after the timeline ends
            if (!usesClock(this.spec)) this.playing = false;
          }
        }
      } else this.t += dt;
      busy = this.playing;
      // the idle tour: sweep one slider while nobody touches anything
      const tour = this.spec.tour && this.spec.params.find((p) => p.id === this.spec.tour);
      if (tour && performance.now() / 1000 - this.lastInput > 4 && !reduced()) {
        this.tourPhase += dt * ((Math.PI * 2) / 9);
        const raw = tour.min + (tour.max - tour.min) * (0.5 + 0.5 * Math.cos(this.tourPhase));
        // integer-ish sliders (terms, nodes, counts) step; fine sliders glide
        const coarse = tour.step >= (tour.max - tour.min) / 40;
        const v = coarse
          ? Math.min(tour.max, Math.max(tour.min, Math.round((raw - tour.min) / tour.step) * tour.step + tour.min))
          : raw;
        this.params[tour.id] = v;
        this.shown[tour.id] = v;
        this.syncControl(tour, Math.round((v - tour.min) / tour.step) * tour.step + tour.min);
      }
    }
    busy = this.render(dt) || busy;
    this.frames++;
    if (busy && this.visible) this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  /** Draws one frame; returns true while something is still easing. */
  private render(dt = 0): boolean {
    const spec = this.spec;
    let easing = false;
    try {
      const { step, stepT } = stepAt(spec, this.t);
      // steps move params: ease from where they were to the step's targets (a hand-set param wins)
      if (spec.steps.length) {
        if (step !== this.lastStep) {
          this.stepFrom = { ...this.shown };
          this.touched.clear();
          this.lastStep = step;
        }
        const baseScope = buildScope(spec, this.params, this.t, this.timeline, this.clock);
        const targets = stepParamTargets(spec, step, baseScope);
        const k = ease(stepT / 0.35);
        for (const p of spec.params) {
          if (this.touched.has(p.id)) continue;
          const target = targets[p.id] ?? this.params[p.id];
          const from = this.stepFrom[p.id] ?? target;
          const v = reduced() ? target : from + (target - from) * k;
          if (Math.abs((this.shown[p.id] ?? v) - v) > 1e-9) {
            this.shown[p.id] = v;
            if (targets[p.id] !== undefined) this.syncControl(p, Math.round(v / p.step) * p.step);
          }
          if (k < 1 && targets[p.id] !== undefined) easing = true;
        }
      } else {
        for (const p of spec.params) this.shown[p.id] = this.params[p.id];
      }
      const scope = buildScope(spec, this.shown, this.t, this.timeline, this.clock);
      const visible = visibilityAt(spec, step);
      const seen = new Map<string, number>();
      const vis = (id: string) => {
        const hit = seen.get(id);
        if (hit !== undefined) return hit;
        const target = visible(id) ? 1 : 0;
        const cur = this.opacity.get(id);
        let next = target;
        if (cur !== undefined && !reduced() && Math.abs(cur - target) >= 0.01) {
          next = cur + (target - cur) * (1 - Math.exp(-(dt || 1 / 60) / 0.12));
          easing = true;
        }
        this.opacity.set(id, next);
        seen.set(id, next);
        return next;
      };
      const focus = new Set([...(spec.steps[step]?.focus || []), ...(this.picked ? [this.picked] : [])]);
      const state: FrameState = {
        scope,
        vis,
        focus,
        hover: this.hover,
        view: this.view,
        theme: this.opts.theme,
        uid: this.uid,
      };
      const out = renderScene(spec, state, this.memo);
      this.lastOut = out;
      let svg = out.svg;
      if (zoomsByTransform(spec) && ((this.view.zoom || 1) !== 1 || this.view.panX || this.view.panY)) {
        const z = this.view.zoom || 1;
        const cx = WIDTH / 2 + (this.view.panX || 0) * WIDTH,
          cy = HEIGHT / 2 + (this.view.panY || 0) * HEIGHT;
        svg = `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${z.toFixed(3)}) translate(${-WIDTH / 2} ${-HEIGHT / 2})">${svg}</g>`;
      }
      if (svg !== this.lastSvg) {
        this.svg.innerHTML = svg;
        this.lastSvg = svg;
      }
      const readout = fillTemplate(spec.readout, scope);
      if (this.el.readout.textContent !== readout) this.el.readout.textContent = readout;
      spec.stats.forEach((s, i) => {
        const v = fillTemplate(s.value, scope);
        if (this.stats[i].textContent !== v) this.stats[i].textContent = v;
      });
      const narration = spec.steps.length ? spec.steps[step] : null;
      const text = narration ? `${narration.narration}` : out.narration || "";
      const label = narration
        ? `${step + 1}/${spec.steps.length}${narration.title ? ` · ${narration.title}` : ""}`
        : "";
      const key = `${label}|${text}`;
      if (this.el.narration.dataset.key !== key) {
        this.el.narration.dataset.key = key;
        this.el.narration.innerHTML = "";
        if (text || label) {
          if (label) this.el.narration.append(h("b", { text: label }));
          this.el.narration.append(fillTemplate(text, scope));
        }
      }
      if (this.timeline.length > 0 || this.animated) this.updateTransport();
    } catch (error) {
      this.fail(error as Error);
      return false;
    }
    return easing;
  }

  private fail(error: Error) {
    const message = error.message || String(error);
    this.errors.push(message);
    this.playing = false;
    if (!this.el.plate.querySelector(".sc-error"))
      this.el.plate.append(
        h("div", { class: "sc-error", role: "alert" }, [h("strong", { text: "This figure stopped" }), message]),
      );
    this.opts.onEvent?.({ type: "error", message });
  }
}
