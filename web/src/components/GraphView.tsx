/* The knowledge graph as a force-directed picture that fills its box: concepts, notes, books (and, if
 * shown, annotations) as circles with their kind's icon inside and their name beside them, links as
 * lines. A concept's circle shows how well it's known (NodeMark, which the Brain's legend draws too).
 * Hovering or focusing an item lights it and its links; clicking it (or Enter) selects it,
 * double-clicking opens its page. Arrow keys move between items, dragging moves one, dragging the
 * background pans, ⌘-scroll or the buttons zoom. */
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Book, FileText, Lightbulb, type LucideIcon, Maximize2, MessageSquareText, Minus, Plus } from "lucide-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "../api";
import { go, openLink } from "../app/navigation";
import { useArrowKeys } from "../lib/a11y";
import { noteRoute } from "../vaults/routes";

export type GraphNode = SimulationNodeDatum & GraphData["nodes"][number];
type N = GraphNode;
type L = SimulationLinkDatum<N> & { kind: string };
type View = { k: number; x: number; y: number };

type Kind = N["kind"];

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
/** How big the icon inside a circle of radius `r` is. */
export const iconSize = (r: number) => Math.max(9, r * 1.1);

/** A name as the graph shows it: a long book title is cut short. */
const labelOf = (n: N) => (n.kind === "book" && n.label.length > 30 ? `${n.label.slice(0, 29)}…` : n.label);

/** Which items' names are always shown: books, and concepts and notes unless there are many of them (then
 * only the concepts much is built on). Others show theirs when lit, found or zoomed in on. */
function namedIn(nodes: N[]) {
  const concepts = nodes.filter((n) => n.kind === "concept").length;
  const notes = nodes.filter((n) => n.kind === "note").length;
  return (n: N) =>
    n.kind === "book" ||
    (n.kind === "concept" && (concepts <= 40 || n.size > 1.3)) ||
    (n.kind === "note" && notes <= 30);
}

type Box = { x0: number; x1: number; h: number };
/** The box an item takes up around its centre: its circle, and its name to the right if `named`. */
const box = (n: N, named: boolean): Box => {
  const r = radius(n);
  const label = named ? 8 + labelOf(n).length * (n.kind === "book" ? 7.5 : 6.85) : 2;
  return { x0: -r - 2, x1: r + label, h: Math.max(16, r * 2 + 2) };
};
/** The room kept between one item's box and the next: across, and above and below. */
const GAP_X = 20;
const GAP_Y = 12;

/**
 * Keeps names clear of each other and of other items' circles: two items whose boxes (and the gap
 * between them) overlap are pushed apart along the shorter way out. Circles alone can't do it, since a
 * name reaches well past its dot.
 */
function forceLabels(named: (n: N) => boolean) {
  let list: { n: N; b: Box; named: boolean }[] = [];
  const left = (e: (typeof list)[number]) => e.n.x! + e.b.x0;
  // like forceCollide, it pushes the same however warm the layout is: links would win as it cools
  const force = () => {
    // in order from the left, each box only meets the ones that start before it ends
    list.sort((p, q) => left(p) - left(q));
    for (let i = 0; i < list.length; i++) {
      const { n: a, b: ba } = list[i];
      const end = a.x! + ba.x1 + GAP_X;
      for (let j = i + 1; j < list.length && left(list[j]) < end; j++) {
        // two circles without names are forceCollide's to keep apart
        if (!list[i].named && !list[j].named) continue;
        const { n: b, b: bb } = list[j];
        const ox = Math.min(end, b.x! + bb.x1 + GAP_X) - left(list[j]);
        const oy = (ba.h + bb.h) / 2 + GAP_Y - Math.abs(a.y! - b.y!);
        if (oy <= 0) continue;
        if (oy < ox) {
          const push = (a.y! < b.y! ? -1 : 1) * oy * 0.25;
          a.vy! += push;
          b.vy! -= push;
        } else {
          const push = (a.x! < b.x! ? -1 : 1) * ox * 0.25;
          a.vx! += push;
          b.vx! -= push;
        }
      }
    }
  };
  force.initialize = (nodes: N[]) => {
    list = nodes.map((n) => ({ n, b: box(n, named(n)), named: named(n) }));
  };
  return force;
}

