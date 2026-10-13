/* The knowledge graph as a force-directed picture that fills its box: concepts, notes, books (and, if
 * shown, annotations) as nodes, links as lines, recall as a ring. Hovering or focusing an item lights it
 * and its links; clicking it (or Enter) selects it, double-clicking opens its page. Arrow keys move
 * between items, dragging moves one, dragging the background pans, ⌘-scroll or the buttons zoom. */
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
import { Maximize2, Minus, Plus } from "lucide-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GraphData } from "../api";
import { go, openLink } from "../app/navigation";
import { useArrowKeys } from "../lib/a11y";

export type GraphNode = SimulationNodeDatum & GraphData["nodes"][number];
type N = GraphNode;
type L = SimulationLinkDatum<N> & { kind: string };
type View = { k: number; x: number; y: number };

const radius = (n: N) =>
  n.kind === "book" ? 0 : n.kind === "concept" ? 5 + n.size * 3 : n.kind === "annotation" ? 2.6 : 3.2;

/** The box an item and its label take up (labels run to the right; a book's sits on it). */
const box = (n: N) => {
  if (n.kind === "book") {
    const w = Math.min(26, n.label.length) * 6.6 + 22;
    return { x0: -w / 2, x1: w / 2, h: 26 };
  }
  const r = radius(n);
  return { x0: -r - 2, x1: r + 9 + n.label.length * 6.3, h: 16 };
};

/**
 * Keeps labels from running into each other: two items whose boxes overlap are pushed apart along the
 * shorter way out. Circles alone can't do it, since a label reaches well past its dot.
 */
function forceLabels(labeled: (n: N) => boolean) {
  let list: N[] = [];
  // like forceCollide, it pushes the same however warm the layout is: links would win as it cools
  const force = () => {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const ba = box(a);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const bb = box(b);
        const ox = Math.min(a.x! + ba.x1, b.x! + bb.x1) - Math.max(a.x! + ba.x0, b.x! + bb.x0);
        const oy = (ba.h + bb.h) / 2 + 4 - Math.abs(a.y! - b.y!);
        if (ox <= 0 || oy <= 0) continue;
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
    list = nodes.filter(labeled);
  };
  return force;
}

/** How well a concept is known, as a word the styles key on. */
export const levelOf = (m: number | null) => (m === null ? "none" : m >= 0.8 ? "strong" : m >= 0.55 ? "ok" : "weak");

