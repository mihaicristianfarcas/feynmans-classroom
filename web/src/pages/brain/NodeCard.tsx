/* The card at the left of the Brain's graph, for the item you picked: a concept's summary, recall and
 * sources (with a way to explain it back), a note's text, a book or an annotation in brief. Its links
 * pick other items in the graph, and links the agent suggests can be accepted or turned down there.
 * SuggestionsCard lists every suggested link, and asks the agent for more. */
import { X } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from "react";
import { docs, type GraphData, learn, type Note } from "../../api";
import { bookLink } from "../../app/navigation";
import { Mastery, Spinner } from "../../components/feedback";
import { levelOf, openNode } from "../../components/GraphView";
import { Markdown } from "../../components/Markdown";
import { ExplainBack } from "../../components/tools";
import { announce } from "../../lib/a11y";
import { useLoad } from "../../lib/useLoad";
import { panelId } from "../../lib/usePanel";

type Node = GraphData["nodes"][number];

/** The card's name as a side panel: the Brain keeps its width under it, and its edge controls the card. */
export const CARD_PANEL = "brain-card";
type Edge = GraphData["edges"][number];

const EYEBROW: Record<Node["kind"], string> = {
  concept: "Concept",
  note: "Note",
  book: "Book",
  annotation: "From a book",
};
const OPEN: Record<Node["kind"], string> = {
  concept: "Open page",
  note: "Open note",
  book: "Read",
  annotation: "Open in the book",
};

/** The frame every card shares: a close button, a body that scrolls, and actions along the bottom. */
function Frame({
  eyebrow,
  title,
  titleRef,
  onClose,
  leaving,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  titleRef: Ref<HTMLHeadingElement>;
  onClose: () => void;
  leaving?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <aside className="node-card" id={panelId(CARD_PANEL)} aria-labelledby={titleId} data-leaving={leaving || undefined}>
      <div className="node-card-body">
        <header className="node-card-head">
          <span className="eyebrow">{eyebrow}</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <X aria-hidden="true" />
          </button>
        </header>
        <h2 className="node-card-title" id={titleId} ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
      {actions && <footer className="node-card-foot">{actions}</footer>}
    </aside>
  );
}

/** Moves focus to the card's title when it was opened from the keyboard (and on each new item). */
function useTitleFocus(key: string, focus: boolean) {
  const ref = useRef<HTMLHeadingElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per item shown
  useEffect(() => {
    if (focus) ref.current?.focus({ preventScroll: true });
  }, [key]);
  return ref;
}

