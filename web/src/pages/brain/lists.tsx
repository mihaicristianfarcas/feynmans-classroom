/* The Brain's list tabs, each narrowed by the page's filter: concepts (with a field to add one), notes
 * by type, and your figures (with a field to draw a new one). */
import { Shapes } from "lucide-react";
import { useMemo, useState } from "react";
import { type Concept, learn } from "../../api";
import { go } from "../../app/navigation";
import { Mastery, Spinner } from "../../components/feedback";
import { Markdown } from "../../components/Markdown";
import { FigureMaker } from "../../components/tools";
import { timeAgo } from "../../lib/time";
import { useLoad } from "../../lib/useLoad";
import { SceneView } from "../../scene/SceneView";

export function ConceptsTab({ filter }: { filter: string }) {
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

export const TYPE_LABEL: Record<string, string> = {
  note: "Note",
  highlight: "Highlight",
  explanation: "Explanation",
  connection: "Connection",
  answer: "Answer",
  summary: "Summary",
};

export function NotesTab({ filter, theme }: { filter: string; theme: "light" | "dark" }) {
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

export function FiguresTab({ filter, theme }: { filter: string; theme: "light" | "dark" }) {
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
