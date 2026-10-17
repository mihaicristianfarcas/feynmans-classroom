/* A ```quiz block in a note (shared/quiz.ts has the format), played one question at a time with the
 * quiz runner. In the note's own page the attempt can then be added under the quiz: the score, and
 * each miss with what was answered and the correction. */
import { createContext, useContext, useEffect, useState } from "react";
import { attemptMarkdown, type NoteQuiz, quizFromData } from "../../../shared/quiz.ts";
import { QuizRunner } from "./Quiz";

/** The note a page is showing (the app's, or a vault's), so a quiz in it can add attempts to it. */
export const NoteContext = createContext<{ append: (markdown: string) => Promise<unknown> } | null>(null);

export function QuizBlock({ source, theme, depth = 0 }: { source: string; theme: "light" | "dark"; depth?: number }) {
  const note = useContext(NoteContext);
  const [read, setRead] = useState<{ quiz?: NoteQuiz; error?: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let alive = true;
    // the YAML reader loads only when a note has a quiz in it
    import("yaml").then(({ parse }) => {
      if (!alive) return;
      try {
        setRead({ quiz: quizFromData(parse(source)) });
      } catch (e) {
        setRead({ error: (e as Error).message.split("\n")[0] });
      }
    });
    return () => {
      alive = false;
    };
  }, [source]);
  if (!read) return <div className="md-quiz fine">Loading the quiz…</div>;
  if (read.error || !read.quiz)
    return (
      <div className="md-quiz" data-error="">
        <p className="form-error">This quiz can’t be read: {read.error}</p>
        <pre>{source}</pre>
      </div>
    );
  const quiz = read.quiz;
  if (!playing)
    return (
      <div className="md-quiz">
        <span className="eyebrow">Quiz</span>
        <p className="md-quiz-title">{quiz.title}</p>
        <p className="fine">
          {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}
          {quiz.questions.some((q) => q.kind === "short") ? ", some in your own words" : ""}
        </p>
        <button type="button" className="button primary" onClick={() => setPlaying(true)}>
          Start
        </button>
      </div>
    );
  return (
    <div className="md-quiz playing">
      <QuizRunner
        quiz={{ id: `note-${quiz.title}`, title: quiz.title, mode: "check", questions: quiz.questions, source: {} }}
        theme={theme}
        onDone={() => setPlaying(false)}
        saveAttempt={
          note && depth === 0
            ? async (answers) => {
                await note.append(attemptMarkdown(quiz, answers));
              }
            : undefined
        }
      />
    </div>
  );
}
