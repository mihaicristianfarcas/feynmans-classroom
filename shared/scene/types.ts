/* Scene specs: declarative visualizations drawn by the platform's own renderers.
 *
 * A model fills in one of these (one structured-output call, seconds instead of minutes), the server
 * validates and dry-runs it, and the player draws it in the universal frame: title, stage, hint and
 * readout, then play/pause, restart, steps, a progress slider, zoom, the parameters and live stats.
 * Every number that can move is an expression (see expr.ts) over the scope:
 *   params (by id) · derived values (by id) · t (seconds on the timeline) · p (progress 0–1) ·
 *   step (index) · stepT (0–1 inside the step) · plus per-element variables (x in a function, s on a curve)
 */

export type Tone = "hi" | "mid" | "lo" | "faint" | "lit" | "red" | "green" | "blue";
export const TONES: Tone[] = ["hi", "mid", "lo", "faint", "lit", "red", "green", "blue"];
/** An expression string ("2", "a*x^2", "step >= 1"), or a plain number. */
export type Expr = string | number;

export interface Param {
  id: string;
  label: string;
  /** slider: min..max by step · toggle: 0 or 1 · choice: index into options */
  kind: "slider" | "toggle" | "choice";
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  options: string[];
}

export interface Derived {
  id: string;
  expr: Expr;
}

export interface Stat {
  label: string;
  /** Template: "{v:2} m/s". */
  value: string;
}

export interface Key {
  tone: Tone;
  label: string;
  style: "line" | "dashed" | "dot" | "fill";
}

export interface Step {
  title: string;
  narration: string;
  /** Parameter values this step moves to (eased). */
  set: { param: string; value: Expr }[];
  /** Element ids that appear at this step (hidden before it). */
  show: string[];
  /** Element ids that disappear at this step. */
  hide: string[];
  /** Element ids drawn as the lit accent during this step. */
  focus: string[];
}

export interface Predict {
  question: string;
  choices: string[];
  answer: number;
  explain: string;
}

interface Base {
  title: string;
  hint: string;
  caption: string;
  params: Param[];
  derived: Derived[];
  /** Template for the live readout, bottom right of the card. */
  readout: string;
  stats: Stat[];
  keys: Key[];
  /** Seconds of continuous animation (0: none). Ignored when steps are given. */
  duration: number;
  loop: boolean;
  steps: Step[];
  /** Seconds each step lasts when playing (default 3). */
  stepSeconds: number;
  /** A slider param swept back and forth while nobody touches the figure (or ""). */
  tour: string;
  predict: Predict | null;
}

/* ---------------- plot: graphs of functions and data ---------------- */

export interface Axis {
  label: string;
  min: number;
  max: number;
  /** Tick values; empty = automatic. */
  ticks: number[];
  log: boolean;
}

export type PlotLayer =
  | { type: "function"; id: string; expr: Expr; label: string; tone: Tone; dashed: boolean; domain: [Expr, Expr] | null; when: Expr; info: string }
  | { type: "parametric"; id: string; x: Expr; y: Expr; from: Expr; to: Expr; label: string; tone: Tone; dashed: boolean; when: Expr; info: string }
  | { type: "area"; id: string; expr: Expr; base: Expr; from: Expr; to: Expr; label: string; tone: Tone; when: Expr; info: string }
  | { type: "series"; id: string; points: [number, number][]; label: string; tone: Tone; dashed: boolean; dots: boolean; line: boolean; when: Expr; info: string }
  | { type: "bars"; id: string; xs: Expr[]; heights: Expr[]; width: number; labels: string[]; tone: Tone; when: Expr; info: string }
  | { type: "point"; id: string; x: Expr; y: Expr; label: string; tone: Tone; drag: { x: string; y: string } | null; trail: boolean; when: Expr; info: string }
  | { type: "vector"; id: string; from: [Expr, Expr]; to: [Expr, Expr]; label: string; tone: Tone; arrow: boolean; dashed: boolean; when: Expr; info: string }
  | { type: "tangent"; id: string; of: string; at: Expr; label: string; tone: Tone; dashed: boolean; when: Expr; info: string }
  | { type: "hline" | "vline"; id: string; at: Expr; label: string; tone: Tone; dashed: boolean; when: Expr; info: string }
  | { type: "label"; id: string; x: Expr; y: Expr; text: string; tone: Tone; when: Expr; info: string };

