/* The sidebar of a note in a vault, as Obsidian's: what links here (backlinks, with the line
 * around each), where it's mentioned without a link (one click links it), what it links to (links to
 * nothing yet marked as such), the connections an agent suggests, its tags, and its outline (jump to
 * a heading). */
import { useState } from "react";
import { type VaultBacklink, type VaultNote, vaults } from "../api";
import { announce } from "../lib/a11y";
import { useLoad } from "../lib/useLoad";
import type { Panel } from "../lib/usePanel";
import { Connections } from "../notes/Connections";
import { linkRoute, noteRoute, openVaultLink, searchRoute } from "./routes";
import { linkMention } from "./text";

export function VaultSidebar({
  id,
  note,
  panel,
  reload,
}: {
  id: string;
  note: VaultNote;
  panel: Panel;
  reload: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const { data: connections, reload: reloadConnections } = useLoad(
    () => (note.kind === "note" ? vaults.connections(id, note.path) : Promise.resolve([])),
    [id, note.path],
  );
  const outgoing = (note.outgoing || []).filter(
    (o, i, all) => all.findIndex((x) => x.target === o.target && x.sub === o.sub) === i,
  );
  const link = async (m: VaultBacklink) => {
    setError(null);
    try {
      const other = await vaults.note(id, m.path);
      const text = other.text ?? "";
      const next = linkMention(text, m.line, [note.name, ...(note.aliases || [])], note.name);
      if (next === null) return setError("That mention changed; nothing to link.");
      await vaults.save(id, m.path, next, text);
      announce(`Linked the mention in ${m.title}`);
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <aside className="note-side" aria-label="Links" id={panel.id} ref={panel.ref} style={panel.style}>
      <section>
        <h2 className="side-title">
          Linked here <span className="count">{note.backlinks.length}</span>
        </h2>
        {note.backlinks.length === 0 ? (
          <p className="fine">Nothing links here yet.</p>
        ) : (
          <ul className="link-list">
            {note.backlinks.map((b, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
              >
                <a href={noteRoute(id, b.path)}>{b.title}</a>
                {b.embed && <span className="fine"> (embeds it)</span>}
                {b.context && <div className="context">{b.context}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {note.kind === "note" && (note.mentions?.length ?? 0) > 0 && (
        <section>
          <h2 className="side-title">
            Mentioned, not linked <span className="count">{note.mentions?.length}</span>
          </h2>
          <ul className="link-list">
            {note.mentions?.map((m, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
              >
                <a href={noteRoute(id, m.path)}>{m.title}</a>{" "}
                <button
                  type="button"
                  className="link"
                  title={`Turn the mention into [[${note.name}]]`}
                  onClick={() => link(m)}
                >
                  Link
                </button>
                <div className="context">{m.context}</div>
              </li>
            ))}
          </ul>
          {error && <p className="form-error">{error}</p>}
        </section>
      )}
      {note.kind === "note" && (
        <section>
          <h2 className="side-title">
            Links out <span className="count">{outgoing.length}</span>
          </h2>
          {outgoing.length === 0 ? (
            <p className="fine">No links in this note.</p>
          ) : (
            <ul className="link-list compact">
              {outgoing.map((o, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                  key={i}
                  data-missing={(!o.path && !o.app) || undefined}
                >
                  <a
                    href={linkRoute(id, o.target, { sub: o.sub, from: note.path, md: o.md })}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) return;
                      e.preventDefault();
                      void openVaultLink(id, o.target, { sub: o.sub, from: note.path, md: o.md });
                    }}
                  >
                    {o.target}
                    {o.sub ? ` › ${o.sub.replace(/^\^/, "")}` : ""}
                  </a>
                  {!o.path && (
                    <span className="fine">
                      {o.app
                        ? ` (${o.app.kind === "book" ? "a book" : `a ${o.app.kind}`} in the app)`
                        : " (not made yet)"}
                    </span>
                  )}
                  {o.embed && o.path && <span className="fine"> (embedded)</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {note.kind === "note" && (
        <Connections
          connections={connections || []}
          what="notes"
          decide={async (c, d) => {
            await vaults.decideConnection(id, c.id, d);
            reloadConnections();
            reload();
          }}
          suggest={async () => {
            const r = await vaults.suggestConnections(id, note.path);
            announce(r.suggested.length ? `${r.suggested.length} suggested` : "Nothing to suggest");
            reloadConnections();
            reload();
          }}
          open={(c) => void openVaultLink(id, c.to, { from: note.path })}
          href={(c) => linkRoute(id, c.to, { from: note.path })}
        />
      )}
      {(note.tags?.length ?? 0) > 0 && (
        <section>
          <h2 className="side-title">Tags</h2>
          <p className="vault-tag-list">
            {note.tags?.map((t) => (
              <a key={t} className="tag" href={searchRoute(id, `#${t}`)}>
                #{t}
              </a>
            ))}
          </p>
        </section>
      )}
      {(note.headings?.length ?? 0) > 0 && (
        <section>
          <h2 className="side-title">Outline</h2>
          <ul className="link-list compact vault-outline">
            {note.headings?.map((h, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
                style={{ paddingLeft: (h.level - 1) * 12 }}
              >
                <a href={noteRoute(id, note.path, h.text)}>{h.text}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
