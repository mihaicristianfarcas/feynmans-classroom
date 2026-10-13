/* The Brain's graph, filling the page: a field to find an item, the graph, and a card at the side for
 * whatever you pick (Escape closes it and gives focus back to the item). In the graph's corner: the
 * links the agent suggests (with how many wait), a replay of how the graph grew, and zoom. */
import { Pause, Play, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { learn } from "../../api";
import { Spinner } from "../../components/feedback";
import { GraphView } from "../../components/GraphView";
import { useLoad } from "../../lib/useLoad";
import { NodeCard, SuggestionsCard } from "./NodeCard";

/** The card's width and its gap from the edge, as in .node-card: the graph keeps clear of both. */
const CARD_COVER = 380 + 12;
const LEAVE_MS = 150;

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
  const { data, reload } = useLoad(() => learn.graph());
  const narrow = useNarrow();
  // #/brain?focus=<node id> opens with that item picked (a concept's page links back this way)
  const [card, setCard] = useState<Card | null>(() => {
    const focus = new URLSearchParams(location.hash.split("?")[1] || "").get("focus");
    return focus ? { node: focus } : null;
  });
  // a card on its way out stays drawn for its exit
  const [leaving, setLeaving] = useState<Card | null>(null);
  const byKeyboard = useRef(false);
  const [find, setFind] = useState("");
  const selected = card && "node" in card ? card.node : null;

  const open = (next: Card, keyboard: boolean) => {
    byKeyboard.current = keyboard;
    setLeaving(null);
    setCard(next);
  };
  const close = () => {
    if (!card) return;
    const hadFocus = !!document.activeElement?.closest(".node-card");
    setLeaving(card);
    setCard(null);
    setTimeout(() => setLeaving(null), LEAVE_MS);
    // focus goes back to the item the card was about (or stays in the graph)
    if (hadFocus && selected)
      requestAnimationFrame(() =>
        document.querySelector<SVGElement>(`[data-node="${CSS.escape(selected)}"]`)?.focus({ preventScroll: true }),
      );
  };

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
          return null;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [playing, first, last]);

  if (!data)
    return (
      <div className="brain center-note">
        <h1 className="visually-hidden">Brain</h1>
        <Spinner label="Drawing your graph" />
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
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere on the page closes the card; the card's button does the same
    <div
      className="brain"
      data-card={(card && !narrow) || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && card && !e.defaultPrevented) {
          e.preventDefault();
          close();
        }
      }}
    >
      <h1 className="visually-hidden">Brain</h1>
      <form
        className="graph-find"
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) open({ node: hits[0].id }, true);
        }}
      >
        <input
          type="search"
          className="search"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find…"
          aria-label="Find in the graph"
          aria-describedby="graph-find-count"
        />
        <span id="graph-find-count" className="visually-hidden" aria-live="polite">
          {q ? `${hits.length} found${hits.length ? ", Enter opens the first" : ""}` : ""}
        </span>
      </form>
      <GraphView
        data={data}
        highlight={find}
        until={until ?? undefined}
        selected={selected}
        inset={card && !narrow ? CARD_COVER : 0}
        onSelect={(n, keyboard) => (n ? open({ node: n.id }, keyboard) : close())}
        tools={
          <>
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
                  if (!playing && until === null) setUntil(first);
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
          {new Date(until).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" })} ·{" "}
          {data.nodes.filter((n) => n.created <= until && n.kind === "concept").length} concepts
        </p>
      )}
      {shown &&
        ("suggestions" in shown ? (
          <SuggestionsCard data={data} focus={byKeyboard.current} leaving={!card} onClose={close} onChanged={reload} />
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
    </div>
  );
}