export interface PlotScene extends Base {
  kind: "plot";
  x: Axis;
  y: Axis;
  grid: boolean;
  /** Keep one unit the same length on both axes (geometry). */
  equal: boolean;
  layers: PlotLayer[];
}

/* ---------------- sequence: actors exchanging messages over time ---------------- */

export type ActorShape = "node" | "client" | "server" | "database" | "queue" | "person" | "process";

export interface Actor {
  id: string;
  label: string;
  sublabel: string;
  shape: ActorShape;
  info: string;
}

export type SeqEvent =
  | { type: "message"; id: string; from: string; to: string; at: Expr; arrive: Expr; label: string; tone: Tone; lost: boolean; reply: boolean; narration: string; when: Expr }
  | { type: "state"; id: string; actor: string; at: Expr; text: string; tone: Tone; narration: string; when: Expr }
  | { type: "span"; id: string; actor: string; at: Expr; until: Expr; label: string; tone: Tone; narration: string; when: Expr }
  | { type: "crash" | "recover"; id: string; actor: string; at: Expr; label: string; narration: string; when: Expr }
  | { type: "partition"; id: string; actors: string[]; at: Expr; until: Expr; label: string; narration: string; when: Expr };

export interface SequenceScene extends Base {
  kind: "sequence";
  actors: Actor[];
  events: SeqEvent[];
  /** Seconds of animation per time unit (default 1). */
  unitSeconds: number;
  /** Label for the time axis (e.g. "ms", "round"); empty hides it. */
  timeLabel: string;
  /** Compute and print Lamport or vector clocks at every event. */
  clocks: "none" | "lamport" | "vector";
}

/* ---------------- graph: nodes and edges (networks, state machines, trees, rings) ---------------- */

export type NodeShape = "circle" | "box" | "pill" | "diamond" | "database" | "cell";

export interface GNode {
  id: string;
  label: string;
  /** Template shown under the label (a value, a state). */
  sublabel: string;
  shape: NodeShape;
  /** Position 0–100 (used by the manual layout; a hint otherwise). */
  x: number;
  y: number;
  group: string;
  tone: Tone;
  when: Expr;
  info: string;
}

export interface GEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  tone: Tone;
  dashed: boolean;
  /** Draw an arrow head (directed). */
  arrow: boolean;
  /** Bend the edge (useful for two edges between the same nodes). */
  curve: number;
  when: Expr;
  info: string;
}

export interface Token {
  id: string;
  /** Node ids the token travels through, in order. */
  path: string[];
  /** When it leaves the first node (seconds on the timeline). */
  at: Expr;
  /** Seconds per edge. */
  speed: Expr;
  label: string;
  tone: Tone;
  loop: boolean;
  when: Expr;
}

export interface GGroup {
  id: string;
  label: string;
  nodes: string[];
}

export interface GraphScene extends Base {
  kind: "graph";
  layout: "force" | "layered" | "tree" | "circle" | "row" | "grid" | "manual";
  nodes: GNode[];
  edges: GEdge[];
  tokens: Token[];
  groups: GGroup[];
}

/* ---------------- object3d: a solid object that turns, comes apart and moves ---------------- */

export type PartShape = "box" | "cylinder" | "cone" | "sphere" | "torus" | "capsule" | "prism" | "tube" | "plate";

export interface Part {
  id: string;
  label: string;
  shape: PartShape;
  /**
   * box/plate: [w, d, h] · cylinder/cone/capsule: [radius, height, topRadius(cone) or 0] ·
   * sphere: [radius] · torus: [radius, tube] · prism: [radius, height, sides] · tube: [radius, height, wall]
   */
  size: number[];
  /** Centre in world units, z up. Expressions may move it (pistons, sliders). */
  position: [Expr, Expr, Expr];
  /** Degrees about x, y, z. Expressions may turn it (cranks, wheels). */
  rotation: [Expr, Expr, Expr];
  tone: Tone;
  /** Where the part moves when the object comes apart (explode = 1). */
  explode: [number, number, number];
  group: string;
  when: Expr;
  info: string;
}