/** Opens an item's own page: a book in the reader, a concept's page, a note, an annotation in its book. */
export function openNode(n: Pick<N, "kind" | "id" | "bookId" | "path">) {
  if (n.kind === "book") go(`#/book/${n.bookId}`);
  else if (n.kind === "concept") go(`#/brain/concept/${n.id.slice(8)}`);
  else if (n.kind === "annotation" && n.path) openLink(n.path.replace(/\.md$/, ""));
  else go(`#/notes/${n.id.slice(5)}`);
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
  tools,
}: {
  data: GraphData;
  showNotes?: boolean;
  showAnnotations?: boolean;
  showSuggestions?: boolean;
  /** Text to find: matching items are marked and the rest fade. */
  highlight?: string;
  /** Shows the graph as it was at this time (a replay of how it grew). */
  until?: number;
  /** The selected item's id: ringed, its links lit, kept in view. */
  selected?: string | null;
  /** An item was clicked (or chosen with Enter), or the background was clicked (null). */
  onSelect?: (node: N | null, byKeyboard: boolean) => void;
  /** Pixels at the right covered by a card: the selected item is kept clear of them. */
  inset?: number;
  /** More buttons for the cluster in the corner. */
  tools?: ReactNode;
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
  const drag = useRef<{ node?: N; sx: number; sy: number; v: View; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const helpId = useId();

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

  /** The view that shows every item, beside the card if one is open. */
  const fit = (list: N[], cover: number): View => {
    const { w, h } = sizeRef.current;
    let x0 = Number.POSITIVE_INFINITY,
      y0 = Number.POSITIVE_INFINITY,
      x1 = Number.NEGATIVE_INFINITY,
      y1 = Number.NEGATIVE_INFINITY;
    for (const n of list) {
      if (n.x === undefined || n.y === undefined) continue;
      x0 = Math.min(x0, n.x - 30);
      x1 = Math.max(x1, n.x + (n.kind === "book" ? 90 : 110)); // labels run to the right
      y0 = Math.min(y0, n.y - 24);
      y1 = Math.max(y1, n.y + 24);
    }
    if (!Number.isFinite(x0)) return { k: 1, x: -cover / 2, y: 0 };
    const k = Math.min(1.25, Math.max(0.3, Math.min((w - cover - 48) / (x1 - x0), (h - 48) / (y1 - y0))));
    return { k, x: -((x0 + x1) / 2) * k - cover / 2, y: -((y0 + y1) / 2) * k };
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: lays out again only when the graph changes (fit reads the size from a ref)
  useLayoutEffect(() => {
    const concepts = nodes.filter((n) => n.kind === "concept").length;
    const notes = nodes.filter((n) => n.kind === "note").length;
    const labeled = (n: N) =>
      (n.kind === "concept" && (concepts <= 40 || n.size > 1.3)) || (n.kind === "note" && notes <= 30);
    const fresh = nodes.filter((n) => n.x === undefined).length > nodes.length / 2;
    const s = forceSimulation<N, L>(nodes)
      .force(
        "link",
        forceLink<N, L>(links)
          .id((d) => d.id)
          .distance((l) => (l.kind === "related" ? 85 : l.kind === "source" ? 110 : 55))
          .strength((l) => (l.kind === "source" ? 0.15 : 0.5)),
      )
      .force(
        "charge",
        forceManyBody<N>().strength((d) => (d.kind === "book" ? -900 : d.kind === "concept" ? -220 : -60)),
      )
      .force(
        "collide",
        forceCollide<N>()
          .radius((d) => (d.kind === "book" ? 90 : d.kind === "concept" ? radius(d) + 40 : radius(d) + 8))
          .strength(0.9),
      )
      .force(
        "labels",
        forceLabels((n) => n.kind === "book" || labeled(n)),
      )
      .force("x", forceX(0).strength(0.04))
      .force("y", forceY(0).strength(0.06))
      .alphaDecay(0.035)
      .stop();
    // most of the layout happens before the first frame, so the graph opens calm instead of flying apart
    s.alpha(fresh ? 1 : 0.3).tick(fresh ? (nodes.length > 600 ? 60 : 160) : 30);
    if (fresh) {
      setGlide(false);
      setView(fit(nodes, 0));
    }
    let frame = 0;
    s.on("tick", () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setTick((t) => t + 1);
        });
    });
    s.restart();
    sim.current = s;
    previous.current = nodes;
    setTick((t) => t + 1);
    return () => {
      s.stop();
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
   * Keeps an item clear of the card and the edges: if it isn't, the view centres it, gliding unless the
   * move came from the arrow keys (what the keyboard does, often, happens at once).
   */
  const reveal = (n: N, cover: number, glided = true) => {
    if (n.x === undefined || n.y === undefined) return;
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    const sx = n.x * v.k + v.x,
      sy = n.y * v.k + v.y;
    if (sx > -w / 2 + 40 && sx < w / 2 - cover - 40 && sy > -h / 2 + 40 && sy < h / 2 - 40) return;
    setGlide(glided);
    setView({ ...v, x: -cover / 2 - n.x * v.k, y: -n.y * v.k });
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the selection or the card changes
  useEffect(() => {
    const n = selected ? nodes.find((x) => x.id === selected) : null;
    if (n) reveal(n, inset);
  }, [selected, inset]);

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
      const cx = -inset / 2;
      return { k, x: cx - (cx - v.x) * (k / v.k), y: v.y * (k / v.k) };
    });

  const q = highlight.trim().toLowerCase();
  const matches = (n: N) => !!q && n.label.toLowerCase().includes(q);
  const lead = hover ?? selected;
  const focus = lead ? new Set([lead, ...(neighbors.get(lead) || [])]) : null;
  const born = (n: N) => until === undefined || n.created <= until;
  const fewConcepts = nodes.filter((n) => n.kind === "concept").length <= 40;
  const fewNotes = nodes.filter((n) => n.kind === "note").length <= 30;
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
      reveal(n, inset, false);
    },
    onBlur: () => setHover(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect?.(n, true);
      }
    },
    onDoubleClick: () => openNode(n),
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
            if (n.kind === "book") {
              const label = n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label;
              const bw = label.length * 6.6 + 22;
              return (
                <g key={n.id} className="g-node g-book" {...common}>
                  <g className="g-shape">
                    <rect x={-bw / 2} y={-13} width={bw} height={26} rx={13} />
                    <text textAnchor="middle" y={4}>
                      {label}
                    </text>
                  </g>
                </g>
              );
            }
            const r = radius(n);
            const m = n.mastery;
            const arc = m === null ? "" : describeArc(r + 3.2, Math.max(0.001, Math.min(0.9999, m)));
            const showLabel =
              (n.kind === "concept" && (fewConcepts || n.size > 1.3)) ||
              (n.kind === "note" && fewNotes) ||
              hit ||
              focus?.has(n.id) ||
              view.k > 1.6;
            return (
              <g key={n.id} className={`g-node g-${n.kind}`} data-level={levelOf(m)} {...common}>
                <g className="g-shape">
                  <circle className="g-halo" r={r + 7} />
                  {n.kind === "note" ? (
                    <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={1} />
                  ) : n.kind === "annotation" ? (
                    <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" />
                  ) : (
                    <circle r={r} />
                  )}
                  {n.kind === "concept" && m !== null && <path d={arc} className="g-ring" />}
                </g>
                {showLabel && (
                  <text x={r + 7} y={4}>
                    {n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="graph-tools">
        {tools}
        <button type="button" className="icon-button" onClick={() => zoom(1.3)} aria-label="Zoom in" title="Zoom in">
          <Plus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => zoom(1 / 1.3)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => moveTo(fit(nodes.filter(born), inset))}
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
