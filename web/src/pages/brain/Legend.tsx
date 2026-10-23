/* The Brain's legend: a card over the graph's right side, like the item card on its left (opened from
 * the graph's tools, resized from its edge), saying what the graph's marks mean: each kind of item, how a
 * concept's circle shows what you recall, each kind of line, a picked item and a found one, and how to
 * move around. The marks are drawn by the graph's own code (NodeMark and its styles), so the legend
 * always matches. */
import { X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { GraphData } from "../../api";
import { ICON_STROKE, ICONS, iconSize, levelOf, NodeMark } from "../../components/GraphView";
import type { Panel } from "../../lib/usePanel";

type Kind = GraphData["nodes"][number]["kind"];

const R = 9;

/** An item's mark as the graph draws it, at legend size. */
function Mark({
  kind,
  mastery = null,
  selected,
  hit,
}: {
  kind: Kind;
  mastery?: number | null;
  selected?: boolean;
  hit?: boolean;
}) {
  const Icon = ICONS[kind];
  const s = iconSize(R);
  return (
    <svg className="legend-mark" viewBox="-16 -16 32 32" width="32" height="32" aria-hidden="true">
      <g
        className={`g-node g-${kind}`}
        data-level={kind === "concept" ? levelOf(mastery) : undefined}
        data-selected={selected || undefined}
        data-hit={hit || undefined}
      >
        {selected && <circle className="g-halo" r={R + 6} />}
        <NodeMark
          kind={kind}
          mastery={mastery}
          r={R}
          icon={<Icon className="g-icon" x={-s / 2} y={-s / 2} width={s} height={s} strokeWidth={ICON_STROKE} />}
        />
      </g>
    </svg>
  );
}

/** A kind of line as the graph draws it. */
function Line({ kind }: { kind: string }) {
  return (
    <svg className="legend-mark" viewBox="0 0 32 12" width="32" height="12" aria-hidden="true">
      <line className="g-edge" data-kind={kind} x1="2" y1="6" x2="30" y2="6" />
    </svg>
  );
}

function Row({ mark, name, children }: { mark: ReactNode; name: string; children?: ReactNode }) {
  return (
    <li className="legend-row">
      <span className="legend-swatch">{mark}</span>
      <span>
        <span className="legend-name">{name}</span>
        {children && <span className="legend-what">{children}</span>}
      </span>
    </li>
  );
}

export function Legend({
  panel,
  leaving,
  onClose,
}: {
  panel: Panel;
  /** The width it had, while it plays its way out (it's already closed). */
  leaving?: number;
  onClose: () => void;
}) {
  return (
    <aside
      className="legend-card"
      id={leaving ? undefined : panel.id}
      aria-labelledby="legend-title"
      data-leaving={leaving ? "" : undefined}
      style={leaving ? ({ [panel.cssVar]: `${leaving}px` } as CSSProperties) : undefined}
    >
      <div className="node-card-body">
        <header className="node-card-head">
          <span className="eyebrow">How to read the graph</span>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the legend"
            title="Close (Esc)"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <h2 className="node-card-title" id="legend-title">
          Legend
        </h2>
        <section aria-labelledby="legend-items">
          <h3 className="legend-sub" id="legend-items">
            Items
          </h3>
          <ul className="legend-list">
            <Row mark={<Mark kind="concept" mastery={0.9} />} name="Concept">
              An idea from your books, cards and notes. Bigger when more is built on it.
            </Row>
            <Row mark={<Mark kind="note" />} name="Note">
              Something you wrote.
            </Row>
            <Row mark={<Mark kind="book" />} name="Book">
              A book in your library.
            </Row>
          </ul>
        </section>
        <section aria-labelledby="legend-recall">
          <h3 className="legend-sub" id="legend-recall">
            What you recall of a concept
          </h3>
          <ul className="legend-list">
            <Row mark={<Mark kind="concept" />} name="Not studied yet">
              Dotted until you review a card, answer a quiz question on it or explain it.
            </Row>
            <Row mark={<Mark kind="concept" mastery={0.35} />} name="Fading, under 55%">
              The ring shows how much you would recall today.
            </Row>
            <Row mark={<Mark kind="concept" mastery={0.68} />} name="Getting there, 55 to 80%" />
            <Row mark={<Mark kind="concept" mastery={0.9} />} name="Known, 80% or more" />
          </ul>
        </section>
        <section aria-labelledby="legend-lines">
          <h3 className="legend-sub" id="legend-lines">
            Lines
          </h3>
          <ul className="legend-list">
            <Row mark={<Line kind="link" />} name="A link you wrote">
              A [[link]] or an embed in a note or a concept.
            </Row>
            <Row mark={<Line kind="related" />} name="Related">
              Listed in a note’s properties.
            </Row>
            <Row mark={<Line kind="mentions" />} name="About">
              A note’s concepts and topics, a concept’s neighbours.
            </Row>
            <Row mark={<Line kind="source" />} name="From a book">
              Where a concept or a note comes from.
            </Row>
            <Row mark={<Line kind="ai" />} name="Accepted from the agent">
              A connection it suggested and you kept.
            </Row>
            <Row mark={<Line kind="suggested" />} name="Suggested by the agent">
              Waiting for you to keep or turn down.
            </Row>
          </ul>
        </section>
        <section aria-labelledby="legend-marks">
          <h3 className="legend-sub" id="legend-marks">
            Picked and found
          </h3>
          <ul className="legend-list">
            <Row mark={<Mark kind="note" selected />} name="Picked">
              Its links light up and the rest fades.
            </Row>
            <Row mark={<Mark kind="note" hit />} name="Found">
              Matches what you typed in Find.
            </Row>
          </ul>
        </section>
        <section aria-labelledby="legend-moving">
          <h3 className="legend-sub" id="legend-moving">
            Moving around
          </h3>
          <ul className="legend-hints fine">
            <li>Click an item to read it in a card, double-click to open it.</li>
            <li>Drag an item to move it, or the background to pan; ⌘-scroll zooms.</li>
            <li>The arrow keys move between items, Enter reads one.</li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
