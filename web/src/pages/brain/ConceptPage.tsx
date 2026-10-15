/* A concept's page (#/brain/concept/<id>): what it is, how well you know it, its cards, notes and
 * sources, and tools to explain it back, draft cards, connect it or draw a figure of it. */
import { ArrowLeft, Shapes } from "lucide-react";
import { useState } from "react";
import { humanInterval } from "../../../../shared/fsrs.ts";
import { type Concept, docs, learn, type Note } from "../../api";
import { bookLink, go } from "../../app/navigation";
import { Mastery, Spinner } from "../../components/feedback";
import { Markdown } from "../../components/Markdown";
import { CardDrafter, Connector, ExplainBack, FigureMaker } from "../../components/tools";
import { useLoad } from "../../lib/useLoad";
import { under, useVaultEvents } from "../../lib/useVaultEvents";
import { noteRoute } from "../../vaults/routes";

const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  highlight: "Highlight",
  explanation: "Explanation",
  connection: "Connection",
  answer: "Answer",
  summary: "Summary",
};

export function ConceptPage({ id, theme }: { id: string; theme: "light" | "dark" }) {
  const { data: c, error, reload } = useLoad(() => learn.concept(id), [id]);
  useVaultEvents(reload, under("notes/", "concepts/", "cards/"));
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
  const text = `${c.title}: ${c.summary}\n\n${c.body}`;
  const source = c.sources[0];
  return (
    <div className="concept-page rise">
      <a className="back-link" href={`#/brain?focus=concept:${encodeURIComponent(c.id)}`}>
        <ArrowLeft aria-hidden="true" />
        Brain
      </a>
      <header className="page-head">
        <span className="eyebrow">Concept</span>
        <h1 className="page-title">{c.title}</h1>
        <Mastery value={c.mastery} wide />
      </header>
      <div className="concept-actions">
        <button type="button" className="button primary" aria-haspopup="dialog" onClick={() => setTool("explain")}>
          Explain it back
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
                {r.title}
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
                  {!k.state
                    ? "new"
                    : k.state.due <= Date.now()
                      ? "due now"
                      : `due in ${humanInterval(k.state.due - Date.now())}`}
                </span>
              </li>
            ))}
          </ul>
          <h2 className="section-title">Notes ({c.notes.length + c.vaultNotes.length})</h2>
          <ul className="plain">
            {c.notes.map((n: Note) => (
              <li key={n.id}>
                <a href={`#/notes/${n.id}`}>{n.title}</a> <span className="fine">{TYPE_LABEL[n.type]}</span>
              </li>
            ))}
            {c.vaultNotes.map((n) => (
              <li key={`${n.vault}:${n.path}`}>
                <a href={noteRoute(n.vault, n.path)}>{n.title}</a> <span className="fine">in {n.vaultName}</span>
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
