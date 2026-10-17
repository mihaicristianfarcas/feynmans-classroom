/* A note's Connections section: links an agent suggests,
 * each with its reason, to accept or reject; the ones accepted, to remove later; and the button that
 * asks for more. Where the suggestions come from and where a link opens are the caller's. */
import { X } from "lucide-react";
import { useState } from "react";
import type { SuggestedLink } from "../api";
import { Spinner } from "../components/feedback";

export function Connections({
  connections,
  decide,
  suggest,
  open,
  href,
  what = "notes and concepts",
}: {
  connections: SuggestedLink[];
  decide: (c: SuggestedLink, d: "accept" | "reject" | "remove") => Promise<unknown>;
  suggest: () => Promise<unknown>;
  /** Opens what a connection links to. */
  open: (c: SuggestedLink) => void;
  href: (c: SuggestedLink) => string;
  what?: string;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggested = connections.filter((c) => c.status === "suggested");
  const accepted = connections.filter((c) => c.status === "accepted");
  const act = async (run: () => Promise<unknown>) => {
    setError(null);
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section>
      <h2 className="side-title">Connections</h2>
      <p className="fine">An agent reads your vault and suggests {what} this one should link to. You decide.</p>
      {suggested.map((c) => (
        <div key={c.id} className="suggestion">
          <div>
            <b>[[{c.to}]]</b>
          </div>
          <div className="context">{c.why}</div>
          <div className="row gap">
            <button type="button" className="button" onClick={() => act(() => decide(c, "accept"))}>
              Link it
            </button>
            <button type="button" className="link" onClick={() => act(() => decide(c, "reject"))}>
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
                href={href(c)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  open(c);
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
                onClick={() => act(() => decide(c, "remove"))}
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
          await act(suggest);
          setBusy(null);
        }}
      >
        {busy ? "Reading your vault…" : "Suggest connections"}
      </button>
      {busy && <Spinner label="The agent is reading your notes" since={busy} />}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
