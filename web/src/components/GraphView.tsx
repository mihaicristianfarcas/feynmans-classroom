/* The knowledge graph as a force-directed picture that fills its box: concepts, notes, books (and, if
 * shown, annotations) as circles with their kind's icon inside and their name beside them (as many names
 * as fit, the most important first), links as lines. A concept's circle shows how well it's known
 * (NodeMark, which the Brain's legend draws too). It is drawn on a canvas (graph/draw.ts) and laid out
 * in a worker (graph/layout.ts), so it stays quick however many items it has; each item also has a
 * button of its own, over its place, for the keyboard and screen readers.
 * Hovering or focusing an item lights it and its links; clicking it (or Enter) selects it and glides it
 * to the middle of what the cards over the graph leave clear; double-clicking opens its page. Arrow keys
 * move to the nearest item that way, dragging moves one, dragging the background pans, ⌘-scroll or the
 * buttons zoom. */
import { Book, FileText, Lightbulb, type LucideIcon, Maximize2, MessageSquareText, Minus, Plus } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "../api";
import { go, openLink } from "../app/navigation";
import { Loading } from "./feedback";
import { type DrawItem, type DrawLink, drawGraph, forgetSprites, iconSize, type View } from "./graph/draw";
import { keepPositions, keptPositions, Layout, type LayoutNode } from "./graph/layout";
import { type Level, type Palette, PaletteProbe, readPalette } from "./graph/palette";
import { Grid, nextInDirection } from "./graph/space";

export { iconSize };

export type GraphNode = GraphData["nodes"][number];
type N = GraphNode;
type Kind = N["kind"];

/** An item as the graph keeps it: its node, its place in the list, and where it is. */
interface Item extends DrawItem {
  node: N;
  i: number;
  named: boolean;
  created: number;
}

/** Each kind of item's icon, drawn inside its circle. */
export const ICONS: Record<Kind, LucideIcon> = {
  concept: Lightbulb,
  note: FileText,
  book: Book,
  annotation: MessageSquareText,
};
/** The icons are drawn a little heavier than in the app's buttons: they're small, and they scale with the zoom. */
export const ICON_STROKE = 2.25;

/** An item's circle: books largest, concepts by how much is built on them, notes, then annotations. */
const radius = (n: Pick<N, "kind" | "size">) =>
  n.kind === "book" ? 17 : n.kind === "concept" ? 9 + n.size * 2.8 : n.kind === "annotation" ? 8.5 : 11;

/** A name as the graph shows it: a long book title is cut short. */
const labelOf = (n: N) => (n.kind === "book" && n.label.length > 30 ? `${n.label.slice(0, 29)}…` : n.label);

/** Which items' names the layout keeps room for: books, and concepts and notes unless there are many of
 * them (then only the concepts much is built on). Others show theirs as room allows. */
function namedIn(nodes: N[]) {
  const concepts = nodes.filter((n) => n.kind === "concept").length;
  const notes = nodes.filter((n) => n.kind === "note").length;
  return (n: N) =>
    n.kind === "book" ||
    (n.kind === "concept" && (concepts <= 40 || n.size > 1.3)) ||
    (n.kind === "note" && notes <= 30);
}

/** About how wide a name is, before it is measured (for the layout and for fitting the view). */
const nameWidth = (it: Pick<Item, "kind" | "short">) => it.short.length * (it.kind === "book" ? 7.5 : 6.85);
/** The box an item takes up around its centre: its circle, and its name to the right if it is named. */
const box = (it: Item) => ({
  x0: -it.r - 2,
  x1: it.r + (it.named ? 8 + nameWidth(it) : 2),
  h: Math.max(16, it.r * 2 + 2),
});

/** Room left at the graph's edges when it's fitted: for the find field above and the tools below, and a
 * margin at the sides. */
const EDGE_X = 32;
const EDGE_Y = 56;
/** How long the view glides when it moves on its own, a hovered item grows, the rest fades as one is lit,
 * and an item comes in during a replay. */
const GLIDE_MS = 320;
const GROW_MS = 160;
const FADE_MS = 180;
const BORN_MS = 600;
const GROWN = 1.12;

/** How well a concept is known, as a word the styles key on. */
export const levelOf = (m: number | null) => (m === null ? "none" : m >= 0.8 ? "strong" : m >= 0.55 ? "ok" : "weak");