export function NodeCard({
  node,
  data,
  theme,
  focus,
  leaving,
  onPick,
  onClose,
  onChanged,
}: {
  node: Node;
  data: GraphData;
  theme: "light" | "dark";
  /** Opened from the keyboard: focus goes to the card. */
  focus: boolean;
  leaving?: boolean;
  /** Picks another item in the graph. */
  onPick: (id: string) => void;
  onClose: () => void;
  /** A suggested link was decided: the graph reloads. */
  onChanged: () => void;
}) {
  const titleRef = useTitleFocus(node.id, focus);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const touching = (e: Edge) => e.from === node.id || e.to === node.id;
  const linked = [
    ...new Map(
      data.edges
        .filter((e) => touching(e) && e.kind !== "suggested")
        .map((e) => byId.get(e.from === node.id ? e.to : e.from))
        .filter((n): n is Node => !!n && n.kind !== "annotation")
        .map((n) => [n.id, n]),
    ).values(),
  ];
  const suggested = data.edges.filter((e) => touching(e) && e.kind === "suggested");
  const [explaining, setExplaining] = useState(false);
  const { data: concept } = useLoad(
    () => (node.kind === "concept" ? learn.concept(node.id.slice(8)) : Promise.resolve(null)),
    [node.id],
  );
  const { data: note } = useLoad(
    () => (node.kind === "note" ? docs.get<Note>(node.id.slice(5)) : Promise.resolve(null)),
    [node.id],
  );
  // useLoad keeps the last item's data until the next arrives: show it only if it's this item's
  const current = <T extends { id: string }>(x: T | null) =>
    x && (node.kind === "concept" ? `concept:${x.id}` : `note:${x.id}`) === node.id ? x : null;
  const c = current(concept);
  const n = current(note);

  return (
    <Frame
      eyebrow={
        node.kind === "note" && node.detail && node.detail !== "note"
          ? node.detail[0].toUpperCase() + node.detail.slice(1)
          : EYEBROW[node.kind]
      }
      title={node.label}
      titleRef={titleRef}
      onClose={onClose}
      leaving={leaving}
      actions={
        <>
          {node.kind === "concept" && (
            <button
              type="button"
              className="button primary"
              aria-haspopup="dialog"
              disabled={!c}
              onClick={() => setExplaining(true)}
            >
              Explain it back
            </button>
          )}
          <button type="button" className="button" onClick={() => openNode(node)}>
            {OPEN[node.kind]}
          </button>
        </>
      }
    >
      <div className="node-card-content" key={node.id}>
        {node.kind === "concept" && (
          <>
            <div className="node-card-recall">
              {node.mastery === null ? (
                <span className="fine">Not studied yet</span>
              ) : (
                <>
                  <Mastery value={node.mastery} wide />
                  <span className="fine">recall</span>
                </>
              )}
            </div>
            {node.detail && <p className="node-card-lede">{node.detail}</p>}
            {!c ? (
              <Spinner label="Opening" />
            ) : (
              <>
                {c.body && <Markdown text={c.body} theme={theme} className="node-card-md" />}
                {c.sources.length > 0 && (
                  <section>
                    <h3 className="node-card-sub">From</h3>
                    <ul className="plain">
                      {c.sources.slice(0, 3).map((s, i) => (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                          key={i}
                        >
                          <a href={bookLink(s)}>{s.title || "A book"}</a>
                          {s.quote && <blockquote className="quote">“{s.quote}”</blockquote>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {(c.cards.length > 0 || c.notes.length > 0) && (
                  <p className="fine">
                    {[
                      c.cards.length && `${c.cards.length} card${c.cards.length === 1 ? "" : "s"}`,
                      c.notes.length && `${c.notes.length} note${c.notes.length === 1 ? "" : "s"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </>
            )}
          </>
        )}
        {node.kind === "note" &&
          (!n ? (
            <Spinner label="Opening" />
          ) : n.body.trim() ? (
            <Markdown text={n.body} theme={theme} className="node-card-md" base={n.path} />
          ) : (
            <p className="fine">This note is empty.</p>
          ))}
        {node.kind === "book" && node.detail && <p className="node-card-lede">{node.detail}</p>}
        {node.kind === "annotation" && node.detail && <p className="fine">{node.detail}</p>}
        {linked.length > 0 && (
          <section>
            <h3 className="node-card-sub">Linked</h3>
            <div className="chips">
              {linked.map((l) => (
                <button
                  type="button"
                  key={l.id}
                  className="chip node-chip"
                  data-kind={l.kind}
                  data-level={l.kind === "concept" ? levelOf(l.mastery) : undefined}
                  onClick={() => onPick(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </section>
        )}
        {suggested.length > 0 && (
          <section>
            <h3 className="node-card-sub">Suggested links</h3>
            <ul className="plain suggestion-list">
              {suggested.map((e) => (
                <Suggestion key={e.id} edge={e} byId={byId} onChanged={onChanged} />
              ))}
            </ul>
          </section>
        )}
      </div>
      {explaining && c && (
        <ExplainBack
          concept={c.title}
          passage={c.summary}
          source={c.sources[0]}
          theme={theme}
          onClose={() => {
            setExplaining(false);
            onChanged();
          }}
        />
      )}
    </Frame>
  );
}

/** One link the agent suggests: both ends, why, and Link / Not related. */
function Suggestion({ edge, byId, onChanged }: { edge: Edge; byId: Map<string, Node>; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "accept" | "reject") => {
    setBusy(true);
    try {
      await learn.decideConnection(edge.id!, decision);
      announce(decision === "accept" ? "Linked" : "Turned down");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="suggestion-item">
      <span className="suggestion-ends">
        {byId.get(edge.from)?.label || edge.from} <span aria-hidden="true">→</span>
        <span className="visually-hidden"> to </span> {byId.get(edge.to)?.label || edge.to}
      </span>
      {edge.why && <span className="fine">{edge.why}</span>}
      <span className="row gap">
        <button type="button" className="button" disabled={busy} onClick={() => decide("accept")}>
          Link
        </button>
        <button type="button" className="link" disabled={busy} onClick={() => decide("reject")}>
          Not related
        </button>
      </span>
    </li>
  );
}

/** Every link the agent suggests, and a way to ask it to read recent notes for more. */
export function SuggestionsCard({
  data,
  focus,
  leaving,
  onClose,
  onChanged,
}: {
  data: GraphData;
  focus: boolean;
  leaving?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const titleRef = useTitleFocus("suggestions", focus);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const pending = data.edges.filter((e) => e.kind === "suggested");
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Frame
      eyebrow="The agent"
      title="Suggested links"
      titleRef={titleRef}
      onClose={onClose}
      leaving={leaving}
      actions={
        <button
          type="button"
          className="button"
          disabled={!!busy}
          onClick={async () => {
            setBusy(Date.now());
            setError(null);
            try {
              await learn.suggestConnections();
              onChanged();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy ? "Reading your notes…" : "Look for more"}
        </button>
      }
    >
      <div className="node-card-content">
        {busy && <Spinner label="The agent is reading your recent notes" since={busy} />}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {pending.length === 0 ? (
          <p className="fine">
            None waiting. The agent reads your recent notes and proposes links worth following; you decide on each.
          </p>
        ) : (
          <ul className="plain suggestion-list">
            {pending.map((e) => (
              <Suggestion key={e.id} edge={e} byId={byId} onChanged={onChanged} />
            ))}
          </ul>
        )}
      </div>
    </Frame>
  );
}
