/* The margin's cards: an annotation (an answer with its conversation, a figure or an animation, a
 * highlight or comment with its colour), its menu (to your note, copy, the file, delete), and a figure
 * from the chapter's own figures. Each is shown whole; the margin places them (Margin.tsx). */
import { Copy, Ellipsis, FileText, Link2, Maximize2, Quote, SquarePlus, Trash2 } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { threadOf } from "../../../shared/thread.ts";
import { type Annotation, type Book, type Demo, learn } from "../api";
import { ChatInput, type ChatMessage, ChatThread } from "../components/Chat";
import { Spinner } from "../components/feedback";
import { Markdown } from "../components/Markdown";
import { useArrowKeys } from "../lib/a11y";
import { timeAgo } from "../lib/time";
import { ManimFix } from "../manim/ManimView";
import { SceneView } from "../scene/SceneView";

const KIND: Record<string, string> = {
  explain: "Explain",
  define: "Define",
  ask: "Ask",
  visualize: "Figure",
  resources: "Resources",
  highlight: "Highlight",
  comment: "Comment",
};
const COLORS = ["yellow", "green", "blue", "pink", "purple"];

/** Sends an annotation to the note you're writing: embedded with its answer, its passage, or a link. */
export type ToNote = (a: Annotation, mode: "embed" | "passage" | "reference") => void;

/* ---------------- an annotation ---------------- */

const GENERATED = ["explain", "define", "ask", "visualize", "resources"];

export const AnnotationCard = memo(function AnnotationCard({
  a,
  book,
  fig,
  focused,
  theme,
  onToNote,
  onOpen,
  toast,
}: {
  a: Annotation;
  book: Book;
  /** Its figure number, when it is a figure ("Fig 3.2"). */
  fig?: string;
  focused: boolean;
  theme: "light" | "dark";
  onToNote: ToNote;
  onOpen: () => void;
  toast: (t: string) => void;
}) {
  const [ask, setAsk] = useState("");
  // a follow-up being answered: shown in the conversation at once, until the answer lands in the file
  const [asking, setAsking] = useState<{ q: string; at: number } | null>(null);
  const [redrawing, setRedrawing] = useState(false);
  const [notes, setNotes] = useState("");
  const [comment, setComment] = useState(a.body);
  const label = a.kind === "visualize" ? fig || "Figure" : KIND[a.kind];
  const pending = a.status === "pending";
  const since = pending ? new Date(a.updated || a.created).getTime() : 0;
  const where = a.anchor.page !== undefined ? `p. ${a.anchor.page}` : "";
  const { answer, turns } = useMemo(() => threadOf(a.body), [a.body]);
  const messages: ChatMessage[] = useMemo(
    () => (asking ? [...turns, { role: "user", text: asking.q }] : turns),
    [turns, asking],
  );

  // an animation that hits an error when it plays is written again, told the error
  const fixAnimation = useCallback(
    (error: string) =>
      void learn
        .redraw(a.id, `When it played, the animation stopped with this error; fix it:\n${error}`)
        .catch((e) => toast((e as Error).message)),
    [a.id, toast],
  );
  const followUp = async (q: string) => {
    setAsk("");
    setAsking({ q, at: Date.now() });
    try {
      await learn.followUp(a.id, q);
    } catch (error) {
      setAsk(q);
      toast((error as Error).message);
    } finally {
      setAsking(null);
    }
  };

  return (
    <article
      className="mcard open"
      data-kind={a.kind}
      data-status={a.status}
      data-color={a.color}
      data-focused={focused || undefined}
      tabIndex={-1}
      aria-label={`${label}${where ? `, ${where}` : ""}`}
    >
      <header className="mcard-head">
        <span className="mcard-kind">{label}</span>
        <span className="spacer" />
        {a.kind === "visualize" && a.status === "ready" && (
          <button type="button" className="mcard-icon" aria-label="Open large" title="Open large" onClick={onOpen}>
            <Maximize2 aria-hidden="true" />
          </button>
        )}
        <CardMenu a={a} onToNote={onToNote} toast={toast} />
      </header>
      {a.request && a.kind !== "comment" && (
        <div className="mcard-thread">
          <div className="msg" data-role="user">
            <p>{a.request}</p>
          </div>
        </div>
      )}
      {a.kind === "highlight" || a.kind === "comment" ? (
        <div className="mcard-comment">
          <fieldset className="colors">
            <legend className="visually-hidden">Colour</legend>
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className="color-dot"
                data-color={c}
                aria-pressed={(a.color || "yellow") === c}
                aria-label={c}
                onClick={() => learn.updateAnnotation(a.id, { color: c })}
              />
            ))}
          </fieldset>
          <textarea
            rows={2}
            value={comment}
            aria-label="Your comment"
            placeholder="Add a comment…"
            onChange={(e) => setComment(e.target.value)}
            onBlur={() =>
              comment !== a.body &&
              learn.updateAnnotation(a.id, { body: comment, kind: comment.trim() ? "comment" : "highlight" })
            }
          />
        </div>
      ) : pending ? (
        <div className="mcard-body">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton short" />
          <Spinner
            label={
              a.props?.engine === "manim"
                ? "Writing the animation and checking it runs"
                : a.kind === "visualize"
                  ? "Drawing"
                  : a.kind === "resources"
                    ? "Searching"
                    : "Thinking"
            }
            since={since}
          />
        </div>
      ) : a.status === "failed" ? (
        <div className="mcard-body">
          <p className="form-error">{a.error}</p>
          <button
            type="button"
            className="button"
            onClick={() => (a.kind === "visualize" ? learn.redraw(a.id) : learn.retryAnnotation(a.id))}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="mcard-body">
          <ManimFix.Provider value={fixAnimation}>
            <Markdown text={answer} theme={theme} className="mcard-md" base={a.path} />
          </ManimFix.Provider>
        </div>
      )}
      {messages.length > 0 && (
        <div className="mcard-thread">
          <ChatThread messages={messages} theme={theme} busy={asking?.at} base={a.path} />
        </div>
      )}
      {GENERATED.includes(a.kind) && !pending && a.status !== "failed" && (
        <>
          <footer className="mcard-foot">
            <span className="fine">
              {a.model
                ? `${a.model.name || a.model.provider}${a.model.ms ? ` · ${Math.round(a.model.ms / 1000)} s` : ""} · `
                : ""}
              {timeAgo(a.created)}
            </span>
            <span className="spacer" />
            {a.kind === "visualize" && (
              <button type="button" className="link" aria-expanded={redrawing} onClick={() => setRedrawing((r) => !r)}>
                Redraw…
              </button>
            )}
          </footer>
          {redrawing ? (
            <ChatInput
              className="mcard-ask"
              value={notes}
              onChange={setNotes}
              label="What should change in the figure"
              placeholder="What should change? (redraws it)"
              onSend={async (text) => {
                try {
                  await learn.redraw(a.id, text);
                  setNotes("");
                  setRedrawing(false);
                } catch (error) {
                  toast((error as Error).message);
                }
              }}
            />
          ) : (
            <ChatInput
              className="mcard-ask"
              value={ask}
              onChange={setAsk}
              label="A follow-up question"
              placeholder="Ask a follow-up…"
              busy={!!asking}
              onSend={followUp}
            />
          )}
        </>
      )}
      <span className="visually-hidden">{book.title}</span>
    </article>
  );
});