/**
 * Gives the graph the shape of the room it's drawn in (`aspect`, width over height): while the items and
 * their names take up a narrower shape than that, they're spread apart sideways from the middle out (or
 * up and down while it's flatter). It only ever spreads, so it adds room between items and never crowds
 * them.
 */
function forceShape(aspect: number, named: (n: N) => boolean) {
  let list: { n: N; b: Box }[] = [];
  const force = (alpha: number) => {
    let x0 = Number.POSITIVE_INFINITY,
      x1 = Number.NEGATIVE_INFINITY,
      y0 = Number.POSITIVE_INFINITY,
      y1 = Number.NEGATIVE_INFINITY;
    for (const { n, b } of list) {
      x0 = Math.min(x0, n.x! + b.x0);
      x1 = Math.max(x1, n.x! + b.x1);
      y0 = Math.min(y0, n.y! - b.h / 2);
      y1 = Math.max(y1, n.y! + b.h / 2);
    }
    const off = Math.log(aspect / ((x1 - x0) / (y1 - y0) || 1));
    if (!Number.isFinite(off) || Math.abs(off) < 0.02) return;
    const k = alpha * 0.6 * Math.min(1, Math.abs(off));
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    for (const { n } of list) {
      if (off > 0) n.vx! += (n.x! - cx) * k;
      else n.vy! += (n.y! - cy) * k;
    }
  };
  force.initialize = (nodes: N[]) => {
    list = nodes.map((n) => ({ n, b: box(n, named(n)) }));
  };
  return force;
}

/** Room left at the graph's edges when it's fitted: for the find field above and the tools below, and a
 * margin at the sides. */
const EDGE_X = 32;
const EDGE_Y = 56;

/** How well a concept is known, as a word the styles key on. */
export const levelOf = (m: number | null) => (m === null ? "none" : m >= 0.8 ? "strong" : m >= 0.55 ? "ok" : "weak");