/** A cubic Bézier easing (as CSS has them), for motion the canvas draws itself. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0,
      hi = 1,
      t = x;
    for (let i = 0; i < 24; i++) {
      t = (lo + hi) / 2;
      if (at(t, x1, x2) < x) lo = t;
      else hi = t;
    }
    return at(t, y1, y2);
  };
}
// the motion tokens of styles.css: --ease-in-out and --ease-out
const easeInOut = bezier(0.77, 0, 0.175, 1);
const easeOut = bezier(0.23, 1, 0.32, 1);

/**
 * An item's mark, centred on (0, 0): its circle with its kind's `icon` inside. Books are filled coal, notes
 * sky and annotations lavender, with the icon in the opposite tone. A concept's circle is dotted until
 * you study it, then a ring of how much you'd recall (rose while it fades, butter while it grows), and
 * filled sage once you know it. Styled by `.g-<kind>` and `data-level` on a parent (the legend draws it;
 * the graph's canvas reads the same styles).
 */
export function NodeMark({
  kind,
  mastery,
  r,
  icon,
}: {
  kind: Kind;
  mastery: number | null;
  r: number;
  icon: ReactNode;
}) {
  const level = kind === "concept" ? levelOf(mastery) : null;
  return (
    <>
      <circle className="g-disc" r={r} />
      {(level === "weak" || level === "ok") && (
        <path className="g-ring" d={describeArc(r, Math.max(0.001, Math.min(0.9999, mastery ?? 0)))} />
      )}
      {icon}
    </>
  );
}

/** Opens an item's own page: a book in the reader, a concept's page, a note, an annotation in its book. */
export function openNode(n: Pick<N, "kind" | "id" | "bookId" | "path">) {
  if (n.kind === "book") go(`#/book/${n.bookId}`);
  else if (n.kind === "concept") go(`#/brain/concept/${n.id.slice(8)}`);
  else if (n.kind === "annotation" && n.path) openLink(n.path.replace(/\.md$/, ""));
  else go(`#/notes/${n.id.slice(5)}`);
}

const describe = (n: N) =>
  n.kind === "concept"
    ? `Concept: ${n.label}, ${n.mastery === null ? "not studied yet" : `${Math.round(n.mastery * 100)}% recall`}`
    : `${n.kind === "annotation" ? "Annotation" : n.kind === "book" ? "Book" : "Note"}: ${n.label}`;

/** The icons' outlines, read from the hidden icons the graph renders (lucide's), for the canvas to stroke. */
function iconPaths(root: SVGSVGElement) {
  const out: Partial<Record<Kind, Path2D[]>> = {};
  for (const g of root.querySelectorAll<SVGGElement>("[data-icon]")) {
    const paths: Path2D[] = [];
    for (const el of g.querySelectorAll("path, circle, line, rect, polyline, polygon")) {
      const n = (name: string) => Number(el.getAttribute(name) || 0);
      const p = new Path2D(el.tagName === "path" ? el.getAttribute("d") || "" : undefined);
      if (el.tagName === "circle") p.arc(n("cx"), n("cy"), n("r"), 0, Math.PI * 2);
      else if (el.tagName === "line") {
        p.moveTo(n("x1"), n("y1"));
        p.lineTo(n("x2"), n("y2"));
      } else if (el.tagName === "rect") p.roundRect(n("x"), n("y"), n("width"), n("height"), n("rx"));
      else if (el.tagName === "polyline" || el.tagName === "polygon") {
        const pts = (el.getAttribute("points") || "")
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, pts[i], pts[i + 1]);
        if (el.tagName === "polygon") p.closePath();
      }
      paths.push(p);
    }
    out[g.dataset.icon as Kind] = paths;
  }
  return out;
}

/** The items' buttons, for the keyboard and screen readers: placed over the items (the canvas draws them
 * and the keyboard's ring), changed only when the items or the one picked change. */
const GraphItems = memo(function GraphItems({
  items,
  selected,
  tabStop,
  label,
  helpId,
  layer,
  onKey,
  onFocusItem,
  onBlurItem,
  onPick,
}: {
  items: Item[];
  selected: string | null;
  tabStop: string | null;
  label: string;
  helpId: string;
  layer: React.Ref<HTMLDivElement>;
  onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  onFocusItem: (e: React.FocusEvent<HTMLButtonElement>) => void;
  onBlurItem: () => void;
  onPick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for a form's controls; role=group names the graph's items as a set
    <div
      ref={layer}
      className="graph-items"
      role="group"
      aria-label={label}
      aria-describedby={helpId}
      onKeyDown={onKey}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="graph-item"
          data-node={it.id}
          tabIndex={it.id === tabStop ? 0 : -1}
          aria-label={describe(it.node)}
          aria-pressed={it.id === selected}
          onFocus={onFocusItem}
          onBlur={onBlurItem}
          onClick={onPick}
        />
      ))}
    </div>
  );
});

