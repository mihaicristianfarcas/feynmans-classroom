/* A note's sidebar: what links here, what it links to, where it's mentioned without a link, and the
 * connections the agent suggests (accept, reject, or remove later). */
import { docs, learn, type NoteDetail } from "../api";
import { openLink } from "../app/navigation";
import type { Panel } from "../lib/usePanel";
import { Connections } from "./Connections";

export function NoteSidebar({ note, reload, panel }: { note: NoteDetail; reload: () => void; panel: Panel }) {
  return (
    <aside className="note-side" aria-label="Links" id={panel.id} ref={panel.ref} style={panel.style}>
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
                    await docs.linkMention(note.id, m.path);
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
      <Connections
        connections={note.connections}
        decide={async (c, d) => {
          await learn.decideConnection(c.id, d);
          reload();
        }}
        suggest={async () => {
          await learn.suggestConnections(note.path);
          reload();
        }}
        open={(c) => openLink(c.to)}
        href={(c) => `#/open?target=${encodeURIComponent(c.to)}`}
      />
    </aside>
  );
}
