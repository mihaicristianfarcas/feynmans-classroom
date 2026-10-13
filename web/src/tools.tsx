/* Study tools that open from a passage, a concept or a note: make cards, explain it back, connect
 * it to the world, draw a figure. Each one saves into the vault. */
import { Shapes, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Connection, type DraftCard, type ExplainFeedback, learn, type SavedFigure, type SourceRef } from "./api";
import { Markdown } from "./Markdown";
import { Spinner } from "./Shell";
import { SceneView } from "./scene/SceneView";

export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    (
      box.current?.querySelector<HTMLElement>(".modal-body textarea, .modal-body input:not([type=checkbox])") ||
      box.current?.querySelector<HTMLElement>("button")
    )?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // in a portal: a page's own transforms (its entrance animation) must not become the backdrop's frame
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-label={title} ref={box}>
        <header className="modal-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 className="modal-title">{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Passage({ text }: { text?: string }) {
  if (!text) return null;
  return <blockquote className="quote passage">{text.length > 420 ? `${text.slice(0, 420)}…` : text}</blockquote>;
}

/* ---------------- cards ---------------- */

export function CardDrafter({
  passage,
  source,
  deck,
  onClose,
}: {
  passage: string;
  source?: SourceRef;
  deck?: string;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<(DraftCard & { keep: boolean })[] | null>(null);
  const [concepts, setConcepts] = useState<{ name: string; summary: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const [started] = useState(Date.now());
  useEffect(() => {
    learn.draftCards({ passage, source }).then(
      (r) => {
        setDrafts(r.cards.map((c) => ({ ...c, keep: true })));
        setConcepts(r.concepts);
      },
      (e) => setError(e.message),
    );
  }, [passage, source]);
  const edit = (i: number, patch: Partial<DraftCard & { keep: boolean }>) =>
    setDrafts((list) => list!.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  return (
    <Modal title="Flashcards from this passage" eyebrow="Retrieval practice" onClose={onClose} wide>
      <Passage text={passage} />
      {error && <p className="form-error">{error}</p>}
      {!drafts && !error && <Spinner label="Writing cards" since={started} />}
      {saved > 0 ? (
        <div className="done-note">
          <p>
            Saved {saved} card{saved === 1 ? "" : "s"}. They'll come back in Review just before you'd forget them.
          </p>
          <button type="button" className="button primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        drafts && (
          <>
            <p className="fine">
              Keep the ones worth remembering, and edit them into your own words: it helps them stick.
            </p>
            <ul className="drafts">
              {drafts.map((d, i) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it changes
                  key={i}
                  className="draft"
                  data-off={!d.keep || undefined}
                >
                  <label className="check">
                    <input type="checkbox" checked={d.keep} onChange={(e) => edit(i, { keep: e.target.checked })} />
                  </label>
                  <div className="draft-body">
                    <textarea
                      rows={2}
                      value={d.front}
                      onChange={(e) => edit(i, { front: e.target.value })}
                      aria-label="Front"
                    />
                    <textarea
                      rows={2}
                      value={d.back}
                      onChange={(e) => edit(i, { back: e.target.value })}
                      aria-label="Back"
                    />
                    <span className="fine">
                      {d.kind === "cloze" ? "cloze · " : ""}
                      {d.concept}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <button
                type="button"
                className="button primary"
                disabled={saving || !drafts.some((d) => d.keep)}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const kept = drafts.filter((d) => d.keep);
                    await learn.saveDrafts({ drafts: kept, deck, source, concepts });
                    setSaved(kept.length);
                    window.dispatchEvent(new Event("classroom:reviewed"));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Save {drafts.filter((d) => d.keep).length} cards
              </button>
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )
      )}
    </Modal>
  );
}

/* ---------------- explain it back ---------------- */

export function ExplainBack({
  concept: initial,
  passage,
  source,
  onClose,
  theme,
}: {
  concept?: string;
  passage?: string;
  source?: SourceRef;
  onClose: () => void;
  theme: "light" | "dark";
}) {
  const [concept, setConcept] = useState(initial || "");
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<ExplainFeedback | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const submit = async () => {
    setBusy(Date.now());
    setError(null);
    try {
      setFeedback(await learn.explain({ concept, explanation: text, passage, source }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal
      title={concept ? `Explain “${concept}”` : "Explain it in your own words"}
      eyebrow="The Feynman technique"
      onClose={onClose}
      wide
    >
      {!feedback ? (
        <>
          <p className="fine">
            Explain it as if to a smart friend who has never heard of it: plain words, no jargon you can't unpack. Where
            you get stuck is exactly what you don't understand yet.
          </p>
          {!initial && (
            <label className="field">
              <span>What are you explaining?</span>
              <input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="e.g. replication lag" />
            </label>
          )}
          <Passage text={passage} />
          <textarea
            className="explain-box"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="In my own words…"
          />
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button
              type="button"
              className="button primary"
              disabled={!!busy || !concept.trim() || text.trim().split(/\s+/).length < 8}
              onClick={submit}
            >
              {busy ? <Spinner label="Reading your explanation" since={busy} /> : "Check my understanding"}
            </button>
          </div>
        </>
      ) : (
        <div className="feedback">
          <div className="feedback-score">
            <span className="tile-number">{feedback.score}</span>
            <span>{feedback.verdict}</span>
          </div>
          <FeedbackList title="What you got right" items={feedback.strengths} />
          <FeedbackList title="Gaps" items={feedback.gaps} />
          <FeedbackList title="Jargon to unpack" items={feedback.jargon} />
          <FeedbackList title="Misconceptions" items={feedback.misconceptions} />
          <div className="feedback-block">
            <span className="eyebrow">Push further</span>
            <p>{feedback.followUp}</p>
          </div>
          <div className="feedback-block">
            <span className="eyebrow">Said simply</span>
            <Markdown text={feedback.simpler} theme={theme} />
          </div>
          {feedback.quote && <blockquote className="quote">Reread: “{feedback.quote}”</blockquote>}
          <div className="form-actions">
            <button
              type="button"
              className="button primary"
              disabled={saved}
              onClick={async () => {
                await learn.saveExplanation({
                  concept,
                  explanation: text,
                  score: feedback.score,
                  feedback: [
                    feedback.verdict,
                    ...feedback.gaps.map((g) => `- ${g}`),
                    `Follow-up: ${feedback.followUp}`,
                  ].join("\n"),
                  source,
                });
                setSaved(true);
              }}
            >
              {saved ? "Saved to your brain" : "Save to my brain"}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => {
                setFeedback(null);
                setSaved(false);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="feedback-block">
      <span className="eyebrow">{title}</span>
      <ul>
        {items.map((x, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it changes
            key={i}
          >
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- connect ---------------- */

const CONNECT_LABEL: Record<string, string> = {
  today: "In the world today",
  "your-work": "In your work",
  across: "Across fields",
};

export function Connector({
  passage,
  source,
  onClose,
  theme,
}: {
  passage: string;
  source?: SourceRef;
  onClose: () => void;
  theme: "light" | "dark";
}) {
  const [items, setItems] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [started] = useState(Date.now());
  useEffect(() => {
    learn.connect({ passage, source }).then(setItems, (e) => setError(e.message));
  }, [passage, source]);
  return (
    <Modal title="How this connects" eyebrow="Elaboration · concrete examples" onClose={onClose} wide>
      <Passage text={passage} />
      {error && <p className="form-error">{error}</p>}
      {!items && !error && <Spinner label="Finding connections" since={started} />}
      {items?.map((c, i) => (
        <article
          // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it changes
          key={i}
          className="connection"
        >
          <span className="eyebrow">{CONNECT_LABEL[c.kind] || c.kind}</span>
          <h3 className="connection-title">{c.title}</h3>
          <Markdown text={c.body} theme={theme} />
          <button
            type="button"
            className="button"
            disabled={saved.has(i)}
            onClick={async () => {
              await learn.createNote({
                type: "connection",
                title: c.title,
                body: `${c.body}\n\n> ${passage.slice(0, 400)}`,
                concepts: c.concepts,
                source,
              });
              setSaved((s) => new Set(s).add(i));
            }}
          >
            {saved.has(i) ? "Saved" : "Save as a note"}
          </button>
        </article>
      ))}
    </Modal>
  );
}

/* ---------------- figures ---------------- */

export const KIND_CHOICES = [
  { id: "auto", label: "Best fit" },
  { id: "plot", label: "Graph" },
  { id: "sequence", label: "Timeline" },
  { id: "graph", label: "Network" },
  { id: "diagram", label: "Sketch" },
  { id: "object3d", label: "3D object" },
];

/** What to draw: an optional request in the reader's words, a kind, quick or careful. */
export function FigureRequest({
  onSubmit,
  busy,
  autoFocus = true,
  compact,
}: {
  onSubmit: (r: { request: string; kind: string; quality: "quick" | "careful" }) => void;
  busy?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [request, setRequest] = useState("");
  const [kind, setKind] = useState("auto");
  const [quality, setQuality] = useState<"quick" | "careful">("quick");
  return (
    <form
      className={`figure-request ${compact ? "compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ request, kind, quality });
      }}
    >
      <input
        autoFocus={autoFocus}
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        placeholder="What should it show? (optional: e.g. “what happens if a message is lost”)"
        aria-label="What should the figure show?"
      />
      <div className="chips" role="group" aria-label="Kind of figure">
        {KIND_CHOICES.map((k) => (
          <button key={k.id} type="button" className="chip" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="figure-request-row">
        <label className="check" title="Careful uses the stronger model: slower, more thorough">
          <input
            type="checkbox"
            checked={quality === "careful"}
            onChange={(e) => setQuality(e.target.checked ? "careful" : "quick")}
          />
          Careful
        </label>
        <button className="button primary" type="submit" disabled={busy}>
          <Shapes aria-hidden="true" />
          Draw it
        </button>
      </div>
    </form>
  );
}

export function FigureMaker({
  passage,
  source,
  onClose,
  theme,
  onSaved,
}: {
  passage: string;
  source?: SourceRef;
  onClose: () => void;
  theme: "light" | "dark";
  onSaved?: (f: SavedFigure) => void;
}) {
  const [figure, setFigure] = useState<SavedFigure | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Draw a figure" eyebrow="Dual coding" onClose={onClose} wide>
      <Passage text={passage} />
      {!figure && (
        <FigureRequest
          busy={!!busy}
          onSubmit={async ({ request, kind, quality }) => {
            setBusy(Date.now());
            setError(null);
            try {
              const f = await learn.makeFigure({ passage, request, kind, quality, source });
              setFigure(f);
              onSaved?.(f);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        />
      )}
      {busy && <Spinner label="Drawing" since={busy} />}
      {error && <p className="form-error">{error}</p>}
      {figure && (
        <>
          <SceneView spec={figure.scene} theme={theme} fig="Fig" />
          <p className="fine">
            Saved to your figures. Embed it in any note with <code>![[figure:{figure.id}]]</code>.
          </p>
        </>
      )}
    </Modal>
  );
}