/**
 * An item's mark, centred on (0, 0): its circle with its kind's `icon` inside. Books are filled coal, notes
 * sky and annotations lavender, with the icon in the opposite tone. A concept's circle is dotted until
 * you study it, then a ring of how much you'd recall (rose while it fades, butter while it grows), and
 * filled sage once you know it. Styled by `.g-<kind>` and `data-level` on a parent.
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
export function openNode(n: Pick<N, "kind" | "id" | "bookId" | "path" | "vault">) {
  if (n.kind === "book") go(`#/book/${n.bookId}`);
  else if (n.kind === "concept") go(`#/brain/concept/${n.id.slice(8)}`);
  else if (n.kind === "annotation" && n.path) openLink(n.path.replace(/\.md$/, ""));
  else if (n.vault && n.path) go(noteRoute(n.vault, n.path));
  else go("#/vaults");
}

/**
 * The knowledge graph: books, concepts, notes (and, if shown, annotations), joined by their links.
 * Each concept's ring shows how well it's known. Links you wrote are solid, connections you accepted
 * from the agent dashed, its pending suggestions dotted. The selected item (and whatever is hovered)
 * lights its neighbourhood and dims the rest.
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
  tools,
  onOpen = openNode,
}: {
  data: GraphData;
  showNotes?: boolean;
  showAnnotations?: boolean;
  showSuggestions?: boolean;
  /** Text to find: matching items are marked and the rest fade. */
  highlight?: string;
  /** Shows the graph as it was at this time (a replay of how it grew: each item and link fades in as it's made). */
  until?: number;
  /** The selected item's id: ringed, its links lit, kept in view. */
  selected?: string | null;
  /** An item was clicked (or chosen with Enter), or the background was clicked (null). */
  onSelect?: (node: N | null, byKeyboard: boolean) => void;
  /** Pixels at the right covered by a card: the selected item is kept clear of them. */
  inset?: number;
  /** Pixels at the left covered by a card, kept clear the same way. */
  insetLeft?: number;
  /** More buttons for the cluster in the corner. */
  tools?: ReactNode;
  /** Opens an item's page (on double-click): its own page in the app, unless the graph is of another vault. */
  onOpen?: (node: N) => void;
}) {
  // nodes keep where they were when the graph reloads (a link accepted, a note added)
  const previous = useRef<N[]>([]);
  const nodes = useMemo<N[]>(() => {
    const was = new Map(previous.current.map((n) => [n.id, n]));
    return data.nodes
      .filter((n) => (showNotes || n.kind !== "note") && (showAnnotations || n.kind !== "annotation"))
      .map((n) => {
        const old = was.get(n.id);
        return old ? { ...n, x: old.x, y: old.y } : { ...n };
      });
  }, [data, showNotes, showAnnotations]);
  const links = useMemo<L[]>(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return data.edges
      .filter((e) => ids.has(e.from) && ids.has(e.to) && (showSuggestions || e.kind !== "suggested"))
      .map((e) => ({ source: e.from, target: e.to, kind: e.kind }));
  }, [data, nodes, showSuggestions]);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // moves the view smoothly when it changes on its own (fit, zoom buttons, bringing an item into view)
  const [glide, setGlide] = useState(false);
  const moveTo = (next: View | ((v: View) => View)) => {
    setGlide(true);
    setView(next);
  };
  const sim = useRef<Simulation<N, L> | null>(null);
  // the view the graph was last fitted to, until you move it (or an item) yourself
  const fitted = useRef<View | null>(null);
  // the graph last laid out
  const laidOut = useRef<{ nodes?: N[]; links?: L[]; alpha?: number }>({});
  const drag = useRef<{ node?: N; sx: number; sy: number; v: View; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const helpId = useId();
  // the icons are drawn once, as symbols every item uses
  const icons = `g-icons${useId().replace(/[^\w-]/g, "")}`;

  // the drawing is as big as its box, one unit a pixel, with (0, 0) in the middle
  const [size, setSize] = useState({ w: 1000, h: 640 });
  const sizeRef = useRef(size);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      sizeRef.current = { w: r.width, h: r.height };
      setSize(sizeRef.current);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the cards over either side, read when the view moves
  const covered = useRef({ left: 0, right: 0 });
  covered.current = { left: insetLeft, right: inset };

  const named = useMemo(() => namedIn(nodes), [nodes]);

  /** The view that shows every item (and the names always shown), between the cards if any are open and
   * clear of the find field and the tools. */
  const fit = (list: N[]): View => {
    const { w, h } = sizeRef.current;
    const { left, right } = covered.current;
    const mid = (left - right) / 2;
    let x0 = Number.POSITIVE_INFINITY,
      y0 = Number.POSITIVE_INFINITY,
      x1 = Number.NEGATIVE_INFINITY,
      y1 = Number.NEGATIVE_INFINITY;
    for (const n of list) {
      if (n.x === undefined || n.y === undefined) continue;
      const b = box(n, named(n));
      x0 = Math.min(x0, n.x + b.x0);
      x1 = Math.max(x1, n.x + b.x1);
      y0 = Math.min(y0, n.y - b.h / 2);
      y1 = Math.max(y1, n.y + b.h / 2);
    }
    if (!Number.isFinite(x0)) return { k: 1, x: mid, y: 0 };
    const k = Math.min(
      1.25,
      Math.max(0.3, Math.min((w - left - right - 2 * EDGE_X) / (x1 - x0), (h - 2 * EDGE_Y) / (y1 - y0))),
    );
    return { k, x: -((x0 + x1) / 2) * k + mid, y: -((y0 + y1) / 2) * k };
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: lays out again only when the graph changes (fit reads the size from a ref)
  useLayoutEffect(() => {
    const fresh = nodes.filter((n) => n.x === undefined).length > nodes.length / 2;
    // the same graph laid out again (React mounting it twice in development): it carries on from where it was
    const again = laidOut.current.nodes === nodes && laidOut.current.links === links;
    const wasAt = laidOut.current.alpha ?? 0;
    laidOut.current = { nodes, links };
    // the graph takes the shape of the room it's drawn in (forceShape, and a pull to the middle that is
    // weaker along the longer side), and a small graph spreads out to fill it: a big one keeps the spacing
    // below and is zoomed out to fit
    const { w, h } = sizeRef.current;
    const roomW = w - 2 * EDGE_X,
      roomH = Math.max(1, h - 2 * EDGE_Y);
    const aspect = Math.min(2.5, Math.max(0.4, roomW / roomH));
    // 25000: about the room (px²) an item and its name take at the spacing below
    const spread = Math.min(2, Math.max(1, Math.sqrt((roomW * roomH) / (nodes.length * 25000))));
    // links hold an item with few of them close (a note on one book stays by it), a hub more loosely
    const idOf = (end: L["source"]) => (typeof end === "object" ? (end as N).id : String(end));
    const degree = new Map<string, number>();
    for (const l of links)
      for (const end of [l.source, l.target]) degree.set(idOf(end), (degree.get(idOf(end)) ?? 0) + 1);
    const s = forceSimulation<N, L>(nodes)
      .force(
        "link",
        forceLink<N, L>(links)
          .id((d) => d.id)
          .distance((l) => spread * (l.kind === "related" ? 100 : l.kind === "source" ? 110 : 70))
          .strength(
            (l) =>
              (l.kind === "source" ? 0.5 : 1) /
              Math.min(degree.get(idOf(l.source)) ?? 1, degree.get(idOf(l.target)) ?? 1),
          ),
      )
      .force(
        "charge",
        // pushing only across a short way, so the graph fills evenly and nothing is flung far off
        forceManyBody<N>()
          .strength((d) => spread ** 2 * (d.kind === "book" ? -500 : d.kind === "concept" ? -300 : -200))
          .distanceMax(spread * 320),
      )
      .force(
        "collide",
        forceCollide<N>()
          .radius((d) => radius(d) + (d.kind === "book" ? 50 : d.kind === "concept" ? 36 : 24))
          .strength(0.9),
      )
      .force("labels", forceLabels(named))
      .force("shape", forceShape(aspect, named))
      .force("x", forceX(0).strength(0.06 / aspect))
      .force("y", forceY(0).strength(0.06 * aspect))
      .alphaDecay(0.035)
      .stop();
    // the layout happens before the first frame (200 steps take it all the way to rest; a graph of over 600
    // items finishes on screen), so the graph opens calm and framed instead of flying apart
    if (again) s.alpha(wasAt);
    else s.alpha(fresh ? 1 : 0.3).tick(fresh ? (nodes.length > 600 ? 80 : 200) : 30);
    if (fresh) {
      fitted.current = fit(nodes);
      // read at once by bringing a picked item into view, before the next render
      viewRef.current = fitted.current;
      setGlide(false);
      setView(fitted.current);
    }
    let frame = 0;
    s.on("tick", () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setTick((t) => t + 1);
        });
    });
    // once it comes to rest, a graph still as it was fitted is fitted again: what settles after the first
    // frame (items added, links accepted) stays in view
    s.on("end", () => {
      if (!fitted.current || viewRef.current !== fitted.current) return;
      fitted.current = fit(nodes);
      moveTo(fitted.current);
    });
    s.restart();
    sim.current = s;
    previous.current = nodes;
    setTick((t) => t + 1);
    return () => {
      s.stop();
      laidOut.current.alpha = s.alpha();
      cancelAnimationFrame(frame);
    };
  }, [nodes, links]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of links) {
      const a = typeof l.source === "object" ? (l.source as N).id : String(l.source);
      const b = typeof l.target === "object" ? (l.target as N).id : String(l.target);
      (map.get(a) || map.set(a, new Set()).get(a)!).add(b);
      (map.get(b) || map.set(b, new Set()).get(b)!).add(a);
    }
    return map;
  }, [links]);

  /**
   * Keeps an item clear of the cards and the edges: if it isn't, the view centres it between them, gliding
   * unless the move came from the arrow keys (what the keyboard does, often, happens at once).
   */
  const reveal = (n: N, glided = true) => {
    if (n.x === undefined || n.y === undefined) return;
    const { w, h } = sizeRef.current;
    const { left, right } = covered.current;
    const v = viewRef.current;
    const sx = n.x * v.k + v.x,
      sy = n.y * v.k + v.y;
    if (sx > -w / 2 + left + 40 && sx < w / 2 - right - 40 && sy > -h / 2 + EDGE_Y && sy < h / 2 - EDGE_Y) return;
    setGlide(glided);
    setView({ ...v, x: (left - right) / 2 - n.x * v.k, y: -n.y * v.k });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the selection or a card changes
  useEffect(() => {
    const n = selected ? nodes.find((x) => x.id === selected) : null;
    if (n) reveal(n);
  }, [selected, inset, insetLeft]);

  /** Pointer position in drawing units, from the middle of the box. */
  const toScreen = (event: { clientX: number; clientY: number }) => {
    const box = svg.current!.getBoundingClientRect();
    return [event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2];
  };
  const toWorld = (event: { clientX: number; clientY: number }) => {
    const [sx, sy] = toScreen(event);
    return [(sx - view.x) / view.k, (sy - view.y) / view.k];
  };
  const zoom = (factor: number) =>
    moveTo((v) => {
      const k = Math.min(4, Math.max(0.3, v.k * factor));
      const cx = (insetLeft - inset) / 2;
      return { k, x: cx - (cx - v.x) * (k / v.k), y: v.y * (k / v.k) };
    });

  const q = highlight.trim().toLowerCase();
  const matches = (n: N) => !!q && n.label.toLowerCase().includes(q);
  const lead = hover ?? selected;
  const focus = lead ? new Set([lead, ...(neighbors.get(lead) || [])]) : null;
  const born = (n: N) => until === undefined || n.created <= until;
  const dimmed = (n: N) => (focus ? !focus.has(n.id) : q ? !matches(n) : false);

  const describe = (n: N) =>
    n.kind === "concept"
      ? `Concept: ${n.label}, ${n.mastery === null ? "not studied yet" : `${Math.round(n.mastery * 100)}% recall`}`
      : `${n.kind === "annotation" ? "Annotation" : n.kind === "book" ? "Book" : "Note"}: ${n.label}`;
  const keys = (n: N) => ({
    tabIndex: -1,
    role: "button",
    "aria-label": describe(n),
    "aria-pressed": n.id === selected,
    onFocus: () => {
      setHover(n.id);
      reveal(n, false);
    },
    onBlur: () => setHover(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect?.(n, true);
      }
    },
    onDoubleClick: () => onOpen(n),
  });
  useArrowKeys(svg, { selector: "[data-node]", orientation: "both" });
  const counts = ["concept", "note", "book"]
    .map((kind) => [kind, nodes.filter((n) => n.kind === kind).length] as const)
    .filter(([, count]) => count)
    .map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`)
    .join(", ");
  const { w, h } = size;

  return (
    <div className="graph-wrap" ref={wrap}>
      <p className="visually-hidden" id={helpId}>
        Use the arrow keys to move between the items in the graph, and Enter to read one in a card beside it.
        Double-click an item to open its page.
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: an SVG can't be a fieldset; role=group names the drawing's items as a set */}
      <svg
        ref={svg}
        className="graph"
        data-replay={until !== undefined || undefined}
        viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
        role="group"
        aria-label={`Knowledge graph: ${counts || "empty"}`}
        aria-describedby={helpId}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const target = (e.target as Element).closest("[data-node]");
          const node = target ? nodes.find((n) => n.id === target.getAttribute("data-node")) : undefined;
          const [sx, sy] = toScreen(e);
          drag.current = { node, sx, sy, v: view, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (!e.buttons) {
            drag.current = null;
            return;
          }
          const [sx, sy] = toScreen(e);
          // a drag starts only once the pointer really moves, so a click (or double-click) stays a click
          if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) > 3) {
            d.moved = true;
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            if (d.node) {
              fitted.current = null;
              d.node.fx = d.node.x;
              d.node.fy = d.node.y;
              sim.current?.alphaTarget(0.2).restart();
            }
          }
          if (!d.moved) return;
          if (d.node) {
            const [x, y] = toWorld(e);
            d.node.fx = x;
            d.node.fy = y;
          } else {
            setGlide(false);
            setView({ ...d.v, x: d.v.x + sx - d.sx, y: d.v.y + sy - d.sy });
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d?.node && d.moved) {
            d.node.fx = null;
            d.node.fy = null;
            sim.current?.alphaTarget(0);
          }
          if (d && !d.moved) onSelect?.(d.node ?? null, false);
        }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const [sx, sy] = toScreen(e);
          setGlide(false);
          setView((v) => {
            const k = Math.min(4, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.01)));
            return { k, x: sx - ((sx - v.x) / v.k) * k, y: sy - ((sy - v.y) / v.k) * k };
          });
        }}
      >
        <title>Knowledge graph</title>
        <defs>
          {(Object.keys(ICONS) as Kind[]).map((kind) => {
            const Icon = ICONS[kind];
            return (
              <symbol key={kind} id={`${icons}-${kind}`} viewBox="0 0 24 24">
                <Icon width={24} height={24} strokeWidth={ICON_STROKE} aria-hidden="true" />
              </symbol>
            );
          })}
        </defs>
        <g
          className="g-view"
          data-glide={glide || undefined}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
          onTransitionEnd={(e) => e.target === e.currentTarget && setGlide(false)}
        >
          {links.map((l, i) => {
            const a = l.source as N,
              b = l.target as N;
            if (a.x === undefined || b.x === undefined || !born(a) || !born(b)) return null;
            const lit = focus?.has(a.id) && focus.has(b.id) && (a.id === lead || b.id === lead);
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: edges are rebuilt whole with the graph
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="g-edge"
                data-kind={l.kind}
                data-lit={lit || undefined}
                data-dim={(focus ? !lit : !!q) || undefined}
              />
            );
          })}
          {nodes.map((n) => {
            if (n.x === undefined || n.y === undefined || !born(n)) return null;
            const hit = matches(n);
            const common = {
              "data-node": n.id,
              transform: `translate(${n.x} ${n.y})`,
              "data-dim": dimmed(n) || undefined,
              "data-hit": hit || undefined,
              "data-selected": n.id === selected || undefined,
              onPointerEnter: () => setHover(n.id),
              onPointerLeave: () => setHover(null),
              ...keys(n),
            };
            const r = radius(n);
            const s = iconSize(r);
            const showLabel = named(n) || hit || focus?.has(n.id) || view.k > 1.6;
            return (
              <g
                key={n.id}
                className={`g-node g-${n.kind}`}
                data-level={n.kind === "concept" ? levelOf(n.mastery) : undefined}
                {...common}
              >
                <g className="g-shape">
                  <circle className="g-halo" r={r + 6} />
                  <NodeMark
                    kind={n.kind}
                    mastery={n.mastery}
                    r={r}
                    icon={
                      <use href={`#${icons}-${n.kind}`} className="g-icon" x={-s / 2} y={-s / 2} width={s} height={s} />
                    }
                  />
                </g>
                {showLabel && (
                  <text x={r + 6} y={4}>
                    {labelOf(n)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
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
          onClick={() => moveTo(fit(nodes.filter(born)))}
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
