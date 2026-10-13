/* The Brain's graph tab: your vault as a graph you can filter, a replay of how it grew, and the links
 * the agent suggests, to accept or reject one by one. */
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { learn } from "../../api";
import { Spinner } from "../../components/feedback";
import { GraphView } from "../../components/GraphView";
import { useLoad } from "../../lib/useLoad";

export function GraphTab({ filter }: { filter: string }) {
  const { data, reload } = useLoad(() => learn.graph());
  const [notes, setNotes] = useState(true);
  const [annotationsShown, setAnnotationsShown] = useState(false);
  const [suggestions, setSuggestions] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = (data?.edges || []).filter((e) => e.kind === "suggested");
  const label = (id: string) => data?.nodes.find((n) => n.id === id)?.label || id;
  // the learning journey: replay how the graph grew
  const [until, setUntil] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const times = useMemo(
    () =>
      data
        ? data.nodes
            .map((n) => n.created)
            .filter(Number.isFinite)
            .sort((a, b) => a - b)
        : [],
    [data],
  );
  const first = times[0] ?? Date.now(),
    last = times[times.length - 1] ?? Date.now();
  useEffect(() => {
    if (!playing) return;
    const span = Math.max(1, last - first);
    const timer = setInterval(() => {
      setUntil((u) => {
        const next = (u ?? first) + span / 120;
        if (next >= last) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [playing, first, last]);
  if (!data) return <Spinner label="Drawing your graph" />;
  if (!data.nodes.some((n) => n.kind !== "book"))
    return (
      <div className="empty">
        <p className="lede small">
          Your graph grows as you learn: concepts come from the chapters you map (Study → Map concepts in the reader),
          the cards you make and the ideas you explain.
        </p>
      </div>
    );
  return (
    <div>
      <div className="row gap graph-legend">
        <label className="check">
          <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
          Notes
        </label>
        <label className="check" title="Highlights, explanations and figures from books">
          <input type="checkbox" checked={annotationsShown} onChange={(e) => setAnnotationsShown(e.target.checked)} />
          Annotations
        </label>
        <label className="check" title="Links the agent suggests (dotted) until you decide">
          <input type="checkbox" checked={suggestions} onChange={(e) => setSuggestions(e.target.checked)} />
          Suggestions
        </label>
        <span className="legend-item">
          <span className="legend-line" data-kind="link" /> your link
        </span>
        <span className="legend-item">
          <span className="legend-line" data-kind="ai" /> accepted
        </span>
        <span className="legend-item">
          <span className="legend-line" data-kind="suggested" /> suggested
        </span>
        <span className="legend-item">
          <span className="legend-ring" data-level="strong" /> well known
        </span>
        <span className="legend-item">
          <span className="legend-ring" data-level="ok" /> getting there
        </span>
        <span className="legend-item">
          <span className="legend-ring" data-level="weak" /> fading
        </span>
        <span className="legend-item">
          <span className="legend-ring" data-level="none" /> not studied
        </span>
        <span className="fine">Drag to move · ⌘-scroll to zoom · click to open</span>
      </div>
      <GraphView
        data={data}
        showNotes={notes}
        showAnnotations={annotationsShown}
        showSuggestions={suggestions}
        highlight={filter}
        until={until ?? undefined}
      />
      {times.length > 1 && (
        <div className="growth">
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              if (!playing) setUntil(first);
              setPlaying(!playing);
            }}
            aria-label={playing ? "Pause" : "Replay your graph's growth"}
            title="Replay how your graph grew"
          >
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <input
            type="range"
            min={first}
            max={last}
            step={Math.max(1, (last - first) / 400)}
            value={until ?? last}
            onChange={(e) => {
              setPlaying(false);
              setUntil(Number(e.target.value) >= last ? null : Number(e.target.value));
            }}
            aria-label="Your graph over time"
          />
          <span className="fine">
            {until === null
              ? "now"
              : new Date(until).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
            ·{" "}
            {data.nodes.filter((n) => until === null || n.created <= until).filter((n) => n.kind === "concept").length}{" "}
            concepts
          </span>
        </div>
      )}
      <section className="connections-inbox">
        <div className="row gap">
          <h2 className="sub-title">Connections the agent suggests</h2>
          <span className="spacer" />
          <button
            type="button"
            className="button"
            disabled={!!busy}
            onClick={async () => {
              setBusy(Date.now());
              setError(null);
              try {
                await learn.suggestConnections();
                reload();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy ? "Reading your vault…" : "Find connections in recent notes"}
          </button>
        </div>
        {busy && <Spinner label="The agent is reading your notes" since={busy} />}
        {error && <p className="form-error">{error}</p>}
        {pending.length === 0 ? (
          <p className="fine">
            None waiting. The agent reads your notes (with its own shell, inside your vault) and proposes links worth
            following; you accept or reject each one.
          </p>
        ) : (
          <ul className="suggestions">
            {pending.map((e) => (
              <li key={e.id}>
                <span>
                  <b>{label(e.from)}</b> → <b>{label(e.to)}</b>
                </span>
                <span className="fine">{e.why}</span>
                <span className="row gap">
                  <button
                    type="button"
                    className="button"
                    onClick={async () => {
                      await learn.decideConnection(e.id!, "accept");
                      reload();
                    }}
                  >
                    Link
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={async () => {
                      await learn.decideConnection(e.id!, "reject");
                      reload();
                    }}
                  >
                    Not related
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