/**
 * The knowledge graph: books, concepts, notes (and, if shown, annotations), joined by their links.
 * Each concept's ring shows how well it's known. Links you wrote are solid, connections you accepted
 * from the agent dashed, its pending suggestions dotted; an arrow runs from a concept to one that
 * builds on it. The selected item (and whatever is hovered) lights its neighbourhood and dims the rest.
 */
export function GraphView({
  data,
  showNotes = true,
  showAnnotations = false,
  showSuggestions = true,
  highlight = "",
  until,
  selected = null,
  onSelect,
  inset = 0,
  insetLeft = 0,
  insetBottom = 0,
  tools,
}: {
  data: GraphData;
  showNotes?: boolean;
  showAnnotations?: boolean;
  showSuggestions?: boolean;
  /** Text to find: matching items are marked and the rest fade. */
  highlight?: string;
  /** Shows the graph as it was at this time (a replay of how it grew: each item and link fades in as it's made). */
  until?: number;
  /** The selected item's id: ringed, its links lit, centred in the room the cards leave. */
  selected?: string | null;
  /** An item was clicked (or chosen with Enter), or the background was clicked (null). */
  onSelect?: (node: N | null, byKeyboard: boolean) => void;
  /** Pixels at the right covered by a card: the selected item is kept clear of them. */
  inset?: number;
  /** Pixels at the left covered by a card, kept clear the same way. */
  insetLeft?: number;
  /** Pixels at the bottom covered by a card (a sheet, on a phone), kept clear the same way. */
  insetBottom?: number;
  /** More buttons for the cluster in the corner. */
  tools?: ReactNode;
}) {
  const items = useMemo<Item[]>(() => {
    const nodes = data.nodes.filter(
      (n) => (showNotes || n.kind !== "note") && (showAnnotations || n.kind !== "annotation"),
    );
    const named = namedIn(nodes);
    return nodes.map((n, i) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      short: labelOf(n),
      mastery: n.mastery,
      level: n.kind === "concept" ? (levelOf(n.mastery) as Level) : null,
      x: Number.NaN,
      y: Number.NaN,
      r: radius(n),
      node: n,
      i,
      named: named(n),
      created: n.created,
    }));
  }, [data, showNotes, showAnnotations]);
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const links = useMemo<(DrawLink & { a: Item; b: Item })[]>(
    () =>
      data.edges.flatMap((e) => {
        const a = byId.get(e.from),
          b = byId.get(e.to);
        return a && b && (showSuggestions || e.kind !== "suggested") ? [{ a, b, kind: e.kind }] : [];
      }),
    [data, byId, showSuggestions],
  );
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const { a, b } of links) {
      (map.get(a.id) || map.set(a.id, new Set()).get(a.id)!).add(b.id);
      (map.get(b.id) || map.set(b.id, new Set()).get(b.id)!).add(a.id);
    }
    return map;
  }, [links]);
  // whose names are given room first: books, then concepts by how much is built on them, notes, annotations
  const byImportance = useMemo(() => {
    const rank = (it: Item) => (it.kind === "book" ? 0 : it.kind === "concept" ? 1 : it.kind === "note" ? 2 : 3);
    return [...items].sort(
      (p, q) => rank(p) - rank(q) || q.r - p.r || (neighbors.get(q.id)?.size ?? 0) - (neighbors.get(p.id)?.size ?? 0),
    );
  }, [items, neighbors]);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const probe = useRef<SVGSVGElement>(null);
  const iconProbe = useRef<SVGSVGElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [tabStop, setTabStop] = useState<string | null>(null);

  // what a frame is drawn from, kept out of React so moving the view or the pointer renders nothing
  const live = useRef({
    size: { w: 1000, h: 640, dpr: 1 },
    view: { k: 1, x: 0, y: 0 } as View,
    // the view the graph was last fitted to, until you move it (or an item) yourself
    fitted: null as View | null,
    glide: null as { from: View; to: View; t0: number } | null,
    pal: null as Palette | null,
    icons: {} as Partial<Record<Kind, Path2D[]>>,
    hover: null as string | null,
    focused: null as string | null,
    focusRing: false,
    // the rest fading as an item is lit, and the item it faded for (kept while it fades back)
    fade: { value: 0, from: 0, to: 0, t0: 0, lit: null as Set<string> | null, lead: null as string | null },
    grow: new Map<string, { from: number; to: number; t0: number; value: number }>(),
    born: new Map<string, number>(),
    press: null as { item: Item | null; sx: number; sy: number; v: View; moved: boolean } | null,
    pressed: null as { item: Item | null } | null,
    // the buttons' places are out of date (the view or the layout moved): set when the view rests
    stale: true,
    frame: 0,
    grid: new Grid<Item>(),
    layout: null as Layout | null,
    reduced: false,
  });
  // the props a frame reads, as they are now
  const props = useRef({ items, links, byImportance, neighbors, selected, highlight, until, onSelect });
  props.current = { items, links, byImportance, neighbors, selected, highlight, until, onSelect };
  const covered = useRef({ left: 0, right: 0, bottom: 0 });
  covered.current = { left: insetLeft, right: inset, bottom: insetBottom };

  const bornOf = (it: Item, now: number) => {
    if (!Number.isFinite(it.x)) return 0;
    const { until } = props.current;
    if (until === undefined) return 1;
    if (it.created > until) return 0;
    const at = live.current.born.get(it.id);
    if (at === undefined) {
      live.current.born.set(it.id, now);
      return live.current.reduced ? 1 : 0.0001;
    }
    return live.current.reduced ? 1 : easeOut(Math.min(1, (now - at) / BORN_MS));
  };
  const shownNow = (it: Item) =>
    Number.isFinite(it.x) && (props.current.until === undefined || it.created <= props.current.until);

  /** Puts each item's button over its circle (once the view rests: they're for focus and screen readers). */
  const placeButtons = () => {
    const el = layer.current;
    if (!el) return;
    const { w, h } = live.current.size;
    const { k, x, y } = live.current.view;
    const list = props.current.items;
    const kids = el.children;
    for (let i = 0; i < list.length && i < kids.length; i++) {
      const it = list[i];
      const b = kids[i] as HTMLElement;
      if (!Number.isFinite(it.x)) {
        b.style.transform = "translate(-9999px, 0)";
        continue;
      }
      const r = Math.max(4, it.r * k);
      b.style.width = b.style.height = `${r * 2}px`;
      b.style.transform = `translate(${(w / 2 + x + it.x * k - r).toFixed(1)}px, ${(h / 2 + y + it.y * k - r).toFixed(1)}px)`;
    }
    live.current.stale = false;
  };

  /** Draws a frame, and asks for the next while something is moving. */
  const paint = (now: number) => {
    const s = live.current;
    s.frame = 0;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !s.pal) return;
    let moving = false;
    if (s.glide) {
      const t = Math.min(1, (now - s.glide.t0) / GLIDE_MS);
      const e = easeInOut(t);
      const { from, to } = s.glide;
      s.view =
        t >= 1
          ? to
          : { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      if (t >= 1) {
        s.glide = null;
        s.stale = true;
      } else moving = true;
    }
    const p = props.current;
    const lead = s.hover ?? s.focused ?? p.selected;
    const fade = s.fade;
    if (lead !== fade.lead && lead) {
      // a neighbourhood lit (or another one): the rest fades from where it is
      fade.lit = new Set([lead, ...(p.neighbors.get(lead) || [])]);
      fade.lead = lead;
    }
    const target = lead ? 1 : 0;
    if (fade.to !== target) Object.assign(fade, { from: fade.value, to: target, t0: now });
    fade.value = s.reduced
      ? target
      : fade.from + (fade.to - fade.from) * easeOut(Math.min(1, (now - fade.t0) / FADE_MS));
    if (fade.value !== target) moving = true;
    if (!lead && fade.value === 0) {
      fade.lit = null;
      fade.lead = null;
    }
    for (const [id, g] of s.grow) {
      const t = s.reduced ? 1 : Math.min(1, (now - g.t0) / GROW_MS);
      g.value = g.from + (g.to - g.from) * easeOut(t);
      if (t < 1) moving = true;
      else if (g.to === 1) s.grow.delete(id);
    }
    const q = p.highlight.trim().toLowerCase();
    const born = (it: DrawItem) => {
      const b = bornOf(it as Item, now);
      if (b > 0 && b < 1) moving = true;
      return b;
    };
    drawGraph({
      ctx,
      ...s.size,
      view: s.view,
      pal: s.pal,
      items: p.items,
      byImportance: p.byImportance,
      links: p.links,
      icons: s.icons,
      iconStroke: ICON_STROKE,
      selected: p.selected,
      hover: s.hover,
      focused: s.focused,
      focusRing: s.focusRing,
      lead: fade.lead,
      lit: fade.lit,
      fade: fade.value,
      finding: !!q,
      matches: (it) => !!q && it.label.toLowerCase().includes(q),
      born,
      grow: (it) => s.grow.get(it.id)?.value ?? 1,
    });
    if (s.stale && !s.glide && !s.press?.moved) placeButtons();
    if (moving) redraw();
  };
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const redraw = useCallback(() => {
    const s = live.current;
    if (!s.frame) s.frame = requestAnimationFrame((now) => paintRef.current(now));
  }, []);

  /** Moves the view: gliding there (unless motion is reduced), or at once. */
  const moveTo = (to: View, glided = true) => {
    const s = live.current;
    if (glided && !s.reduced) s.glide = { from: s.view, to, t0: performance.now() };
    else {
      s.glide = null;
      s.view = to;
    }
    s.stale = true;
    redraw();
  };

  /** The view that shows every item (and the names always shown), between the cards if any are open and
   * clear of the find field and the tools. */
  const fit = (list: Item[]): View => {
    const { w, h } = live.current.size;
    const { left, right, bottom } = covered.current;
    const mid = (left - right) / 2;
    let x0 = Number.POSITIVE_INFINITY,
      y0 = Number.POSITIVE_INFINITY,
      x1 = Number.NEGATIVE_INFINITY,
      y1 = Number.NEGATIVE_INFINITY;
    for (const it of list) {
      if (!Number.isFinite(it.x)) continue;
      const b = box(it);
      x0 = Math.min(x0, it.x + b.x0);
      x1 = Math.max(x1, it.x + b.x1);
      y0 = Math.min(y0, it.y - b.h / 2);
      y1 = Math.max(y1, it.y + b.h / 2);
    }
    if (!Number.isFinite(x0)) return { k: 1, x: mid, y: -bottom / 2 };
    const k = Math.min(
      1.25,
      Math.max(0.05, Math.min((w - left - right - 2 * EDGE_X) / (x1 - x0), (h - bottom - 2 * EDGE_Y) / (y1 - y0))),
    );
    return { k, x: -((x0 + x1) / 2) * k + mid, y: -((y0 + y1) / 2) * k - bottom / 2 };
  };

  /** Moves the view to put an item in the middle of the room the cards leave, gliding unless told not to. */
  const center = (it: Item, glided = true) => {
    if (!Number.isFinite(it.x)) return;
    const { left, right, bottom } = covered.current;
    const v = live.current.glide?.to ?? live.current.view;
    moveTo({ ...v, x: (left - right) / 2 - it.x * v.k, y: -bottom / 2 - it.y * v.k }, glided);
  };
  /** Keeps an item clear of the cards and the edges: if it isn't, the view centres it between them at
   * once (it's the arrow keys moving focus, and what the keyboard does doesn't animate). */
  const reveal = (it: Item) => {
    if (!Number.isFinite(it.x)) return;
    const { w, h } = live.current.size;
    const { left, right, bottom } = covered.current;
    const v = live.current.view;
    const sx = it.x * v.k + v.x,
      sy = it.y * v.k + v.y;
    if (
      sx > -w / 2 + left + 40 &&
      sx < w / 2 - right - 40 &&
      sy > -h / 2 + EDGE_Y &&
      sy < h / 2 - Math.max(bottom + 24, EDGE_Y)
    )
      return;
    center(it, false);
  };
  const zoom = (factor: number) => {
    const v = live.current.glide?.to ?? live.current.view;
    const k = Math.min(4, Math.max(0.05, v.k * factor));
    // about the middle of the room the cards leave
    const cx = (insetLeft - inset) / 2,
      cy = -insetBottom / 2;
    moveTo({ k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) });
  };

  /** The pointer's place from the middle of the box, and in the graph's units. */
  const toScreen = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  };
  const toWorld = (sx: number, sy: number) => {
    const v = live.current.view;
    return [(sx - v.x) / v.k, (sy - v.y) / v.k];
  };
  const itemAt = (sx: number, sy: number) => {
    const [x, y] = toWorld(sx, sy);
    const k = live.current.view.k;
    return live.current.grid.at(x, y, Math.max(6, 6 / k), shownNow);
  };
  const setHover = (id: string | null) => {
    const s = live.current;
    if (s.hover === id) return;
    const now = performance.now();
    for (const [was, to] of [
      [s.hover, 1],
      [id, GROWN],
    ] as const) {
      if (!was) continue;
      const g = s.grow.get(was);
      s.grow.set(was, { from: g?.value ?? (to === 1 ? GROWN : 1), to, t0: now, value: g?.value ?? 1 });
    }
    s.hover = id;
    if (canvas.current) canvas.current.style.cursor = id ? "pointer" : "";
    redraw();
  };

  // the canvas as big as its box, in device pixels
  useLayoutEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      live.current.size = { w: r.width, h: r.height, dpr };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      live.current.stale = true;
      redraw();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // moved to a screen with another pixel density
    const dense = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dense.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      dense.removeEventListener("change", measure);
    };
  }, [redraw]);

  // the palette and the icons, read from the styles, and again when the theme changes
  useLayoutEffect(() => {
    const read = () => {
      if (!probe.current || !iconProbe.current) return;
      forgetSprites();
      live.current.pal = readPalette(probe.current);
      live.current.icons = iconPaths(iconProbe.current);
      redraw();
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true });
    const dark = matchMedia("(prefers-color-scheme: dark)");
    dark.addEventListener("change", read);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      live.current.reduced = motion.matches;
    };
    onMotion();
    motion.addEventListener("change", onMotion);
    return () => {
      observer.disconnect();
      dark.removeEventListener("change", read);
      motion.removeEventListener("change", onMotion);
    };
  }, [redraw]);

  // the layout: kept places first, new items by their neighbours, then the worker settles them
  // biome-ignore lint/correctness/useExhaustiveDependencies: lays out again only when the graph changes (the room is read from a ref)
  useLayoutEffect(() => {
    const s = live.current;
    const kept = keptPositions();
    let have = 0;
    for (const it of items) {
      const xy = kept.get(it.id);
      if (xy) {
        it.x = xy[0];
        it.y = xy[1];
        have++;
      }
    }
    for (const it of items) {
      if (Number.isFinite(it.x)) continue;
      const near = [...(neighbors.get(it.id) || [])].map((id) => byId.get(id)!).filter((n) => Number.isFinite(n.x));
      if (!near.length) continue;
      it.x = near.reduce((sum, n) => sum + n.x, 0) / near.length + (Math.random() - 0.5) * 40;
      it.y = near.reduce((sum, n) => sum + n.y, 0) / near.length + (Math.random() - 0.5) * 40;
    }
    const fresh = have < items.length / 2;
    const { w, h } = s.size;
    const roomW = w - 2 * EDGE_X,
      roomH = Math.max(1, h - 2 * EDGE_Y);
    // the graph takes the shape of the room it's drawn in, and a small graph spreads out to fill it: a
    // big one keeps the spacing below and is zoomed out to fit (25000: about the room, in px², an item
    // and its name take)
    const aspect = Math.min(2.5, Math.max(0.4, roomW / roomH));
    const spread = Math.min(2, Math.max(1, Math.sqrt((roomW * roomH) / (Math.max(1, items.length) * 25000))));
    const nodes: LayoutNode[] = items.map((it) => ({
      kind: it.kind,
      r: it.r,
      named: it.named,
      labelWidth: nameWidth(it),
      ...(Number.isFinite(it.x) ? { x: it.x, y: it.y } : {}),
    }));
    const ids = items.map((it) => it.id);
    if (!s.layout)
      s.layout = new Layout((xy, done) => {
        const list = props.current.items;
        if (list.length * 2 !== xy.length) return;
        // a dragged item stays under the pointer, whatever the layout says
        const held = s.press?.moved ? s.press.item : null;
        list.forEach((it, i) => {
          if (it === held) return;
          it.x = xy[i * 2];
          it.y = xy[i * 2 + 1];
        });
        keepPositions(
          list.map((it) => it.id),
          xy,
          done,
        );
        s.grid.build(list);
        s.stale = true;
        if (!readyRef.current) {
          readyRef.current = true;
          setReady(true);
          s.fitted = fit(list);
          moveTo(s.fitted, false);
        } else if (done && s.fitted && s.view === s.fitted) {
          // a graph still as it was fitted is fitted again once it rests: what settled stays in view
          s.fitted = fit(list);
          moveTo(s.fitted);
        }
        redraw();
      });
    s.layout.start(
      nodes,
      links.map((l) => ({ source: l.a.i, target: l.b.i, kind: l.kind })),
      { aspect, spread },
      fresh ? 1 : have === items.length ? 0 : 0.3,
    );
    s.grid.build(items);
    if (!fresh) {
      // what was kept is drawn at once; the first time this graph is shown, it's fitted
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
        s.fitted = fit(items);
        moveTo(s.fitted, false);
      }
      keepPositions(ids, Float32Array.from(items.flatMap((it) => [it.x, it.y])), false);
    } else if (readyRef.current && have === 0) {
      readyRef.current = false;
      setReady(false);
    }
    s.stale = true;
    redraw();
  }, [items, links]);
  useEffect(
    () => () => {
      live.current.layout?.stop();
      live.current.layout = null;
      cancelAnimationFrame(live.current.frame);
      live.current.frame = 0;
    },
    [],
  );

  // a replay starts each item afresh as it comes in
  useEffect(() => {
    if (until === undefined) live.current.born.clear();
    live.current.grid.build(items);
    redraw();
  }, [until, items, redraw]);
  // a new find, a pick, the cards opening: drawn again
  // biome-ignore lint/correctness/useExhaustiveDependencies: these are what a frame shows
  useEffect(() => redraw(), [highlight, selected, redraw]);

  // the item picked (here, from the find field or from a card) and the room around it as cards open,
  // close or are resized: the item glides to the middle of that room
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the selection or a card changes
  useEffect(() => {
    const it = selected ? byId.get(selected) : null;
    if (it) center(it);
  }, [selected, inset, insetLeft, insetBottom]);

  // ⌘-scroll (and a trackpad's pinch) zooms about the pointer; it's the canvas's, not the page's
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const [sx, sy] = toScreen(e);
      const v = live.current.view;
      const k = Math.min(4, Math.max(0.05, v.k * Math.exp(-e.deltaY * 0.01)));
      moveTo({ k, x: sx - ((sx - v.x) / v.k) * k, y: sy - ((sy - v.y) / v.k) * k }, false);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  });

  // the items' buttons: what focus does there, and the arrow keys
  const handlers = useRef({
    onKey: (_e: React.KeyboardEvent<HTMLElement>) => {},
    onFocusItem: (_e: React.FocusEvent<HTMLButtonElement>) => {},
    onBlurItem: () => {},
    onPick: (_e: React.MouseEvent<HTMLButtonElement>) => {},
  });
  handlers.current = {
    onKey: (e) => {
      const id = (e.target as HTMLElement).dataset?.node;
      const from = id ? byId.get(id) : undefined;
      if (!from) return;
      const shown = items.filter(shownNow);
      let to: Item | null | undefined;
      if (e.key === "Home") to = shown[0];
      else if (e.key === "End") to = shown[shown.length - 1];
      else if (e.key.startsWith("Arrow")) to = nextInDirection(shown, from, e.key);
      else return;
      e.preventDefault();
      if (!to) return;
      reveal(to);
      placeButtons();
      (layer.current?.children[to.i] as HTMLElement | undefined)?.focus({ preventScroll: true });
    },
    onFocusItem: (e) => {
      const it = byId.get(e.currentTarget.dataset.node || "");
      if (!it) return;
      const s = live.current;
      s.focused = it.id;
      s.focusRing = e.currentTarget.matches(":focus-visible");
      setTabStop(it.id);
      // focus that follows a press is the press's to handle (it glides the item to the middle)
      if (!s.press) reveal(it);
      redraw();
    },
    onBlurItem: () => {
      live.current.focused = null;
      live.current.focusRing = false;
      redraw();
    },
    onPick: (e) => {
      const it = byId.get(e.currentTarget.dataset.node || "");
      if (!it) return;
      // picked again (it stays selected): back to the middle all the same
      if (it.id === selected) center(it);
      onSelect?.(it.node, true);
    },
  };
  const onKey = useCallback((e: React.KeyboardEvent<HTMLElement>) => handlers.current.onKey(e), []);
  const onFocusItem = useCallback((e: React.FocusEvent<HTMLButtonElement>) => handlers.current.onFocusItem(e), []);
  const onBlurItem = useCallback(() => handlers.current.onBlurItem(), []);
  const onPick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => handlers.current.onPick(e), []);

  const counts = ["concept", "note", "book"]
    .map((kind) => [kind, items.filter((n) => n.kind === kind).length] as const)
    .filter(([, count]) => count)
    .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`)
    .join(", ");
  const stop =
    tabStop && byId.has(tabStop) ? tabStop : selected && byId.has(selected) ? selected : (items[0]?.id ?? null);

  return (
    <div className="graph-wrap" ref={wrap}>
      <p className="visually-hidden" id={helpId}>
        Use the arrow keys to move to the nearest item that way, and Enter to read one in a card beside it. Double-click
        an item to open its page.
      </p>
      <canvas
        ref={canvas}
        className="graph"
        data-ready={ready || undefined}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const [sx, sy] = toScreen(e);
          live.current.press = { item: itemAt(sx, sy), sx, sy, v: live.current.view, moved: false };
        }}
        onPointerMove={(e) => {
          const s = live.current;
          const [sx, sy] = toScreen(e);
          const d = s.press;
          if (!d) {
            if (e.pointerType === "mouse") setHover(itemAt(sx, sy)?.id ?? null);
            return;
          }
          if (!e.buttons) {
            s.press = null;
            return;
          }
          // a drag starts only once the pointer really moves, so a click (or double-click) stays a click
          if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) > 3) {
            d.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.style.cursor = "grabbing";
            if (d.item) s.fitted = null;
          }
          if (!d.moved) return;
          if (d.item) {
            const [x, y] = toWorld(sx, sy);
            d.item.x = x;
            d.item.y = y;
            s.layout?.drag(d.item.i, x, y);
          } else {
            s.glide = null;
            s.view = { ...d.v, x: d.v.x + sx - d.sx, y: d.v.y + sy - d.sy };
          }
          redraw();
        }}
        onPointerUp={(e) => {
          const s = live.current;
          const d = s.press;
          s.press = null;
          if (d?.moved) {
            if (d.item) s.layout?.release(d.item.i);
            e.currentTarget.style.cursor = s.hover ? "pointer" : "";
            s.grid.build(props.current.items);
            s.stale = true;
            redraw();
          }
          s.pressed = d && !d.moved ? d : null;
        }}
        onPointerLeave={() => {
          if (!live.current.press) setHover(null);
        }}
        // the pick happens on the click, the press's last event: a card opened sooner (a sheet rising
        // under a finger, on a phone) would take that click as its own
        onClick={() => {
          const d = live.current.pressed;
          live.current.pressed = null;
          if (!d) return;
          if (d.item && d.item.id === selected) center(d.item);
          onSelect?.(d.item?.node ?? null, false);
        }}
        onDoubleClick={(e) => {
          const [sx, sy] = toScreen(e);
          const it = itemAt(sx, sy);
          if (it) openNode(it.node);
        }}
      />
      <GraphItems
        items={items}
        selected={selected}
        tabStop={stop}
        label={`Knowledge graph: ${counts || "empty"}`}
        helpId={helpId}
        layer={layer}
        onKey={onKey}
        onFocusItem={onFocusItem}
        onBlurItem={onBlurItem}
        onPick={onPick}
      />
      <PaletteProbe probe={probe} />
      <svg ref={iconProbe} className="graph-probe" aria-hidden="true" focusable="false">
        {(Object.keys(ICONS) as Kind[]).map((kind) => {
          const Icon = ICONS[kind];
          return (
            <g key={kind} data-icon={kind}>
              <Icon width={24} height={24} aria-hidden="true" />
            </g>
          );
        })}
      </svg>
      {!ready && (
        <div className="graph-wait">
          <Loading inline label="Laying out your graph" />
        </div>
      )}
      <div className="graph-tools">
        {tools}
        <button
          type="button"
          className="icon-button"
          onClick={() => zoom(1 / 1.3)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" onClick={() => zoom(1.3)} aria-label="Zoom in" title="Zoom in">
          <Plus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            const s = live.current;
            s.fitted = fit(items.filter(shownNow));
            moveTo(s.fitted);
          }}
          aria-label="Fit the graph"
          title="Fit the graph"
        >
          <Maximize2 aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** An arc from 12 o'clock clockwise covering `fraction` of the circle. */
function describeArc(r: number, fraction: number) {
  const a = fraction * Math.PI * 2;
  const x = Math.sin(a) * r,
    y = -Math.cos(a) * r;
  return `M0 ${-r}A${r} ${r} 0 ${fraction > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}
