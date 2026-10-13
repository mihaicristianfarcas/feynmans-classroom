import { ArrowUp, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { learn } from "../api";
import { AgentRuns } from "../components/AgentRuns";
import { Spinner } from "../components/feedback";
import { Markdown } from "../components/Markdown";
import { useIndicator } from "../components/ui";

interface Answer {
  question: string;
  answer: string;
  sources: { path: string; quote: string }[];
  ms: number;
  saved?: boolean;
}

/** Links a vault path to the page that shows it. */
function pathLink(path: string): string | null {
  if (/^(notes|concepts)\/.+\.md$/.test(path) || /^library\/[^/]+\/annotations\/.+\.md$/.test(path))
    return `#/open?target=${encodeURIComponent(path.replace(/\.md$/, ""))}`;
  const book = /^library\/([^/]+)\//.exec(path);
  if (book) return `#/open?target=${encodeURIComponent(`library/${book[1]}`)}`;
  return null;
}

/** An agent reads your vault (notes, concepts, cards and the full text of your books) and answers. */
export function Ask({ theme }: { theme: "light" | "dark" }) {
  const [mode, setMode] = useState<"ask" | "do">(
    new URLSearchParams(location.hash.split("?")[1] || "").get("do") ? "do" : "ask",
  );
  const tabs = useIndicator<HTMLElement>(mode);
  return (
    <div className="ask rise">
      <header className="page-head">
        <h1 className="page-title">{mode === "ask" ? "Ask your library" : "Work on your vault"}</h1>
        <p className="lede small">
          {mode === "ask"
            ? "An agent searches your notes, concepts, cards and the full text of your books with its own shell, then answers with sources."
            : "An agent reorganises, links and writes notes for you, on its own branch of your vault, inside a sandbox. Its changes land after checks, and every run can be undone."}
        </p>
      </header>
      <nav className="tabs" aria-label="Mode" ref={tabs}>
        <button
          type="button"
          className="tab"
          aria-current={mode === "ask" ? "page" : undefined}
          onClick={() => setMode("ask")}
        >
          Ask
        </button>
        <button
          type="button"
          className="tab"
          aria-current={mode === "do" ? "page" : undefined}
          onClick={() => setMode("do")}
        >
          Do
        </button>
      </nav>
      {mode === "ask" ? <AskPanel theme={theme} /> : <AgentRuns theme={theme} />}
    </div>
  );
}

function AskPanel({ theme }: { theme: "light" | "dark" }) {
  const initial = new URLSearchParams(location.hash.split("?")[1] || "").get("q") || "";
  const [question, setQuestion] = useState(initial);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(Date.now());
    setError(null);
    try {
      const r = await learn.ask(q.trim());
      setAnswers((list) => [{ question: q.trim(), ...r }, ...list]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for the question the page was opened with
  useEffect(() => {
    if (initial) ask(initial);
  }, []);
  return (
    <div>
      <form
        className="ask-bar"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <Sparkles className="ask-icon" aria-hidden="true" />
        <input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. How do Tanenbaum and Kleppmann differ on consistency models?"
          disabled={!!busy}
        />
        <button className="icon-button ask-send" type="submit" disabled={!!busy || !question.trim()} aria-label="Ask">
          <ArrowUp aria-hidden="true" />
        </button>
      </form>
      {busy && <Spinner label="Reading your vault" since={busy} />}
      {error && <p className="form-error">{error}</p>}
      {answers.map((a, i) => (
        <article
          // biome-ignore lint/suspicious/noArrayIndexKey: answers are only appended, and hold no state
          key={i}
          className="answer"
        >
          <h2 className="answer-q">{a.question}</h2>
          <Markdown text={a.answer} theme={theme} />
          {a.sources.length > 0 && (
            <ol className="sources">
              {a.sources.map((s, k) => {
                const link = pathLink(s.path);
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: sources are fixed for an answer
                    key={k}
                  >
                    {link ? <a href={link}>{s.path}</a> : <code>{s.path}</code>}
                    {s.quote && <span className="fine"> — “{s.quote.slice(0, 200)}”</span>}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="row gap">
            <span className="fine">{(a.ms / 1000).toFixed(0)} s</span>
            <button
              type="button"
              className="button"
              disabled={a.saved}
              onClick={async () => {
                await learn.saveAnswer({ question: a.question, answer: a.answer, sources: a.sources });
                setAnswers((list) => list.map((x, k) => (k === i ? { ...x, saved: true } : x)));
              }}
            >
              {a.saved ? "Saved" : "Save as a note"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
