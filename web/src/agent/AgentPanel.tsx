/* The agent: one field for anything, from any page (⌘J, or the sparkle in the top bar). Type what you
 * want done or answered; Enter runs it on the quick model, ⌘Enter on the careful one. It knows where
 * you are (the note, the book and page, the selection), replies in a line or two, and what it changed
 * shows up at once, with Undo. Replying carries on the same conversation; New starts another. It opens
 * from the keyboard many times a day, so it appears without animation, like the ⌘K palette. */
import { ArrowUp, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type AgentContext, type AgentRun, learn } from "../api";
import { go, vaultLink } from "../app/navigation";
import { Spinner } from "../components/feedback";
import { Markdown, MarkdownWorldContext } from "../components/Markdown";
import { announce, useFocusTrap } from "../lib/a11y";
import { timeAgo } from "../lib/time";
import { noteRoute } from "../vaults/routes";
import { useVaultWorld } from "../vaults/world";
import { contextLabel, currentContext, withoutPlace } from "./context";
import { onFinished, showThread, threadOf, upsert, useAgent } from "./store";

const STATUS: Record<AgentRun["status"], string> = {
  running: "Working",
  review: "Waiting for your OK",
  merged: "Done",
  done: "Answered",
  discarded: "Discarded",
  failed: "Didn't work",
  undone: "Undone",
};

const EXAMPLES = [
  "Summarise this chapter into a note in a folder for this book",
  "Make a quiz on what I highlighted, with corrections",
  "Turn this note into exercises with hidden solutions",
  "What have I written about consensus?",
];

/** A conversation is picked up again when it's this recent (or still going); older ones start fresh. */
const FRESH_MS = 20 * 60 * 1000;
const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const AGENT_KEYS = mac ? "⌘J" : "Ctrl J";