export interface Object3DScene extends Base {
  kind: "object3d";
  parts: Part[];
  /** Camera angles in degrees (azimuth around z, elevation above the floor). */
  azimuth: number;
  elevation: number;
  /** Show the explode slider. */
  explodable: boolean;
  /** Show part labels with leader lines. */
  labels: boolean;
  /** Part ids hidden by the "cutaway" toggle, to see inside. */
  cutaway: string[];
}

/* ---------------- diagram: a 2D sketch of a physical setup that moves ---------------- */

export type Fill = "paper" | "tint" | "solid" | "none";

interface ShapeBase {
  id: string;
  tone: Tone;
  /** Short name drawn beside it (template), or "". */
  label: string;
  when: Expr;
  info: string;
}

export type Shape =
  | (ShapeBase & { type: "rect"; x: Expr; y: Expr; w: Expr; h: Expr; rotate: Expr; fill: Fill; drag: { x: string; y: string } | null })
  | (ShapeBase & { type: "circle"; x: Expr; y: Expr; r: Expr; fill: Fill; drag: { x: string; y: string } | null })
  | (ShapeBase & { type: "line"; points: [Expr, Expr][]; dashed: boolean; arrow: boolean; width: number })
  | (ShapeBase & { type: "polygon"; points: [Expr, Expr][]; fill: Fill })
  | (ShapeBase & { type: "curve"; x: Expr; y: Expr; from: Expr; to: Expr; dashed: boolean; fill: Fill })
  | (ShapeBase & { type: "dots"; count: number; x: Expr; y: Expr; r: Expr })
  | (ShapeBase & { type: "spring"; from: [Expr, Expr]; to: [Expr, Expr]; coils: number })
  | (ShapeBase & { type: "arc"; x: Expr; y: Expr; r: Expr; from: Expr; to: Expr; arrow: boolean })
  | (ShapeBase & { type: "ground"; x1: Expr; x2: Expr; y: Expr })
  | (ShapeBase & { type: "text"; x: Expr; y: Expr; text: string; size: number });

export interface DiagramScene extends Base {
  kind: "diagram";
  /** The world box in your own units: x from 0 to width, y from 0 to height, y pointing UP. */
  width: number;
  height: number;
  shapes: Shape[];
}

export type Scene = PlotScene | SequenceScene | GraphScene | Object3DScene | DiagramScene;
export type SceneKind = Scene["kind"];
export const SCENE_KINDS: SceneKind[] = ["plot", "sequence", "graph", "object3d", "diagram"];

/** What the player hands a renderer every frame. */
export interface FrameState {
  scope: Record<string, number | string | boolean>;
  /** Visibility (0–1, eases in and out) per element id. */
  vis: (id: string) => number;
  /** Ids drawn as the lit accent now. */
  focus: Set<string>;
  /** Element under the pointer or picked. */
  hover: string | null;
  view: View;
  theme: "light" | "dark";
  /** Unique per player instance (for clip-path ids). */
  uid: string;
}

/** What a renderer returns for one frame. */
export interface RenderOut {
  /** Content of the stage <svg viewBox="0 0 WIDTH HEIGHT">. */
  svg: string;
  /** Text for the narration line (e.g. the latest sequence event). */
  narration?: string;
  /** Maps stage px to the kind's own coordinates (plot: data units). */
  invert?: (px: number, py: number) => [number, number];
}

export interface View {
  zoom: number;
  panX: number;
  panY: number;
  /** 3D camera. */
  azimuth: number;
  elevation: number;
  /** Positions of nodes the reader dragged (graph), in layout units. */
  moved: Record<string, [number, number]>;
}

export const WIDTH = 640;
export const HEIGHT = 400;
