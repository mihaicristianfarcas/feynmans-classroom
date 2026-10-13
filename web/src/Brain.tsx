import { ArrowLeft, Pause, Play, Shapes } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { bookLink, type Concept, go, learn, type Note, openLink } from "./api";
import { GraphView } from "./GraphView";
import { Markdown } from "./Markdown";
import { Mastery, Spinner, timeAgo, useLoad } from "./Shell";
import { SceneView } from "./scene/SceneView";
import { CardDrafter, Connector, ExplainBack, FigureMaker } from "./tools";
import { useIndicator } from "./ui";

type Tab = "graph" | "concepts" | "notes" | "figures";

/** #/brain[/tab] · #/brain/concept/:id · #/brain/note/:id · #/brain/new · #/brain/find/:target */
export function Brain({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const path = hash.split("?")[0].replace(/^#\/brain\/?/, "");
  const [section, id] = [path.split("/")[0], decodeURIComponent(path.split("/").slice(1).join("/"))];
  if (section === "concept" && id) return <ConceptPage key={id} id={id} theme={theme} />;
  if (section === "note" && id) return <Redirect to={`#/notes/${id}`} />;
  if (section === "new") return <Redirect to="#/notes" />;
  if (section === "find" && id) return <Find target={id} />;
  return (
    <BrainHome
      tab={(["graph", "concepts", "notes", "figures"].includes(section) ? section : "graph") as Tab}
      theme={theme}
    />
  );
}

/** Old [[link]] routes: resolve the link the same way notes do. */
function Find({ target }: { target: string }) {
  useEffect(() => {
    openLink(target);
  }, [target]);
  return <div className="center-note">Opening “{target}”…</div>;
}

function BrainHome({ tab, theme }: { tab: Tab; theme: "light" | "dark" }) {
  const [filter, setFilter] = useState("");
  const tabs = useIndicator<HTMLElement>(tab);
  return (
    <div className="brain rise">
      <header className="page-head row">
        <h1 className="page-title">Your brain</h1>
        <span className="spacer" />
        <input
          className="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter"
        />
        <a className="button primary" href="#/notes">
          Notes
        </a>
      </header>
      <nav className="tabs" aria-label="Brain sections" ref={tabs}>
        {(["graph", "concepts", "notes", "figures"] as Tab[]).map((t) => (
          <a key={t} href={`#/brain/${t}`} className="tab" aria-current={tab === t ? "page" : undefined}>
            {t[0].toUpperCase() + t.slice(1)}
          </a>
        ))}
      </nav>
      {tab === "graph" && <GraphTab filter={filter} />}
      {tab === "concepts" && <ConceptsTab filter={filter} />}
      {tab === "notes" && <NotesTab filter={filter} theme={theme} />}
      {tab === "figures" && <FiguresTab filter={filter} theme={theme} />}
    </div>
  );
}

function GraphTab({ filter }: { filter: string }) {
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
          <h3 className="sub-title">Connections the agent suggests</h3>
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

function ConceptsTab({ filter }: { filter: string }) {
  const { data } = useLoad(() => learn.concepts());
  const [name, setName] = useState("");
  const list = useMemo(
    () => (data || []).filter((c) => !filter || `${c.name} ${c.summary}`.toLowerCase().includes(filter.toLowerCase())),
    [data, filter],
  );
  if (!data) return <Spinner label="Loading concepts" />;
  return (
    <div>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const c = await learn.createConcept({ name: name.trim() });
          go(`#/brain/concept/${c.id}`);
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a concept…" />
        <button className="button" type="submit">
          Add
        </button>
      </form>
      <table className="table">
        <thead>
          <tr>
            <th>Concept</th>
            <th>Recall</th>
            <th>Cards</th>
            <th>From</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c: Concept) => (
            <tr key={c.id} onClick={() => go(`#/brain/concept/${c.id}`)}>
              <td>
                <b>{c.name}</b>
                <div className="fine">{c.summary}</div>
              </td>
              <td>
                <Mastery value={c.mastery} />
              </td>
              <td className="num">{c.cards || ""}</td>
              <td className="fine">
                {c.sources.length ? `${c.sources.length} passage${c.sources.length === 1 ? "" : "s"}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <p className="fine">No concepts yet.</p>}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  highlight: "Highlight",
  explanation: "Explanation",
  connection: "Connection",
  answer: "Answer",
  summary: "Summary",
};

function NotesTab({ filter, theme }: { filter: string; theme: "light" | "dark" }) {
  const [type, setType] = useState("");
  const { data } = useLoad(() => learn.notes(type ? { type } : {}), [type]);
  const list = (data || []).filter(
    (n) => !filter || `${n.title} ${n.body}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <div>
      <div className="chips">
        {["", "note", "highlight", "explanation", "connection", "answer"].map((t) => (
          <button type="button" key={t} className="chip" aria-pressed={type === t} onClick={() => setType(t)}>
            {t ? TYPE_LABEL[t] : "All"}
          </button>
        ))}
      </div>
      {!data ? (
        <Spinner label="Loading notes" />
      ) : (
        <div className="note-grid">
          {list.map((n) => (
            <a key={n.id} className="note-card" href={`#/notes/${n.id}`}>
              <span className="eyebrow">
                {TYPE_LABEL[n.type]}
                {typeof n.score === "number" ? ` · ${n.score}/100` : ""}
              </span>
              <span className="note-title">{n.title}</span>
              <Markdown text={n.body.slice(0, 280)} theme={theme} className="note-snippet" />
              <span className="fine">{timeAgo(n.updated)}</span>
            </a>
          ))}
          {!list.length && <p className="fine">No notes yet. Highlight a passage in a book, or write one.</p>}
        </div>
      )}
    </div>
  );
}

function FiguresTab({ filter, theme }: { filter: string; theme: "light" | "dark" }) {
  const { data, reload } = useLoad(() => learn.figures());
  const [making, setMaking] = useState(false);
  const [topic, setTopic] = useState("");
  const list = (data || []).filter((f) => !filter || f.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim()) setMaking(true);
        }}
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Draw a figure of any idea… (e.g. how a B-tree splits a full node)"
        />
        <button className="button" type="submit">
          <Shapes aria-hidden="true" />
          Draw
        </button>
      </form>
      {making && (
        <FigureMaker
          passage={topic}
          theme={theme}
          onClose={() => {
            setMaking(false);
            setTopic("");
            reload();
          }}
        />
      )}
      {!data ? (
        <Spinner label="Loading figures" />
      ) : (
        <div className="figure-grid">
          {list.map((f, i) => (
            <section key={f.id} className="figure-item">
              <SceneView spec={f.scene} theme={theme} fig={`Fig ${i + 1}`} predict={false} compact />
              <div className="row gap">
                <code className="fine">![[figure:{f.id}]]</code>
                <span className="spacer" />
                <button
                  type="button"
                  className="button danger"
                  onClick={async () => {
                    if (!confirm(`Delete "${f.title}"?`)) return;
                    await learn.deleteFigure(f.id);
                    reload();
                  }}
                >
                  Delete
                </button>
              </div>
            </section>
          ))}
          {!list.length && (
            <p className="fine">
              Figures you draw from notes and concepts collect here. Figures drawn in a book stay beside its text.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- a concept ---------------- */

function ConceptPage({ id, theme }: { id: string; theme: "light" | "dark" }) {
  const { data: c, error, reload } = useLoad(() => learn.concept(id), [id]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ summary: "", body: "" });
  const [tool, setTool] = useState<"explain" | "cards" | "connect" | "figure" | null>(
    new URLSearchParams(location.hash.split("?")[1] || "").get("explain") ? "explain" : null,
  );
  if (error) return <div className="center-note">{error}</div>;
  if (!c)
    return (
      <div className="center-note">
        <Spinner label="Opening" />
      </div>
    );
  const text = `${c.name}: ${c.summary}\n\n${c.body}`;
  const source = c.sources[0];
  return (
    <div className="concept-page rise">
      <a className="back-link" href="#/brain/concepts">
        <ArrowLeft aria-hidden="true" />
        Concepts
      </a>
      <header className="page-head">
        <span className="eyebrow">Concept</span>
        <h1 className="page-title">{c.name}</h1>
        <Mastery value={c.mastery} wide />
      </header>
      <div className="concept-actions">
        <button type="button" className="button primary" onClick={() => setTool("explain")}>
          Explain it back
        </button>
        <button type="button" className="button" onClick={() => setTool("cards")}>
          Make cards
        </button>
        <button type="button" className="button" onClick={() => setTool("figure")}>
          <Shapes aria-hidden="true" />
          Draw it
        </button>
        <button type="button" className="button" onClick={() => setTool("connect")}>
          Connect
        </button>
        <a
          className="button"
          href={`#/ask?q=${encodeURIComponent(`Explain ${c.name} using everything in my library`)}`}
        >
          Ask the library
        </a>
      </div>
      {editing ? (
        <div className="form">
          <label className="field">
            <span>Summary</span>
            <textarea
              rows={2}
              value={draft.summary}
              onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            />
          </label>
          <label className="field">
            <span>In depth (Markdown, [[links]], ![[figure:id]])</span>
            <textarea rows={10} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="button primary"
              onClick={async () => {
                await learn.updateConcept(c.id, draft);
                setEditing(false);
                reload();
              }}
            >
              Save
            </button>
            <button type="button" className="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <section
          className="concept-text"
          onDoubleClick={() => {
            setDraft({ summary: c.summary, body: c.body });
            setEditing(true);
          }}
        >
          <p className="lede small">{c.summary || <span className="muted">No summary yet.</span>}</p>
          {c.body && <Markdown text={c.body} theme={theme} />}
          <button
            type="button"
            className="link"
            onClick={() => {
              setDraft({ summary: c.summary, body: c.body });
              setEditing(true);
            }}
          >
            Edit
          </button>
        </section>
      )}
      <div className="concept-grid">
        <section>
          <h2 className="section-title">Where it comes from</h2>
          {c.sources.length ? (
            <ul className="plain">
              {c.sources.map((s, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                  key={i}
                >
                  <a href={bookLink(s)}>{s.title || "A book"}</a>
                  {s.quote && <blockquote className="quote">“{s.quote}”</blockquote>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">Not linked to a passage yet.</p>
          )}
          <h2 className="section-title">Connected to</h2>
          <div className="chips">
            {[...c.related, ...c.backlinks.filter((b) => !c.related.some((r) => r.id === b.id))].map((r) => (
              <a
                key={r.id}
                className="chip concept-chip"
                href={`#/brain/concept/${r.id}`}
                data-level={
                  r.mastery === null ? "none" : r.mastery >= 0.8 ? "strong" : r.mastery >= 0.55 ? "ok" : "weak"
                }
              >
                {r.name}
              </a>
            ))}
            {!c.related.length && !c.backlinks.length && <span className="fine">No links yet.</span>}
          </div>
        </section>
        <section>
          <h2 className="section-title">Cards ({c.cards.length})</h2>
          <ul className="plain cards-list">
            {c.cards.map((k) => (
              <li key={k.id}>
                <Markdown text={k.front} theme={theme} />
                <span className="fine">
                  {k.state
                    ? `due ${timeAgo(k.state.due).replace(" ago", "")}${k.state.due > Date.now() ? " from now" : ""}`
                    : "new"}
                </span>
              </li>
            ))}
          </ul>
          <h2 className="section-title">Notes ({c.notes.length})</h2>
          <ul className="plain">
            {c.notes.map((n: Note) => (
              <li key={n.id}>
                <a href={`#/notes/${n.id}`}>{n.title}</a> <span className="fine">{TYPE_LABEL[n.type]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <button
        type="button"
        className="button danger subtle"
        onClick={async () => {
          if (!confirm(`Delete the concept "${c.name}"? Cards and notes stay.`)) return;
          await learn.deleteConcept(c.id);
          go("#/brain/concepts");
        }}
      >
        Delete concept
      </button>
      {tool === "explain" && (
        <ExplainBack
          concept={c.name}
          passage={c.summary}
          source={source}
          theme={theme}
          onClose={() => {
            setTool(null);
            reload();
          }}
        />
      )}
      {tool === "cards" && (
        <CardDrafter
          passage={text}
          source={source}
          onClose={() => {
            setTool(null);
            reload();
          }}
        />
      )}
      {tool === "connect" && <Connector passage={text} source={source} theme={theme} onClose={() => setTool(null)} />}
      {tool === "figure" && (
        <FigureMaker
          passage={text}
          source={source}
          theme={theme}
          onClose={() => setTool(null)}
          onSaved={async (f) => {
            await learn.updateConcept(c.id, { body: `${c.body}\n\n![[figure:${f.id}]]`.trim() });
            reload();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- notes moved to #/notes ---------------- */

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    location.replace(to);
  }, [to]);
  return <div className="center-note">Opening…</div>;
}