export function AgentPanel({ theme }: { theme: "light" | "dark" }) {
  const { runs, thread } = useAgent();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [context, setContext] = useState<AgentContext | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<AgentRun | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const runsRef = useRef(runs);
  runsRef.current = runs;
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const openRef = useRef(open);
  openRef.current = open;
  useFocusTrap(box, open, { onEscape: () => setOpen(false), initial: "textarea" });

  const turns = thread ? runs.filter((r) => threadOf(r) === thread) : [];

  /** Sends a request: a follow-up in the conversation on show, unless `fresh`. */
  const send = async (task: string, tier: "fast" | "smart", ctx = context, fresh = false) => {
    if (!task.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const current = fresh ? null : threadRef.current;
      const after = current ? runsRef.current.find((r) => threadOf(r) === current) : undefined;
      const run = await learn.runAgent({ task: task.trim(), context: ctx || undefined, after: after?.id, tier });
      upsert(run);
      showThread(threadOf(run));
      setText("");
      announce(tier === "smart" ? "Working on it, carefully" : "Working on it");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  // ⌘J anywhere, and openAgent() from any page
  useEffect(() => {
    const show = (options: { text?: string; send?: boolean; thread?: string } = {}) => {
      const ctx = currentContext();
      setContext(ctx);
      setError(null);
      setNotice(null);
      if (options.thread !== undefined) showThread(options.thread);
      else {
        // a conversation from a while ago gives way to a fresh field
        const last = runsRef.current.find((r) => threadOf(r) === threadRef.current);
        if (!last || (last.status !== "running" && Date.now() - Date.parse(last.started) > FRESH_MS)) showThread(null);
      }
      if (options.text !== undefined) setText(options.text);
      setOpen(true);
      if (options.send && options.text?.trim()) {
        showThread(null);
        void sendRef.current(options.text, "fast", ctx, true);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape inside the panel is the focus trap's; this catches it when focus has wandered out
      if (e.key === "Escape" && openRef.current) {
        setOpen(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (openRef.current) setOpen(false);
        else show();
      }
    };
    const onOpen = (e: Event) => show((e as CustomEvent).detail || {});
    window.addEventListener("keydown", onKey);
    window.addEventListener("classroom:agent", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("classroom:agent", onOpen);
    };
  }, []);

  // a request that finishes: read out when the panel is open, else a notice at the bottom of the window
  useEffect(
    () =>
      onFinished((run) => {
        const said = `${STATUS[run.status]}: ${(run.answer || run.error || run.task).split("\n")[0].slice(0, 160)}`;
        // open: read out (the panel shows it, or Recent does); closed: a line at the bottom of the window
        if (openRef.current) announce(said);
        else setNotice(run);
      }),
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  // the field grows with what's typed, up to a few lines
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again whenever the text changes
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text, open]);

  const recent = threadsOf(runs).filter((t) => t.id !== thread);
  const where = contextLabel(context);
  const close = () => setOpen(false);

  return (
    <>
      {notice && !open && (
        <Notice run={notice} onShow={() => openAgentOn(threadOf(notice))} onClose={() => setNotice(null)} />
      )}
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: a click outside closes it; Escape does the same from the keyboard
        <div className="modal-back instant" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="agent-panel" role="dialog" aria-modal="true" aria-labelledby="agent-title" ref={box}>
            <h2 id="agent-title" className="visually-hidden">
              Agent
            </h2>
            <form
              className="agent-field"
              onSubmit={(e) => {
                e.preventDefault();
                send(text, "fast");
              }}
            >
              <Sparkles className="agent-mark" aria-hidden="true" />
              <textarea
                ref={field}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(text, e.metaKey || e.ctrlKey ? "smart" : "fast");
                  }
                }}
                placeholder={turns.length ? "Reply, or ask for a change…" : "Ask or tell the agent anything…"}
                aria-label={turns.length ? "Reply to the agent" : "Ask or tell the agent"}
                aria-describedby="agent-keys"
                // read-only, not disabled, while sending: focus stays in the field for the next request
                readOnly={sending}
                aria-busy={sending}
              />
              <button
                className="icon-button agent-send"
                type="submit"
                disabled={sending || !text.trim()}
                aria-label="Send (quick model)"
                title="Send: Enter for the quick model, ⌘Enter for the careful one"
              >
                <ArrowUp aria-hidden="true" />
              </button>
            </form>
            <div className="agent-bar">
              {where ? (
                <span className="agent-where">
                  Knows {where}
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => setContext(withoutPlace(context))}
                    aria-label="Leave out where I am"
                    title="Leave out where I am"
                  >
                    <X aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <span className="agent-where">Works on your whole vault</span>
              )}
              <span className="spacer" />
              {turns.length > 0 && (
                <button type="button" className="button subtle small" onClick={() => showThread(null)}>
                  <Plus aria-hidden="true" /> New
                </button>
              )}
              <span className="fine" id="agent-keys">
                <kbd>↵</kbd> quick · <kbd>{mac ? "⌘" : "Ctrl"}</kbd>
                <kbd>↵</kbd> careful
              </span>
            </div>
            {error && (
              <p className="form-error agent-error" role="alert">
                {error}
              </p>
            )}
            <div className="agent-body">
              {turns.length > 0 ? (
                <ol className="agent-turns" aria-label="This conversation, newest first">
                  {turns.map((run) => (
                    <li key={run.id}>
                      <Turn run={run} theme={theme} close={close} retry={() => send(run.task, run.tier || "fast")} />
                    </li>
                  ))}
                </ol>
              ) : recent.length > 0 ? (
                <section aria-labelledby="agent-recent">
                  <h3 className="agent-sub" id="agent-recent">
                    Recent
                  </h3>
                  <ul className="agent-recent">
                    {recent.slice(0, 6).map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => showThread(t.id)}>
                          <span className="agent-recent-task">{t.task}</span>
                          <span className="fine" data-status={t.status}>
                            {STATUS[t.status]} · {timeAgo(t.started)}
                            {t.turns > 1 ? ` · ${t.turns} turns` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <div className="starters">
                  {EXAMPLES.map((x) => (
                    <button key={x} type="button" className="chip" onClick={() => setText(x)}>
                      {x}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Opens the panel on a conversation. */
const openAgentOn = (thread: string) =>
  window.dispatchEvent(new CustomEvent("classroom:agent", { detail: { thread } }));

/** Each conversation once, by its newest request: what was asked first, how it ended, how many turns. */
function threadsOf(runs: AgentRun[]) {
  const out = new Map<
    string,
    { id: string; task: string; status: AgentRun["status"]; started: string; turns: number }
  >();
  for (const run of runs) {
    const id = threadOf(run);
    const known = out.get(id);
    if (!known) out.set(id, { id, task: run.task, status: run.status, started: run.started, turns: 1 });
    else {
      known.turns++;
      known.task = run.task; // runs are newest first: the last one seen is the first request
    }
  }
  return [...out.values()];
}

/** One request and what came of it. */
function Turn({
  run,
  theme,
  close,
  retry,
}: {
  run: AgentRun;
  theme: "light" | "dark";
  close: () => void;
  retry: () => void;
}) {
  const [diff, setDiff] = useState<string | null>(null);
  // in a vault, the [[links]] of its reply are to that vault's notes
  const world = useVaultWorld(run.vault || "", "");
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "approve" | "discard" | "undo" | "keep") => {
    setError(null);
    try {
      upsert(await learn.agentAction(run.id, action));
      announce(
        action === "undo"
          ? "Undone"
          : action === "keep"
            ? "Kept as a note"
            : action === "approve"
              ? "Applied"
              : "Discarded",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const openLink = run.open ? linkOf(run, run.open) : null;
  const files = run.files || [];
  return (
    <article className="agent-turn" data-status={run.status}>
      <p className="agent-ask">{run.task}</p>
      <p className="agent-meta">
        <span className="agent-status">{STATUS[run.status]}</span>
        {run.where ? ` · ${run.where}` : ""} · {timeAgo(run.started)}
        {run.ms && run.status !== "running" ? ` · ${Math.round(run.ms / 1000)} s` : ""}
        {run.tier === "smart" ? " · careful" : ""}
      </p>
      {run.status === "running" && (
        <Spinner label={run.activity || "Working"} since={new Date(run.started).getTime()} />
      )}
      {run.answer && (
        <MarkdownWorldContext.Provider value={run.vault ? world : null}>
          <Markdown text={run.answer} theme={theme} className="agent-reply" />
        </MarkdownWorldContext.Provider>
      )}
      {run.review && (
        <ul className="run-review">
          {run.review.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {run.error && <p className="form-error">{run.error}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && run.status !== "failed" && (
        <ul className="agent-files" aria-label="Files it changed">
          {files.map((f) => {
            const href = f.change !== "D" && run.status === "merged" ? linkOf(run, f.path) : null;
            const name = f.path.split("/").pop()?.replace(/\.md$/, "") || f.path;
            return (
              <li key={`${f.change}${f.path}`} title={f.path} data-change={f.change}>
                <span className="visually-hidden">
                  {f.change === "A" ? "new: " : f.change === "D" ? "deleted: " : "changed: "}
                </span>
                {href ? (
                  <a href={href} onClick={close}>
                    {name}
                  </a>
                ) : (
                  name
                )}
              </li>
            );
          })}
        </ul>
      )}
      {run.status !== "running" && (
        <div className="agent-actions">
          {openLink && (run.status === "merged" || run.status === "done") && (
            <a
              className="button primary small"
              href={openLink}
              onClick={(e) => {
                e.preventDefault();
                close();
                go(openLink);
              }}
            >
              Open
            </a>
          )}
          {run.status === "merged" && run.change && (
            <button type="button" className="button small" onClick={() => act("undo")}>
              Undo
            </button>
          )}
          {run.status === "review" && (
            <>
              <button type="button" className="button primary small" onClick={() => act("approve")}>
                Apply anyway
              </button>
              <button type="button" className="button small" onClick={() => act("discard")}>
                Discard
              </button>
            </>
          )}
          {run.status === "done" && run.answer && !files.length && !run.kept && (
            <button type="button" className="button small" onClick={() => act("keep")}>
              Keep as a note
            </button>
          )}
          {run.kept && keptLink(run) && (
            <a className="button subtle small" href={keptLink(run)!} onClick={close}>
              Kept · open the note
            </a>
          )}
          {run.status === "failed" && (
            <button type="button" className="button small" onClick={retry}>
              Try again
            </button>
          )}
          {run.commit && files.length > 0 && (
            <details
              className="agent-diff"
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open && diff === null)
                  learn.agentDiff(run.id).then(
                    (d) => setDiff(d.diff),
                    () => setDiff(""),
                  );
              }}
            >
              <summary className="fine">Show the changes</summary>
              {diff !== null && <pre className="run-diff">{diff || "(no changes to show)"}</pre>}
            </details>
          )}
        </div>
      )}
    </article>
  );
}

/** Where a file a run made or changed opens: in its vault, or the app's own. */
const linkOf = (run: AgentRun, path: string) => (run.vault ? noteRoute(run.vault, path) : vaultLink(path));

/** Where the note an answer was kept in opens (in a vault; older runs kept it among the app's files). */
const keptLink = (run: AgentRun) => {
  const vault = run.vault || run.keptIn;
  return run.kept ? (vault ? noteRoute(vault, run.kept) : vaultLink(run.kept)) : null;
};

/** A request finished while the panel was closed: one line at the bottom of the window. */
function Notice({ run, onShow, onClose }: { run: AgentRun; onShow: () => void; onClose: () => void }) {
  const link = run.open && (run.status === "merged" || run.status === "done") ? linkOf(run, run.open) : null;
  const line = (run.status === "failed" ? run.error : run.answer || run.task)?.split("\n")[0] || "";
  return (
    <div className="toast agent-notice" role="status" data-status={run.status}>
      <Sparkles aria-hidden="true" />
      <span className="agent-notice-text">
        <b>{STATUS[run.status]}.</b> {line.replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").slice(0, 140)}
      </span>
      {link && (
        <a className="toast-action" href={link} onClick={onClose}>
          Open
        </a>
      )}
      <button type="button" className="toast-action" onClick={onShow}>
        {run.status === "review" ? "Review" : "Show"}
      </button>
    </div>
  );
}
