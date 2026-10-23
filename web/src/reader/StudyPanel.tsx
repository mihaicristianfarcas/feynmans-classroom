/* The reader's Study pane: the chapter's study tools (pretest, quiz, concept map, explain it back), and
 * a word when the chapter builds on something the learner is forgetting, with a refresher. */
import { CircleHelp, MessageCircleQuestion, Waypoints } from "lucide-react";
import { useEffect, useState } from "react";
import { type Book, type ConceptView, learn, type Quiz, type TocEntry } from "../api";
import { Foundations } from "../components/Foundations";
import { Loading, Mastery, Spinner } from "../components/feedback";
import { QuizRunner } from "../components/Quiz";
import { ExplainBack } from "../components/tools";

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
  const [concepts, setConcepts] = useState<ConceptView[] | null>(null);
  const [explain, setExplain] = useState<ConceptView | null>(null);
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
  if (quiz)
    return (
      <div className="study-tab">
        <QuizRunner quiz={quiz} theme={theme} onDone={() => setQuiz(null)} deck={book.title} />
      </div>
    );
  return (
    <div className="study-tab">
      <div className="eyebrow">{chapter.title}</div>
      {chapter.subtitle && <h2 className="chapter-title">{chapter.subtitle}</h2>}
      <Foundations
        concepts={(concepts || []).map((c) => c.id)}
        lead="This chapter builds on"
        onRefresh={(ids) =>
          run("Writing a refresher", async () => setQuiz(await learn.quiz({ mode: "review", concepts: ids, count: 3 })))
        }
      />
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
            run("Mapping the chapter’s concepts", async () => {
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
              Find the chapter’s key concepts and add them to your knowledge graph, linked to where they appear.
            </span>
          </span>
        </button>
      </div>
      {busy && <Spinner label={busy.what} since={busy.at} />}
      {error && <p className="form-error">{error}</p>}
      <h3 className="sub-title">Concepts in this chapter</h3>
      {!concepts ? (
        <Loading inline label="Finding the chapter’s concepts" />
      ) : concepts.length === 0 ? (
        <p className="fine">None mapped yet. Use Map concepts, or make cards while you read.</p>
      ) : (
        <ul className="chapter-concepts">
          {concepts.map((c) => (
            <li key={c.id}>
              <a href={`#/brain/concept/${c.id}`}>{c.title}</a>
              <Mastery value={c.mastery} />
              <button type="button" className="link" aria-haspopup="dialog" onClick={() => setExplain(c)}>
                Explain it
              </button>
            </li>
          ))}
        </ul>
      )}
      {explain && (
        <ExplainBack
          concept={explain.title}
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
