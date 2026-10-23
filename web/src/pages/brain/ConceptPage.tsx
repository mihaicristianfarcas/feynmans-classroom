/* A concept's page (#/brain/concept/<id>): what it is, how well you know it, what it builds on and
 * leads to, its cards, notes and sources, and tools to explain it back, practise it, draft cards,
 * connect it or draw a figure of it. */
import { ArrowLeft, Shapes } from "lucide-react";
import { useState } from "react";
import { humanInterval } from "../../../../shared/fsrs.ts";
import { type Concept, type ConceptBrief, docs, learn, type Note } from "../../api";
import { bookLink, go } from "../../app/navigation";
import { Loading, Mastery } from "../../components/feedback";
import { levelOf } from "../../components/GraphView";
import { Markdown } from "../../components/Markdown";
import { PracticeSession } from "../../components/Practice";
import { CardDrafter, Connector, ExplainBack, FigureMaker } from "../../components/tools";
import { useLoad } from "../../lib/useLoad";
import { under, useVaultEvents } from "../../lib/useVaultEvents";

const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  highlight: "Highlight",
  explanation: "Explanation",
  connection: "Connection",
  answer: "Answer",
  summary: "Summary",
};

/** Concepts as chips that open their pages, each tinted by how well it's known. */
function ConceptChips({ list }: { list: ConceptBrief[] }) {
  return (
    <div className="chips">
      {list.map((r) => (
        <a key={r.id} className="chip concept-chip" href={`#/brain/concept/${r.id}`} data-level={levelOf(r.mastery)}>
          {r.title}
        </a>
      ))}
    </div>
  );
}

export function ConceptPage({ id, theme }: { id: string; theme: "light" | "dark" }) {
  const { data: c, error, reload } = useLoad(() => learn.concept(id), [id], `concept:${id}`);
  useVaultEvents(reload, under("notes/", "concepts/", "cards/"));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ summary: "", body: "" });
  const [tool, setTool] = useState<"explain" | "practice" | "cards" | "connect" | "figure" | null>(
    new URLSearchParams(location.hash.split("?")[1] || "").get("explain") ? "explain" : null,
  );
  if (error) return <div className="center-note">{error}</div>;
  if (!c) return <Loading label="Opening the concept" />;
  const text = `${c.title}: ${c.summary}\n\n${c.body}`;
  const source = c.sources[0];
  return (
    <div className="concept-page rise">
      <a className="back-link" href={`#/brain?focus=concept:${encodeURIComponent(c.id)}`}>
        <ArrowLeft aria-hidden="true" />
        Brain
      </a>
      <header className="page-head">
        <h1 className="page-title">{c.title}</h1>
        <div className="page-meta">
          <span>Concept</span>
          <Mastery value={c.mastery} wide />
        </div>
      </header>
      <div className="concept-actions">
        <button type="button" className="button primary" aria-haspopup="dialog" onClick={() => setTool("explain")}>
          Explain it back
        </button>
        <button type="button" className="button subtle" aria-haspopup="dialog" onClick={() => setTool("practice")}>
          Practice it
        </button>
        <button type="button" className="button subtle" aria-haspopup="dialog" onClick={() => setTool("cards")}>
          Make cards
        </button>
        <button type="button" className="button subtle" aria-haspopup="dialog" onClick={() => setTool("figure")}>
          <Shapes aria-hidden="true" />
          Draw it
        </button>
        <button type="button" className="button subtle" aria-haspopup="dialog" onClick={() => setTool("connect")}>
          Connect
        </button>
        <a
          className="button subtle"
          href={`#/ask?q=${encodeURIComponent(`Explain ${c.title} using everything in my library`)}`}
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
                await docs.update<Concept>(c.id, draft);
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
        // biome-ignore lint/a11y/noStaticElementInteractions: double-click is a shortcut; the Edit button below does the same
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
          {c.buildsOn.length > 0 && (
            <>
              <h2 className="section-title">Builds on</h2>
              <ConceptChips list={c.buildsOn} />
            </>
          )}
          {c.leadsTo.length > 0 && (
            <>
              <h2 className="section-title">Leads to</h2>
              <ConceptChips list={c.leadsTo} />
            </>
          )}
          {(c.related.length > 0 || c.backlinks.length > 0 || !(c.buildsOn.length || c.leadsTo.length)) && (
            <>
              <h2 className="section-title">Connected to</h2>
              {c.related.length || c.backlinks.length ? (
                <ConceptChips
                  list={[...c.related, ...c.backlinks.filter((b) => !c.related.some((r) => r.id === b.id))]}
                />
              ) : (
                <p className="fine">No links yet.</p>
              )}
            </>
          )}
        </section>
        <section>
          <h2 className="section-title">Cards ({c.cards.length})</h2>
          <ul className="plain cards-list">
            {c.cards.map((k) => (
              <li key={k.id}>
                <Markdown text={k.front} theme={theme} />
                <span className="fine">
                  {!k.state
                    ? "new"
                    : k.state.due <= Date.now()
                      ? "due now"
                      : `due in ${humanInterval(k.state.due - Date.now())}`}
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
          if (!confirm(`Delete the concept "${c.title}"? Cards and notes stay.`)) return;
          await docs.remove(c.id);
          go("#/brain");
        }}
      >
        Delete concept
      </button>
      {tool === "explain" && (
        <ExplainBack
          concept={c.title}
          passage={c.summary}
          source={source}
          theme={theme}
          onClose={() => {
            setTool(null);
            reload();
          }}
        />
      )}
      {tool === "practice" && (
        <PracticeSession
          concept={c.title}
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
            await docs.update<Concept>(c.id, { body: `${c.body}\n\n![[figure:${f.id}]]`.trim() });
            reload();
          }}
        />
      )}
    </div>
  );
}
