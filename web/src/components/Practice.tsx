/* A worked example, then practice (server/learn/practice.ts writes them): the example's solution in
 * steps, each under a label saying what it achieves; then problems the learner answers before seeing
 * anything. A plain match is right at once (shared/practice.ts); anything else goes to the grader, and
 * a miss shows that problem worked the same way. Two right in a row finishes it; after three misses an
 * easier one comes, with what the concept builds on if that is fading. An answer the grader couldn't
 * check is never scored. The answers count toward the concept, and the set can be kept as a note. */
import { useEffect, useState } from "react";
import { sameAnswer } from "../../../shared/practice.ts";
import { learn, type Practice, type PracticeProblem, type SourceRef } from "../api";
import { announce } from "../lib/a11y";
import { Foundations } from "./Foundations";
import { Spinner } from "./feedback";
import { Markdown } from "./Markdown";
import { Modal } from "./tools";

interface Result {
  text: string;
  score: number;
  feedback?: string;
  /** Skipped after the grader failed: not scored. */
  unchecked?: boolean;
}
interface Served {
  problem: PracticeProblem;
  /** The easier one, served after three misses. */
  easier?: boolean;
  result?: Result;
}

const right = (r?: Result) => !!r && !r.unchecked && r.score >= 0.7;

/** Opens a practice session for a passage or a concept, writing it first. */
export function PracticeSession({
  passage,
  source,
  concept,
  theme,
  onClose,
}: {
  passage?: string;
  source?: SourceRef;
  concept?: string;
  theme: "light" | "dark";
  onClose: () => void;
}) {
  const [practice, setPractice] = useState<Practice | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(Date.now());
    setError(null);
    try {
      setPractice(await learn.practice({ passage, source, concept }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: written once, when the dialog opens
  useEffect(() => {
    start();
  }, []);
  return (
    <Modal title={practice?.title || "Practice"} eyebrow="A worked example, then your turn" onClose={onClose} wide>
      {practice ? (
        <PracticeRunner practice={practice} theme={theme} onClose={onClose} />
      ) : busy ? (
        <Spinner label="Writing a worked example" since={busy} />
      ) : (
        error && (
          <>
            <p className="form-error" role="alert">
              {error}
            </p>
            <div className="form-actions">
              <button type="button" className="button primary" onClick={start}>
                Try again
              </button>
            </div>
          </>
        )
      )}
    </Modal>
  );
}

/** A problem's solution: its steps under their labels, then the answer. */
function Steps({ problem, theme }: { problem: PracticeProblem; theme: "light" | "dark" }) {
  return (
    <>
      {/* biome-ignore lint/a11y/noRedundantRoles: list-style none would otherwise drop the list's semantics in Safari */}
      <ol className="practice-steps" role="list">
        {problem.steps.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a problem's steps never change
          <li key={i}>
            <span className="practice-label">{s.label}</span>
            <Markdown text={s.work} theme={theme} />
          </li>
        ))}
      </ol>
      <Markdown text={`**Answer:** ${problem.answer}`} theme={theme} className="practice-final" />
    </>
  );
}

function PracticeRunner({
  practice,
  theme,
  onClose,
}: {
  practice: Practice;
  theme: "light" | "dark";
  onClose: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [served, setServed] = useState<Served[]>([{ problem: practice.problems[0] }]);
  const [done, setDone] = useState(false);
  const [text, setText] = useState("");
  const [grading, setGrading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [kept, setKept] = useState<"no" | "saving" | "yes">("no");
  const [recorded, setRecorded] = useState(false);
  const current = served[served.length - 1];
  const scored = served.filter((s) => s.result && !s.result.unchecked);
  const misses = scored.filter((s) => !right(s.result)).length;
  // right answers in a row, counting back from the latest (an unchecked one neither adds nor breaks)
  let streak = 0;
  for (const s of [...scored].reverse()) {
    if (!right(s.result)) break;
    streak++;
  }

  const answer = (result: Result) => {
    setServed((list) => list.map((s, i) => (i === list.length - 1 ? { ...s, result } : s)));
    announce(
      result.unchecked
        ? "Not checked."
        : right(result)
          ? `Right. ${result.feedback || ""}`
          : `Not quite. ${result.feedback || ""} Here it is worked out.`,
    );
  };
  const check = async () => {
    const p = current.problem;
    if (sameAnswer(text, p.answer, p.accept)) return answer({ text, score: 1 });
    setGrading(true);
    setFailed(null);
    try {
      const ideal = p.accept.length ? `${p.answer} (or: ${p.accept.join("; ")})` : p.answer;
      const [r] = await learn.gradeShort([{ question: p.problem, ideal, answer: text }]);
      answer({ text, score: r.score, feedback: r.feedback });
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setGrading(false);
    }
  };
  const used = served.filter((s) => !s.easier).length;
  const stepBack = misses >= 3 && !served.some((s) => s.easier);
  const ending = streak >= 2 || (!stepBack && used >= practice.problems.length);
  const next = () => {
    setText("");
    setFailed(null);
    if (ending) setDone(true);
    else if (stepBack) setServed((list) => [...list, { problem: practice.easier, easier: true }]);
    else setServed((list) => [...list, { problem: practice.problems[used] }]);
  };

  if (!started)
    return (
      <div className="practice">
        <Markdown text={practice.example.problem} theme={theme} className="quiz-q" />
        <Steps problem={practice.example} theme={theme} />
        <p className="fine">Each step’s label says what the step is for. The problems ahead are solved the same way.</p>
        <div className="form-actions">
          <button type="button" className="button primary" onClick={() => setStarted(true)}>
            Your turn
          </button>
        </div>
      </div>
    );

  if (done) {
    const score = scored.reduce((sum, s) => sum + (s.result?.score || 0), 0);
    if (!recorded && scored.length > 0) {
      setRecorded(true);
      learn
        .recordQuiz({
          title: practice.title,
          mode: "practice",
          bookId: practice.source?.bookId,
          score: Math.round(score * 10) / 10,
          total: scored.length,
          concepts: [practice.concept],
          answers: scored.map((s) => ({ concept: practice.concept, score: s.result!.score })),
        })
        .catch(() => {});
    }
    return (
      <div className="practice quiz-done">
        <div className="quiz-score">
          <span className="tile-number">
            {scored.filter((s) => right(s.result)).length}/{scored.length}
          </span>
          <span className="fine">
            {streak >= 2
              ? "Two right in a row: you have the method. Coming back to it in a few days will make it stay."
              : "That's all the problems for now. Trying again in a day or two, after a rest, is what makes a method stick."}
          </span>
        </div>
        {streak < 2 && <Foundations concepts={[practice.concept]} lead="It builds on" />}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={kept !== "no"}
            onClick={async () => {
              setKept("saving");
              try {
                await learn.savePractice(practice);
                setKept("yes");
                announce("Kept in your notes, with the solutions folded");
              } catch {
                setKept("no");
              }
            }}
          >
            {kept === "yes" ? "Kept in your notes" : "Keep as a note, to try again later"}
          </button>
          <button type="button" className="button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const result = current.result;
  return (
    // a new problem is a new form: its field takes the focus again
    <div className="practice" key={served.length}>
      <div className="quiz-head">
        <span className="eyebrow">
          {current.easier ? "A gentler one" : `Problem ${used} of ${practice.problems.length}`}
        </span>
        <span className="fine">
          {streak === 1 ? "One right. One more in a row finishes it." : "Two right in a row finishes it."}
        </span>
      </div>
      {current.easier && !result && (
        <>
          <p className="fine">That one wasn’t landing, and that’s fine: this one has fewer moving parts.</p>
          <Foundations concepts={[practice.concept]} lead="It builds on" />
        </>
      )}
      <Markdown text={current.problem.problem} theme={theme} className="quiz-q" />
      <form
        className="practice-answer"
        onSubmit={(e) => {
          e.preventDefault();
          if (!result && !grading && text.trim()) check();
        }}
      >
        <input
          aria-label="Your answer"
          value={text}
          disabled={!!result}
          // biome-ignore lint/a11y/noAutofocus: a new problem is answered at once; the field is the next step
          autoFocus
          onChange={(e) => setText(e.target.value)}
          placeholder="Your answer"
        />
        {!result && (
          <div className="row gap">
            <button type="submit" className="button primary" disabled={grading || !text.trim()}>
              {grading ? <Spinner label="Checking" /> : failed ? "Check again" : "Check"}
            </button>
            {failed && !grading && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setFailed(null);
                  answer({ text, score: 0, unchecked: true });
                }}
              >
                Skip it
              </button>
            )}
          </div>
        )}
      </form>
      {!result && failed && (
        <p className="form-error" role="alert">
          Your answer couldn’t be checked, so it isn’t scored: {failed}
        </p>
      )}
      {result && (
        <div
          className="quiz-feedback"
          data-right={right(result) || undefined}
          data-unchecked={result.unchecked || undefined}
        >
          <b>{result.unchecked ? "Not checked." : right(result) ? "Right." : "Not quite."}</b>{" "}
          {result.feedback && <span>{result.feedback}</span>}
          {right(result) ? (
            <details className="disclosure practice-worked">
              <summary>See it worked</summary>
              <Steps problem={current.problem} theme={theme} />
            </details>
          ) : (
            <Steps problem={current.problem} theme={theme} />
          )}
        </div>
      )}
      {result && (
        <div className="quiz-actions">
          <button
            type="button"
            className="button primary"
            // biome-ignore lint/a11y/noAutofocus: after the feedback (announced), Next is where the learner goes
            autoFocus
            onClick={next}
          >
            {ending ? "Finish" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
