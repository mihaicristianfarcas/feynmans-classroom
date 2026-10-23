/* The Brain's graph, filling the page: a field at the top to find an item (⌘K goes to it here; pressed
 * again, the search of everything opens), the graph, and a card at the left for whatever you pick (Escape
 * closes it and gives focus back to the item; its edge resizes it), with the item moved to the middle of
 * the graph left in view (above the card, on a phone, where it's a sheet). In the graph's corner: the
 * legend (a card like it at the right, saying what the marks mean), the links the agent suggests (with
 * how many wait), a replay of how the graph grew, and zoom. */
import { Info, Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { learn } from "../../api";
import { Loading } from "../../components/feedback";
import { GraphView } from "../../components/GraphView";
import { focusToggle, PanelEdge } from "../../components/Panel";
import { useLoad } from "../../lib/useLoad";
import { usePanel } from "../../lib/usePanel";
import { under, useVaultEvents } from "../../lib/useVaultEvents";
import { Legend } from "./Legend";
import { CARD_PANEL, NodeCard, SuggestionsCard } from "./NodeCard";

/** The card's gap from the edge, as in .node-card: the graph keeps clear of it and the card. */
const CARD_GAP = 12;
const LEAVE_MS = 150;
const FIND_KEYS = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K";

type Card = { node: string } | { suggestions: true };

/** Whether the screen is narrow (the card becomes a sheet along the bottom). */
function useNarrow() {
  const query = "(max-width: 760px)";
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const on = () => setNarrow(list.matches);
    list.addEventListener("change", on);
    return () => list.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function BrainGraph({ theme }: { theme: "light" | "dark" }) {
  const { data, reload } = useLoad(() => learn.graph(), [], "graph");
  // notes and concepts made or linked elsewhere (the agent, another editor) join the graph as they land
  useVaultEvents(reload, under("notes/", "concepts/", "brain/connections"));
  const narrow = useNarrow();
  const legend = usePanel("brain-legend", { initial: 300, min: 240, max: 440, closed: true });
  const cardSize = usePanel(CARD_PANEL, { initial: 380, min: 300, max: 640 });
  const { expand: expandCard } = cardSize;
  // #/brain?focus=<node id> opens with that item picked (a concept's page links back this way)
  const [card, setCard] = useState<Card | null>(() => {
    const focus = new URLSearchParams(location.hash.split("?")[1] || "").get("focus");
    return focus ? { node: focus } : null;
  });
  // a card on its way out stays drawn for its exit
  const [leaving, setLeaving] = useState<Card | null>(null);
  const byKeyboard = useRef(false);
  const [find, setFind] = useState("");
  // ⌘K finds in the graph; in the field already (or over a dialog), it's the app's search again
  const findField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "k") return;
      const input = findField.current;
      if (!input || document.activeElement === input || document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      e.stopPropagation();
      input.focus();
      input.select();
    };
    // before the palette's own listener, which it keeps from hearing this press
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const selected = card && "node" in card ? card.node : null;

  // the legend, on its way out, keeps the width it had for its exit
  const [legendLeaving, setLegendLeaving] = useState(0);
  const closeLegend = () => {
    if (!legend.open) return;
    const hadFocus = !!document.activeElement?.closest(".legend-card");
    setLegendLeaving(legend.width);
    legend.setWidth(0);
    setTimeout(() => setLegendLeaving(0), LEAVE_MS);
    if (hadFocus) focusToggle(legend);
  };

  const open = (next: Card, keyboard: boolean) => {
    byKeyboard.current = keyboard;
    setLeaving(null);
    setCard(next);
    // a card closed by dragging its edge away opens again at its default width
    expandCard();
    // on a phone both are sheets along the bottom: one at a time
    if (narrow) closeLegend();
  };
  const openLegend = () => {
    setLegendLeaving(0);
    legend.expand();
    if (narrow) close();
  };
  const close = () => {
    if (!card) return;
    const hadFocus = !!document.activeElement?.closest(".node-card, .node-card-edge");
    setLeaving(card);
    setCard(null);
    setTimeout(() => setLeaving(null), LEAVE_MS);
    // focus goes back to the item the card was about (or stays in the graph)
    if (hadFocus && selected)
      requestAnimationFrame(() =>
        document.querySelector<SVGElement>(`[data-node="${CSS.escape(selected)}"]`)?.focus({ preventScroll: true }),
      );
  };

  // on a phone the card (or the legend) is a sheet along the bottom: how much of the graph it covers
  const [sheet, setSheet] = useState(0);
  const sheetOf = !narrow ? null : card ? ("node" in card ? "item" : "suggestions") : legend.open ? "legend" : null;
  useLayoutEffect(() => {
    // each kind of card is its own element: found again when the kind changes
    const el = sheetOf
      ? document.querySelector<HTMLElement>(".brain-stage > :is(.node-card, .legend-card):not([data-leaving])")
      : null;
    if (!el) {
      setSheet(0);
      return;
    }
    // its height, and the gap under it (as in .node-card)
    const measure = () => setSheet(el.offsetHeight + 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheetOf]);

  // the replay: how the graph grew, from its first item to now
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
          return last;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [playing, first, last]);
  // at the end it rests on the whole graph a moment (the last items fade in), then the date goes
  useEffect(() => {
    if (playing || until === null || until < last) return;
    const timer = setTimeout(() => setUntil(null), 1500);
    return () => clearTimeout(timer);
  }, [playing, until, last]);

  if (!data)
    return (
      <div className="brain center-note">
        <h1 className="visually-hidden">Brain</h1>
        <Loading label="Drawing your graph" />
      </div>
    );
  if (!data.nodes.some((n) => n.kind !== "book"))
    return (
      <div className="brain center-note">
        <div className="empty-state rise">
          <h1 className="empty-title">Your graph is empty</h1>
          <p className="fine">
            It grows as you learn: concepts come from the chapters you map in the reader, the cards you make and the
            ideas you explain.
          </p>
          <a className="button" href="#/library">
            Open the library
          </a>
        </div>
      </div>
    );

  const pending = data.edges.filter((e) => e.kind === "suggested").length;
  const shown = card ?? leaving;
  const node = shown && "node" in shown ? data.nodes.find((n) => n.id === shown.node) : undefined;
  const findable = data.nodes.filter((n) => n.kind !== "annotation");
  const q = find.trim().toLowerCase();
  const hits = q ? findable.filter((n) => n.label.toLowerCase().includes(q)) : [];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape closes the legend from inside it, else the card (their buttons do the same)
    <div
      className="brain"
      ref={legend.ref}
      style={legend.style}
      data-card={(card && !narrow) || undefined}
      data-legend={(legend.open && !narrow) || undefined}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        if ((e.target as Element).closest?.(".legend-card")) {
          e.preventDefault();
          closeLegend();
        } else if (card) {
          e.preventDefault();
          close();
        }
      }}
    >
      <h1 className="visually-hidden">Brain</h1>
      <div className="brain-stage" ref={cardSize.ref} style={cardSize.style}>
        <form
          className="graph-find"
          onSubmit={(e) => {
            e.preventDefault();
            if (hits[0]) open({ node: hits[0].id }, true);
          }}
        >
          <div className="graph-find-field">
            <input
              ref={findField}
              type="search"
              className="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Find in your graph…"
              aria-label="Find in the graph"
              aria-describedby="graph-find-count"
              aria-keyshortcuts="Meta+K Control+K"
            />
            <span className="graph-find-key" aria-hidden="true">
              <kbd>{FIND_KEYS}</kbd>
            </span>
          </div>
          <span id="graph-find-count" className="visually-hidden" aria-live="polite">
            {q ? `${hits.length} found${hits.length ? ", Enter opens the first" : ""}` : ""}
          </span>
        </form>
        <GraphView
          data={data}
          highlight={find}
          until={until ?? undefined}
          selected={selected}
          inset={legend.open && !narrow ? legend.width + CARD_GAP : 0}
          insetLeft={card && !narrow ? cardSize.width + CARD_GAP : 0}
          insetBottom={sheet}
          onSelect={(n, keyboard) => (n ? open({ node: n.id }, keyboard) : close())}
          tools={
            <>
              <button
                type="button"
                className="icon-button"
                data-panel-toggle={legend.id}
                aria-label="Legend"
                aria-expanded={legend.open}
                aria-controls={legend.open ? legend.id : undefined}
                title={legend.open ? "Hide the legend" : "Legend: what the marks and lines mean"}
                onClick={() => (legend.open ? closeLegend() : openLegend())}
              >
                <Info aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={pending ? `Suggested links, ${pending} waiting` : "Suggested links"}
                aria-expanded={!!card && "suggestions" in card}
                title="Links the agent suggests"
                onClick={(e) => (card && "suggestions" in card ? close() : open({ suggestions: true }, e.detail === 0))}
              >
                <Sparkles aria-hidden="true" />
                {pending > 0 && (
                  <span className="tool-count" aria-hidden="true">
                    {pending}
                  </span>
                )}
              </button>
              {times.length > 1 && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={playing ? "Pause the replay" : "Replay how your graph grew"}
                  title={playing ? "Pause" : "Replay how your graph grew"}
                  onClick={() => {
                    // from the start, unless it was paused part way
                    if (!playing && (until === null || until >= last)) setUntil(first);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                </button>
              )}
              <span className="graph-tools-sep" aria-hidden="true" />
            </>
          }
        />
        {until !== null && (
          <p className="graph-when">
            {new Date(until).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · {data.nodes.filter((n) => n.created <= until && n.kind === "concept").length} concepts
          </p>
        )}
        {shown &&
          ("suggestions" in shown ? (
            <SuggestionsCard
              data={data}
              focus={byKeyboard.current}
              leaving={!card}
              onClose={close}
              onChanged={reload}
            />
          ) : (
            node && (
              <NodeCard
                node={node}
                data={data}
                theme={theme}
                focus={byKeyboard.current}
                leaving={!card}
                onPick={(id) => open({ node: id }, !!document.activeElement?.closest(".node-card"))}
                onClose={close}
                onChanged={reload}
              />
            )
          ))}
        {card && !narrow && (
          <PanelEdge panel={cardSize} side="left" label="card" className="node-card-edge" onClose={close} />
        )}
        {(legend.open || legendLeaving > 0) && (
          <Legend panel={legend} leaving={legend.open ? undefined : legendLeaving} onClose={closeLegend} />
        )}
        {!narrow && <PanelEdge panel={legend} side="right" label="legend" className="legend-card-edge" />}
      </div>
    </div>
  );
}
