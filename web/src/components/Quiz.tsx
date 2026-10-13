import { useState } from "react";
import { learn, type Question, type Quiz } from "../api";
import { Spinner } from "./feedback";
import { Markdown } from "./Markdown";

interface Answer {
  choice?: number;
  text?: string;
  score: number;
  feedback?: string;
}

/** One question at a time, with feedback right after each answer (retrieval with feedback). */
export function QuizRunner({
  quiz,
  theme,
  onDone,
  deck,
}: {
  quiz: Quiz;
  theme: "light" | "dark";
  onDone?: () => void;
  deck?: string;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(Answer | null)[]>(quiz.questions.map(() => null));
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  const [carded, setCarded] = useState<Set<number>>(new Set());
  const [recorded, setRecorded] = useState(false);
  const q = quiz.questions[index];
  const answer = answers[index];
  const done = index >= quiz.questions.length;
  const score = answers.reduce((s, a) => s + (a?.score || 0), 0);

  const set = (a: Answer) => setAnswers((list) => list.map((x, i) => (i === index ? a : x)));
  const toCard = async (i: number) => {
    const question = quiz.questions[i];
    await learn.saveCards([
      {
        front: question.question,
        back: `${question.ideal}\n\n${question.explanation}`,
        deck: deck || quiz.title,
        concepts: question.concept ? [question.concept] : [],
        source: quiz.source.bookId
          ? { bookId: quiz.source.bookId, chapterId: quiz.source.chapterId, quote: question.quote || undefined }
          : undefined,
      },
    ]);
    setCarded((s) => new Set(s).add(i));
  };

  if (done) {
    const missed = quiz.questions.map((qq, i) => ({ qq, i })).filter(({ i }) => (answers[i]?.score ?? 0) < 0.7);
    if (!recorded) {
      setRecorded(true);
      learn
        .recordQuiz({
          title: quiz.title,
          mode: quiz.mode,
          bookId: quiz.source.bookId,
          score: Math.round(score * 10) / 10,
          total: quiz.questions.length,
          concepts: [...new Set(quiz.questions.map((x) => x.concept).filter(Boolean))],
        })
        .catch(() => {});
    }
    return (
      <div className="quiz-done">
        <div className="quiz-score">
          <span className="tile-number">
            {Math.round(score * 10) / 10}/{quiz.questions.length}
          </span>
          <span className="fine">
            {quiz.mode === "pretest"
              ? "Now read the chapter: the questions you missed are exactly what to look for."
              : score / quiz.questions.length >= 0.8
                ? "Solid. The spaced reviews will keep it that way."
                : "The misses are the most valuable part: they show what to revisit."}
          </span>
        </div>
        {missed.length > 0 && (
          <>
            <h3 className="sub-title">To revisit</h3>
            <ul className="missed">
              {missed.map(({ qq, i }) => (
                <li key={i}>
                  <Markdown text={qq.question} theme={theme} />
                  <p className="fine">{qq.ideal}</p>
                  <button type="button" className="button" disabled={carded.has(i)} onClick={() => toCard(i)}>
                    {carded.has(i) ? "Card made" : "Make a card"}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button primary"
              disabled={missed.every(({ i }) => carded.has(i))}
              onClick={() => {
                for (const { i } of missed) if (!carded.has(i)) toCard(i);
              }}
            >
              Make cards from all misses
            </button>
          </>
        )}
        {onDone && (
          <button type="button" className="button" onClick={onDone}>
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="quiz-head">
        <span className="eyebrow">
          {quiz.mode === "pretest" ? "Pretest" : quiz.mode === "review" ? "Mixed review" : "Quiz"} · {quiz.title}
        </span>
        <span className="fine">
          {index + 1} / {quiz.questions.length}
        </span>
      </div>
      <div className="quiz-progress">
        <span style={{ width: `${(index / quiz.questions.length) * 100}%` }} />
      </div>
      <Markdown text={q.question} theme={theme} className="quiz-q" />
      {q.kind === "mcq" ? (
        <div className="quiz-choices">
          {q.choices.map((c, i) => (
            <button
              type="button"
              // biome-ignore lint/suspicious/noArrayIndexKey: choices are fixed for a question
              key={i}
              className="choice"
              disabled={!!answer}
              data-right={answer && i === q.answer ? "" : undefined}
              data-wrong={answer && answer.choice === i && i !== q.answer ? "" : undefined}
              onClick={() => set({ choice: i, score: i === q.answer ? 1 : 0 })}
            >
              <span className="choice-key">{String.fromCharCode(65 + i)}</span>
              <Markdown text={c} theme={theme} />
            </button>
          ))}
        </div>
      ) : (
        <div className="quiz-short">
          <textarea
            rows={3}
            value={text}
            disabled={!!answer}
            onChange={(e) => setText(e.target.value)}
            placeholder="Answer in your own words…"
          />
          {!answer && (
            <button
              type="button"
              className="button primary"
              disabled={grading || !text.trim()}
              onClick={async () => {
                setGrading(true);
                try {
                  const [r] = await learn.gradeShort([{ question: q.question, ideal: q.ideal, answer: text }]);
                  set({ text, score: Math.max(0, Math.min(1, r.score)), feedback: r.feedback });
                } catch (e) {
                  set({ text, score: 0, feedback: (e as Error).message });
                } finally {
                  setGrading(false);
                }
              }}
            >
              {grading ? <Spinner label="Checking" /> : "Check"}
            </button>
          )}
        </div>
      )}
      {answer && <Feedback q={q} answer={answer} theme={theme} />}
      {answer && (
        <div className="quiz-actions">
          {answer.score < 0.7 && (
            <button type="button" className="button" disabled={carded.has(index)} onClick={() => toCard(index)}>
              {carded.has(index) ? "Card made" : "Make a card"}
            </button>
          )}
          <button
            type="button"
            className="button primary"
            autoFocus
            onClick={() => {
              setText("");
              setIndex(index + 1);
            }}
          >
            {index + 1 < quiz.questions.length ? "Next" : "See results"}
          </button>
        </div>
      )}
    </div>
  );
}

function Feedback({ q, answer, theme }: { q: Question; answer: Answer; theme: "light" | "dark" }) {
  const right = answer.score >= 0.7;
  return (
    <div className="quiz-feedback" data-right={right || undefined}>
      <b>{right ? "Right." : answer.score > 0.3 ? "Partly." : "Not quite."}</b>{" "}
      {answer.feedback && <span>{answer.feedback} </span>}
      <Markdown text={q.explanation} theme={theme} />
      {q.quote && <blockquote className="quote">“{q.quote}”</blockquote>}
    </div>
  );
}