/** A card's menu: send it to your note, copy it, show its file, delete it. */
function CardMenu({ a, onToNote, toast }: { a: Annotation; onToNote: ToNote; toast: (t: string) => void }) {
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  useArrowKeys(menuBox, { selector: '[role="menuitem"]', orientation: "vertical" });
  useEffect(() => {
    if (menu) menuBox.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) =>
      !menuBox.current?.contains(event.target as Node) &&
      !menuButton.current?.contains(event.target as Node) &&
      setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const item = (key: string, icon: ReactNode, text: string, run: () => void, danger = false) => (
    <button
      key={key}
      type="button"
      role="menuitem"
      className={danger ? "danger" : undefined}
      onClick={() => {
        setMenu(false);
        run();
      }}
    >
      {icon}
      {text}
    </button>
  );
  return (
    <div className="menu-host">
      <button
        type="button"
        className="mcard-icon"
        aria-label="More"
        title="More"
        aria-haspopup="menu"
        aria-expanded={menu}
        ref={menuButton}
        onClick={() => setMenu((m) => !m)}
      >
        <Ellipsis aria-hidden="true" />
      </button>
      {menu && (
        <div
          className="menu"
          role="menu"
          aria-label="More"
          ref={menuBox}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation(); // closes the menu, not the card
            setMenu(false);
            menuButton.current?.focus();
          }}
        >
          {item(
            "embed",
            <SquarePlus aria-hidden="true" />,
            `Add to note${a.kind === "highlight" ? "" : " (with the answer)"}`,
            () => onToNote(a, "embed"),
          )}
          {item("passage", <Quote aria-hidden="true" />, "Add the passage to note", () => onToNote(a, "passage"))}
          {item("reference", <Link2 aria-hidden="true" />, "Add a reference to note", () => onToNote(a, "reference"))}
          <div className="menu-sep" />
          {item("copy", <Copy aria-hidden="true" />, "Copy", () => {
            void navigator.clipboard?.writeText(`${a.anchor.quote}\n\n${a.body}`.trim()).then(() => toast("Copied."));
          })}
          <a
            role="menuitem"
            href={`#/open?target=${encodeURIComponent(a.path.replace(/\.md$/, ""))}`}
            onClick={() => setMenu(false)}
            title={a.path}
          >
            <FileText aria-hidden="true" />
            Show the file
          </a>
          {item("delete", <Trash2 aria-hidden="true" />, "Delete", () => void learn.deleteAnnotation(a.id), true)}
        </div>
      )}
    </div>
  );
}

/* ---------------- a figure from the chapter's figures ---------------- */

export const DemoCard = memo(function DemoCard({
  demo,
  fig,
  theme,
  onOpen,
}: {
  demo: Demo;
  fig: string;
  theme: "light" | "dark";
  onOpen: () => void;
}) {
  const ready = demo.status === "ready";
  return (
    <article
      className="mcard open"
      data-kind="figure"
      data-status={ready ? "ready" : demo.status === "failed" ? "failed" : "pending"}
      tabIndex={-1}
      aria-label={`${fig}: ${demo.brief.title}`}
    >
      <header className="mcard-head">
        <span className="mcard-kind">{fig}</span>
        <span className="mcard-title">{demo.brief.eyebrow || demo.brief.title}</span>
        <span className="spacer" />
        <button type="button" className="mcard-icon" aria-label="Open large" title="Open large" onClick={onOpen}>
          <Maximize2 aria-hidden="true" />
        </button>
      </header>
      {demo.type === "scene" && demo.scene && ready ? (
        <SceneView spec={demo.scene} theme={theme} compact predict={false} />
      ) : (
        <p className="fine">
          {ready
            ? "A hand-built demo: open it large to play with it."
            : demo.status === "failed"
              ? `Couldn’t finish: ${demo.error}`
              : demo.activity || "Drawing…"}
        </p>
      )}
    </article>
  );
});
