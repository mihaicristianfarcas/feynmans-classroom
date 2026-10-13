/* A note's sidebar: what links here, what it links to, where it's mentioned without a link, and the
 * connections the agent suggests (accept, reject, or remove later). */
import { X } from "lucide-react";
import { useState } from "react";
import { learn, type NoteDetail, type SuggestedLink } from "../api";
import { openLink } from "../app/navigation";
import { Spinner } from "../components/feedback";

export function NoteSidebar({ note, reload }: { note: NoteDetail; reload: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggested = note.connections.filter((c) => c.status === "suggested");
  const accepted = note.connections.filter((c) => c.status === "accepted");
  const decide = async (c: SuggestedLink, d: "accept" | "reject" | "remove") => {
    await learn.decideConnection(c.id, d);
    reload();
  };
  return (
    <aside className="note-side" aria-label="Links">
      <section>
        <h2 className="side-title">
          Linked here <span className="count">{note.backlinks.length}</span>
        </h2>
        {note.backlinks.length === 0 ? (
          <p className="fine">Nothing links to this note yet.</p>
        ) : (
          <ul className="link-list">
            {note.backlinks.map((b, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
              >
                <a
                  href={
                    b.from.startsWith("note:")
                      ? `#/notes/${b.from.slice(5)}`
                      : b.from.startsWith("concept:")
                        ? `#/brain/concept/${b.from.slice(8)}`
                        : `#/open?target=${encodeURIComponent(b.path.replace(/\.md$/, ""))}`
                  }
                >
                  {b.title}
                </a>
                {b.kind === "ai" && (
                  <span className="ai-badge" title="A connection you accepted">
                    AI
                  </span>
                )}
                {b.context && <div className="context">{b.context}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {note.mentions.length > 0 && (
        <section>
          <h2 className="side-title">
            Mentioned, not linked <span className="count">{note.mentions.length}</span>
          </h2>
          <ul className="link-list">
            {note.mentions.map((m, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
              >
                <span>{m.title}</span>{" "}
                <button
                  type="button"
                  className="link"
                  title={`Turn the mention into [[${note.title}]]`}
                  onClick={async () => {
                    await fetch(`/api/notes/${note.id}/link-mention`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ path: m.path }),
                    });
                    reload();
                  }}
                >
                  Link
                </button>
                <div className="context">{m.context}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="side-title">
          Links out <span className="count">{note.outgoing.length}</span>
        </h2>
        <ul className="link-list compact">
          {note.outgoing.map((o, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
              key={i}
              data-missing={!o.to || undefined}
            >
              <a
                href={`#/open?target=${encodeURIComponent(o.target)}`}
                onClick={(e) => {
                  e.preventDefault();
                  openLink(o.target);
                }}
              >
                {o.title}
              </a>
              {!o.to && <span className="fine"> (new)</span>}
              {o.kind === "ai" && <span className="ai-badge">AI</span>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="side-title">Connections</h2>
        <p className="fine">
          An agent reads your vault and suggests notes and concepts this one should link to. You decide.
        </p>
        {suggested.map((c) => (
          <div key={c.id} className="suggestion">
            <div>
              <b>[[{c.to}]]</b>
            </div>
            <div className="context">{c.why}</div>
            <div className="row gap">
              <button type="button" className="button" onClick={() => decide(c, "accept")}>
                Link it
              </button>
              <button type="button" className="link" onClick={() => decide(c, "reject")}>
                Not related
              </button>
            </div>
          </div>
        ))}
        {accepted.length > 0 && (
          <ul className="link-list compact">
            {accepted.map((c) => (
              <li key={c.id}>
                <a
                  href={`#/open?target=${encodeURIComponent(c.to)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    openLink(c.to);
                  }}
                >
                  {c.to}
                </a>
                <span className="ai-badge" title={c.why}>
                  AI
                </span>
                <button
                  type="button"
                  className="link danger"
                  title="Remove this link"
                  aria-label="Remove this link"
                  onClick={() => decide(c, "remove")}
                >
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="button"
          disabled={!!busy}
          onClick={async () => {
            setBusy(Date.now());
            setError(null);
            try {
              await learn.suggestConnections(note.path);
              reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy ? "Reading your vault…" : "Suggest connections"}
        </button>
        {busy && <Spinner label="The agent is reading your notes" since={busy} />}
        {error && <p className="form-error">{error}</p>}
      </section>
    </aside>
  );
}
