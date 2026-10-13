/* The reader's left pane, beyond the margin: the tutor and the chapter's study tools (pretest, quiz,
 * concept map, explain it back). */
import { ArrowUp, CircleHelp, MessageCircleQuestion, Waypoints } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Book, type Concept, learn, type Quiz, type SourceRef, type TocEntry } from "./api";
import { Markdown } from "./Markdown";
import { QuizRunner } from "./Quiz";
import { Mastery, Spinner } from "./Shell";
import { ExplainBack } from "./tools";
import { useIndicator } from "./ui";

/* ---------------- tutor ---------------- */

export interface TutorMessage {
  role: "user" | "tutor";
  text: string;
}

export function TutorTab({
  book,
  chapter,
  pinned,
  onUnpin,
  theme,
  messages,
  setMessages,
}: {
  book: Book;
  chapter: TocEntry | null;
  pinned: { text: string; source: SourceRef } | null;
  onUnpin: () => void;
  theme: "light" | "dark";
  messages: TutorMessage[];
  setMessages: (m: TutorMessage[]) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [mode, setMode] = useState<"answer" | "socratic">("answer");
  const modes = useIndicator<HTMLDivElement>(mode);
  const end = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls to the newest message when one arrives or the tutor starts answering
  useEffect(() => {
    // a block, not an expression: scrollIntoView returns a promise in recent browsers
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const next: TutorMessage[] = [...messages, { role: "user", text: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(Date.now());
    try {
      const source: SourceRef = pinned?.source || { bookId: book.id, chapterId: chapter?.id };
      const { reply } = await learn.tutor({ messages: next, passage: pinned?.text, source, mode });
      setMessages([...next, { role: "tutor", text: reply }]);
    } catch (e) {
      setMessages([...next, { role: "tutor", text: `_${(e as Error).message}_` }]);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="tutor">
      <div className="tutor-scroll">
        {pinned ? (
          <div className="pinned">
            <span className="eyebrow">About this passage</span>
            <blockquote className="quote">
              {pinned.text.length > 300 ? `${pinned.text.slice(0, 300)}…` : pinned.text}
            </blockquote>
            <button type="button" className="link" onClick={onUnpin}>
              Ask about the whole chapter instead
            </button>
          </div>
        ) : (
          <p className="fine">
            Ask anything about {chapter ? `“${chapter.title}”` : "this book"}. Select a passage and choose Ask to talk
            about it specifically.
          </p>
        )}
        {messages.length === 0 && (
          <div className="starters">
            {[
              "Explain this like I'm new to it",
              "Why does this matter?",
              "Give me a concrete example",
              "What's the most common misconception here?",
            ].map((s) => (
              <button type="button" key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: messages are only appended
            key={i}
            className="msg"
            data-role={m.role}
          >
            {m.role === "tutor" ? <Markdown text={m.text} theme={theme} /> : <p>{m.text}</p>}
          </div>
        ))}
        {busy && <Spinner label="Thinking" since={busy} />}
        <div ref={end} />
      </div>
      <form
        className="tutor-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "socratic" ? "Ask, and the tutor will guide you to it…" : "Ask the tutor…"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <div className="row gap">
          <div className="segmented" role="group" aria-label="Tutor style" ref={modes}>
            <button type="button" aria-pressed={mode === "answer"} onClick={() => setMode("answer")}>
              Answer me
            </button>
            <button
              type="button"
              aria-pressed={mode === "socratic"}
              onClick={() => setMode("socratic")}
              title="The tutor asks questions that lead you to the answer"
            >
              Socratic
            </button>
          </div>
          <span className="spacer" />
          {messages.length > 0 && (
            <button type="button" className="link" onClick={() => setMessages([])}>
              Clear
            </button>
          )}
          <button className="button primary" type="submit" disabled={!!busy || !input.trim()}>
            Send
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- study ---------------- */

export function StudyTab({
  book,
  chapter,
  theme,
  autoQuiz,
}: {
  book: Book;
  chapter: TocEntry | null;
  theme: "light" | "dark";
  autoQuiz?: "check" | "pretest" | null;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState<{ what: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [explain, setExplain] = useState<Concept | null>(null);
  const loadConcepts = () =>
    learn
      .concepts()
      .then((all) =>
        setConcepts(
          chapter ? all.filter((c) => c.sources.some((s) => s.bookId === book.id && s.chapterId === chapter.id)) : [],
        ),
      );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a different chapter resets the study tools
  useEffect(() => {
    setQuiz(null);
    setConcepts(null);
    loadConcepts();
  }, [chapter?.id]);
  const run = async (what: string, work: () => Promise<void>) => {
    setBusy({ what, at: Date.now() });
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const startQuiz = (mode: "check" | "pretest") =>
    chapter &&
    run(mode === "pretest" ? "Writing a pretest" : "Writing a quiz", async () =>
      setQuiz(await learn.quiz({ bookId: book.id, chapterId: chapter.id, mode, count: mode === "pretest" ? 4 : 5 })),
    );
  // biome-ignore lint/correctness/useExhaustiveDependencies: starts the requested quiz once per chapter
  useEffect(() => {
    if (autoQuiz && chapter) startQuiz(autoQuiz);
  }, [autoQuiz, chapter?.id]);
  if (!chapter) return <p className="fine">Open a chapter to study it.</p>;
  if (quiz) return <QuizRunner quiz={quiz} theme={theme} onDone={() => setQuiz(null)} deck={book.title} />;
  return (
    <div className="study-tab">
      <div className="eyebrow">{chapter.title}</div>
      {chapter.subtitle && <h2 className="chapter-title">{chapter.subtitle}</h2>}
      <div className="study-actions stagger">
        <button type="button" className="study-action" disabled={!!busy} onClick={() => startQuiz("pretest")}>
          <span className="well" data-tone="sky" aria-hidden="true">
            <CircleHelp />
          </span>
          <span>
            <b>Pretest</b>
            <span>Before you read: guess at the key ideas. Getting them wrong first makes the reading stick.</span>
          </span>
        </button>
        <button type="button" className="study-action" disabled={!!busy} onClick={() => startQuiz("check")}>
          <span className="well" data-tone="lavender" aria-hidden="true">
            <MessageCircleQuestion />
          </span>
          <span>
            <b>Quiz me</b>
            <span>After you read: questions that make you use the ideas, with explanations.</span>
          </span>
        </button>
        <button
          type="button"
          className="study-action"
          disabled={!!busy}
          onClick={() =>
            run("Mapping the chapter's concepts", async () => {
              await learn.extractConcepts(book.id, chapter.id);
              await loadConcepts();
            })
          }
        >
          <span className="well" data-tone="sage" aria-hidden="true">
            <Waypoints />
          </span>
          <span>
            <b>Map concepts</b>
            <span>
              Find the chapter's key concepts and add them to your knowledge graph, linked to where they appear.
            </span>
          </span>
        </button>
      </div>
      {busy && <Spinner label={busy.what} since={busy.at} />}
      {error && <p className="form-error">{error}</p>}
      <h3 className="sub-title">Concepts in this chapter</h3>
      {!concepts ? (
        <Spinner label="Loading" />
      ) : concepts.length === 0 ? (
        <p className="fine">None mapped yet. Use Map concepts, or make cards while you read.</p>
      ) : (
        <ul className="chapter-concepts">
          {concepts.map((c) => (
            <li key={c.id}>
              <a href={`#/brain/concept/${c.id}`}>{c.name}</a>
              <Mastery value={c.mastery} />
              <button type="button" className="link" onClick={() => setExplain(c)}>
                Explain it
              </button>
            </li>
          ))}
        </ul>
      )}
      {explain && (
        <ExplainBack
          concept={explain.name}
          passage={explain.summary}
          source={explain.sources.find((s) => s.bookId === book.id)}
          theme={theme}
          onClose={() => {
            setExplain(null);
            loadConcepts();
          }}
        />
      )}
    </div>
  );
}
