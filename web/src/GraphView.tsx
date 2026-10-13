import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import { go, openLink, type GraphData } from "./api";

type N = SimulationNodeDatum & GraphData["nodes"][number];
type L = SimulationLinkDatum<N> & { kind: string };

const W = 1000;
const H = 640;

const radius = (n: N) => (n.kind === "book" ? 0 : n.kind === "concept" ? 5 + n.size * 3 : n.kind === "annotation" ? 2.6 : 3.2);

/**
 * The knowledge graph: books, concepts, notes (and, if shown, annotations), joined by their links.
 * Each concept's ring shows how well it's known. Links you wrote are solid, connections you accepted
 * from the agent dashed, its pending suggestions dotted.
 */
export function GraphView({ data, showNotes, showAnnotations = false, showSuggestions = false, highlight, until }: { data: GraphData; showNotes: boolean; showAnnotations?: boolean; showSuggestions?: boolean; highlight: string; until?: number }) {
  const nodes = useMemo<N[]>(() => data.nodes.filter((n) => (showNotes || n.kind !== "note") && (showAnnotations || n.kind !== "annotation")).map((n) => ({ ...n })), [data, showNotes, showAnnotations]);
  const links = useMemo<L[]>(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return data.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && (showSuggestions || e.kind !== "suggested")).map((e) => ({ source: e.from, target: e.to, kind: e.kind }));
  }, [data, nodes, showSuggestions]);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const sim = useRef<Simulation<N, L> | null>(null);
  const drag = useRef<{ node?: N; sx: number; sy: number; v: { k: number; x: number; y: number }; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const s = forceSimulation<N, L>(nodes)
      .force("link", forceLink<N, L>(links).id((d) => d.id).distance((l) => (l.kind === "related" ? 70 : l.kind === "source" ? 110 : 50)).strength((l) => (l.kind === "source" ? 0.15 : 0.5)))
      .force("charge", forceManyBody<N>().strength((d) => (d.kind === "book" ? -900 : d.kind === "concept" ? -160 : -40)))
      .force("collide", forceCollide<N>().radius((d) => (d.kind === "book" ? 90 : d.kind === "concept" ? radius(d) + 40 : radius(d) + 8)).strength(0.9))
      .force("x", forceX(W / 2).strength(0.04))
      .force("y", forceY(H / 2).strength(0.06))
      .alphaDecay(0.035);
    let frame = 0;
    s.on("tick", () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setTick((t) => t + 1);
        });
    });
    sim.current = s;
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

  /** Pointer position in viewBox units (screen) and in graph units (world). */
  const toScreen = (event: { clientX: number; clientY: number }) => {
    const box = svg.current!.getBoundingClientRect();
    return [((event.clientX - box.left) / box.width) * W, ((event.clientY - box.top) / box.height) * H];
  };
  const toWorld = (event: { clientX: number; clientY: number }) => {
    const [sx, sy] = toScreen(event);
    return [(sx - view.x) / view.k, (sy - view.y) / view.k];
  };
  const q = highlight.trim().toLowerCase();
  const focus = hover ? new Set([hover, ...(neighbors.get(hover) || [])]) : null;
  const born = (n: N) => until === undefined || n.created <= until;
  const fewConcepts = nodes.filter((n) => n.kind === "concept").length <= 40;
  const fewNotes = nodes.filter((n) => n.kind === "note").length <= 30;
  const matches = (n: N) => !!q && n.label.toLowerCase().includes(q);

  const open = (n: N) => {
    if (n.kind === "book") go(`#/book/${n.bookId}`);
    else if (n.kind === "concept") go(`#/brain/concept/${n.id.slice(8)}`);
    else if (n.kind === "annotation" && n.path) openLink(n.path.replace(/\.md$/, ""));
    else go(`#/notes/${n.id.slice(5)}`);
  };

  return (
    <div className="graph-wrap">
      <svg
        ref={svg}
        className="graph"
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={(e) => {
          const target = (e.target as Element).closest("[data-node]");
          const node = target ? nodes.find((n) => n.id === target.getAttribute("data-node")) : undefined;
          const [sx, sy] = toScreen(e);
          drag.current = { node, sx, sy, v: view, moved: false };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          if (node) {
            node.fx = node.x;
            node.fy = node.y;
            sim.current?.alphaTarget(0.2).restart();
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const [sx, sy] = toScreen(e);
          if (Math.hypot(sx - d.sx, sy - d.sy) > 3) d.moved = true;
          if (d.node) {
            const [x, y] = toWorld(e);
            d.node.fx = x;
            d.node.fy = y;
          } else if (d.moved) setView({ ...d.v, x: d.v.x + sx - d.sx, y: d.v.y + sy - d.sy });
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d?.node) {
            d.node.fx = null;
            d.node.fy = null;
            sim.current?.alphaTarget(0);
            if (!d.moved) open(d.node);
          }
        }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const box = svg.current!.getBoundingClientRect();
          const sx = ((e.clientX - box.left) / box.width) * W,
            sy = ((e.clientY - box.top) / box.height) * H;
          setView((v) => {
            const k = Math.min(4, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.01)));
            return { k, x: sx - ((sx - v.x) / v.k) * k, y: sy - ((sy - v.y) / v.k) * k };
          });
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {links.map((l, i) => {
            const a = l.source as N,
              b = l.target as N;
            if (a.x === undefined || b.x === undefined || !born(a) || !born(b)) return null;
            const lit = focus && focus.has(a.id) && focus.has(b.id);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="g-edge" data-kind={l.kind} data-lit={lit || undefined} data-dim={(focus && !lit) || undefined} />;
          })}
          {nodes.map((n) => {
            if (n.x === undefined || n.y === undefined || !born(n)) return null;
            const dim = focus && !focus.has(n.id);
            const hit = matches(n);
            if (n.kind === "book") {
              const label = n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label;
              const w = label.length * 6.6 + 22;
              return (
                <g key={n.id} data-node={n.id} className="g-node g-book" transform={`translate(${n.x} ${n.y})`} data-dim={dim || undefined} data-hit={hit || undefined} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
                  <rect x={-w / 2} y={-13} width={w} height={26} rx={3} />
                  <text textAnchor="middle" y={4}>
                    {label}
                  </text>
                </g>
              );
            }
            const r = radius(n);
            const m = n.mastery;
            const arc = m === null ? "" : describeArc(r + 3.2, Math.max(0.001, Math.min(0.9999, m)));
            const showLabel = (n.kind === "concept" && (fewConcepts || n.size > 1.3)) || (n.kind === "note" && fewNotes) || hover === n.id || hit || (focus && focus.has(n.id)) || view.k > 1.6;
            return (
              <g key={n.id} data-node={n.id} className={`g-node g-${n.kind}`} transform={`translate(${n.x} ${n.y})`} data-dim={dim || undefined} data-hit={hit || undefined} data-level={m === null ? "none" : m >= 0.8 ? "strong" : m >= 0.55 ? "ok" : "weak"} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
                {n.kind === "note" ? <rect x={-r} y={-r} width={r * 2} height={r * 2} /> : n.kind === "annotation" ? <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" /> : <circle r={r} />}
                {n.kind === "concept" && m !== null && <path d={arc} className="g-ring" />}
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
      {hover && <GraphTip node={nodes.find((n) => n.id === hover)!} />}
      <div className="graph-tools">
        <button className="icon-button" onClick={() => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.3) }))} aria-label="Zoom in">+</button>
        <button className="icon-button" onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k / 1.3) }))} aria-label="Zoom out">−</button>
        <button className="icon-button" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Reset view">⤢</button>
      </div>
    </div>
  );
}

function GraphTip({ node }: { node: N }) {
  return (
    <div className="graph-tip">
      <span className="eyebrow">{node.kind}</span>
      <b>{node.label}</b>
      {node.detail && <span className="fine">{node.detail}</span>}
      {node.kind === "concept" && <span className="fine">{node.mastery === null ? "Not studied yet" : `${Math.round(node.mastery * 100)}% recall`}</span>}
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
