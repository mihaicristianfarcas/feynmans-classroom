/* Quizzes and pretests: one question at a time, multiple choice or short answer, with feedback right
 * after each answer; misses can become flashcards in one click (and what they build on that is fading
 * is named), and a quiz kept in a note can have the attempt added to it. An answer the grader couldn't check is never scored: it can be checked again,
 * or skipped and left out of the score. */
import { type CSSProperties, useEffect, useState } from "react";
import { learn, type Question, type Quiz } from "../api";
import { announce } from "../lib/a11y";
import { Foundations } from "./Foundations";
import { Spinner } from "./feedback";
import { Markdown } from "./Markdown";

export interface Answer {
  choice?: number;
  text?: string;
  score: number;
  feedback?: string;
  /** Skipped after the grader failed: it shows the model answer and counts in neither the score nor the total. */
  unchecked?: boolean;
}

/** One question at a time, with feedback right after each answer (retrieval with feedback). */
export function QuizRunner({
  quiz,
  theme,
  onDone,
  deck,
  saveAttempt,
}: {
  quiz: Quiz;
  theme: "light" | "dark";
  onDone?: () => void;
  deck?: string;
  /** Keeps the attempt (a quiz in a note: added under it, with the corrections). */
  saveAttempt?: (answers: (Answer | null)[]) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(Answer | null)[]>(quiz.questions.map(() => null));
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  /** Why the grader couldn't check this answer, until it's checked or skipped. */
  const [failed, setFailed] = useState<string | null>(null);
  const [carded, setCarded] = useState<Set<number>>(new Set());
  const [recorded, setRecorded] = useState(false);
  const [kept, setKept] = useState<"no" | "saving" | "yes">("no");
  const q = quiz.questions[index];
  const answer = answers[index];
  const done = index >= quiz.questions.length;
  const score = answers.reduce((s, a) => s + (a?.score || 0), 0);
  const unchecked = answers.filter((a) => a?.unchecked).length;
  const total = quiz.questions.length - unchecked;

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
    const missed = quiz.questions
      .map((qq, i) => ({ qq, i }))
      .filter(({ i }) => !answers[i]?.unchecked && (answers[i]?.score ?? 0) < 0.7);
    if (!recorded && total > 0) {
      setRecorded(true);
      learn
        .recordQuiz({
          title: quiz.title,
          mode: quiz.mode,
          bookId: quiz.source.bookId,
          score: Math.round(score * 10) / 10,
          total,
          concepts: [...new Set(quiz.questions.map((x) => x.concept).filter(Boolean))],
          answers: quiz.questions.flatMap((x, i) => {
            const a = answers[i];
            return a && !a.unchecked && x.concept ? [{ concept: x.concept, score: a.score }] : [];
          }),
        })
        .catch(() => {});
    }
    return (
      <div className="quiz-done">
        <div className="quiz-score">
          {total > 0 && (
            <span className="tile-number">
              {Math.round(score * 10) / 10}/{total}
            </span>
          )}
          <span className="fine">
            {total === 0
              ? "None of the answers could be checked, so nothing was scored."
              : quiz.mode === "pretest"
                ? "Now read the chapter: the questions you missed are exactly what to look for."
                : score / total >= 0.8
                  ? "Solid. The spaced reviews will keep it that way."
                  : "The misses are the most valuable part: they show what to revisit."}
            {total > 0 &&
              unchecked > 0 &&
              (unchecked === 1
                ? " One answer wasn’t checked, so the score leaves it out."
                : ` ${unchecked} answers weren’t checked, so the score leaves them out.`)}
          </span>
        </div>
        {missed.length > 0 && (
          <>
            <Foundations
              concepts={[...new Set(missed.map(({ qq }) => qq.concept).filter(Boolean))]}
              lead="What you missed builds on"
            />
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
        {saveAttempt && (
          <button
            type="button"
            className="button"
            disabled={kept !== "no"}
            onClick={async () => {
              setKept("saving");
              try {
                await saveAttempt(answers);
                setKept("yes");
                announce("Added to the note");
              } catch {
                setKept("no");
              }
            }}
          >
            {kept === "yes" ? "Added to the note" : "Add this attempt to the note, with corrections"}
          </button>
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
        <span style={{ "--p": index / quiz.questions.length } as CSSProperties} />
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
          {!answer && failed && (
            <p className="form-error" role="alert">
              Your answer couldn’t be checked, so it isn’t scored: {failed}
            </p>
          )}
          {!answer && (
            <div className="row gap">
              <button
                type="button"
                className="button primary"
                disabled={grading || !text.trim()}
                onClick={async () => {
                  setGrading(true);
                  setFailed(null);
                  try {
                    const [r] = await learn.gradeShort([{ question: q.question, ideal: q.ideal, answer: text }]);
                    set({ text, score: r.score, feedback: r.feedback });
                  } catch (e) {
                    setFailed((e as Error).message);
                  } finally {
                    setGrading(false);
                  }
                }}
              >
                {grading ? <Spinner label="Checking" /> : failed ? "Check again" : "Check"}
              </button>
              {failed && !grading && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setFailed(null);
                    set({ text, score: 0, unchecked: true });
                  }}
                >
                  Skip it
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {answer && <Feedback q={q} answer={answer} theme={theme} />}
      {answer && (
        <div className="quiz-actions">
          {!answer.unchecked && answer.score < 0.7 && (
            <button type="button" className="button" disabled={carded.has(index)} onClick={() => toCard(index)}>
              {carded.has(index) ? "Card made" : "Make a card"}
            </button>
          )}
          <button
            type="button"
            className="button primary"
            // biome-ignore lint/a11y/noAutofocus: after the feedback (announced above), Next is where the learner goes
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
  const right = !answer.unchecked && answer.score >= 0.7;
  const verdict = answer.unchecked ? "Not checked." : right ? "Right." : answer.score > 0.3 ? "Partly." : "Not quite.";
  // read out for screen readers as soon as it appears (focus moves on to Next)
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per answer
  useEffect(() => {
    announce(`${verdict} ${answer.unchecked ? q.ideal : answer.feedback || ""} ${q.explanation}`);
  }, []);
  return (
    <div className="quiz-feedback" data-right={right || undefined} data-unchecked={answer.unchecked || undefined}>
      <b>{verdict}</b> {answer.feedback && <span>{answer.feedback} </span>}
      {answer.unchecked && <Markdown text={`A model answer: ${q.ideal}`} theme={theme} />}
      <Markdown text={q.explanation} theme={theme} />
      {q.quote && <blockquote className="quote">“{q.quote}”</blockquote>}
    </div>
  );
}
