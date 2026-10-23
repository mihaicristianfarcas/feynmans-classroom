/* Review: flashcards due today, one at a time, interleaved across decks and scheduled with FSRS-6.
 * Space reveals the answer, 1–4 rate it; a quiet bar above picks the deck, asks you to type answers
 * first, or starts the mixed quiz. A card known for weeks is now and then asked a new way (a fresh
 * question on its idea, written while the first cards are reviewed), its own face shown with the answer
 * or instead, if the learner asks. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { humanInterval } from "../../../shared/fsrs.ts";
import { learn, type QueuedCard, type Quiz } from "../api";
import { bookLink } from "../app/navigation";
import { Spinner } from "../components/feedback";
import { Markdown } from "../components/Markdown";
import { QuizRunner } from "../components/Quiz";
import { announce } from "../lib/a11y";
import { useLoad } from "../lib/useLoad";
import { under, useVaultEvents } from "../lib/useVaultEvents";

const LABELS: Record<1 | 2 | 3 | 4, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

export function Review({ theme }: { theme: "light" | "dark" }) {
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  const [deck, setDeck] = useState(query.get("deck") || "");
  const { data: decks, reload: reloadDecks } = useLoad(() => learn.decks());
  useVaultEvents(reloadDecks, under("cards/"));
  const [queue, setQueue] = useState<QueuedCard[] | null>(null);
  const [stats, setStats] = useState({ done: 0, again: 0 });
  const [revealed, setRevealed] = useState(false);
  const [typing, setTyping] = useState(() => localStorage.getItem("classroom-type-answers") === "1");
  const [typed, setTyped] = useState("");
  /** Show the card itself, not the new question. */
  const [plain, setPlain] = useState(false);
  const revealButton = useRef<HTMLButtonElement>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    let current = true; // a deck picked since (or the effect undone) drops what this one asked for
    setQueue(null);
    learn.queue(deck || undefined).then((q) => {
      if (!current) return;
      setQueue(q.cards);
      // the new questions are written while the first cards are reviewed; the card on screen keeps its face
      const ids = q.cards
        .slice(1)
        .filter((c) => c.askNewWay && !c.variant)
        .map((c) => c.id);
      if (ids.length)
        learn
          .variants(ids)
          .then((found) => {
            if (!current) return;
            setQueue(
              (list) =>
                list?.map((c, i) =>
                  i > 0 && c.askNewWay && !c.variant && found[c.id] ? { ...c, variant: found[c.id] } : c,
                ) ?? null,
            );
          })
          .catch(() => {}); // they are asked by their face
    });
    return () => {
      current = false;
    };
  }, [deck]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, for the query the page was opened with
  useEffect(() => {
    if (query.get("mixed")) startMixed();
  }, []);

  const card = queue?.[0];
  const asked = card?.variant && !plain ? card.variant : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: resets the answer state when the next card comes up
  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
    setTyped("");
    setPlain(false);
  }, [card?.id]);

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!card) return;
      const took = Math.round((Date.now() - shownAt.current) / 1000);
      const updated = await learn.rate(card.id, rating, took, !!asked);
      setStats((s) => ({ done: s.done + 1, again: s.again + (rating === 1 ? 1 : 0) }));
      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        // a card that comes back within the session goes a few cards later
        if (updated.state && updated.state.due - Date.now() < 20 * 60000)
          rest.splice(Math.min(rest.length, 3), 0, updated);
        return rest;
      });
      window.dispatchEvent(new Event("classroom:reviewed"));
    },
    [card, asked],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !(e.key === "Enter" && (e.metaKey || e.ctrlKey))) return;
      if (!card || quiz) return;
      // Space and Enter on a focused button or link are that control's (Show answer reveals by itself)
      if ((e.key === " " || e.key === "Enter") && target.closest("button, a")) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key) as 1 | 2 | 3 | 4);
      else if (revealed && e.key === " ") {
        e.preventDefault();
        rate(3);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, revealed, rate, quiz]);

  const startMixed = async () => {
    setQuizLoading(true);
    try {
      setQuiz(await learn.quiz({ mode: "review", count: 6 }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setQuizLoading(false);
    }
  };

  const progress = useMemo(() => (queue ? stats.done / Math.max(1, stats.done + queue.length) : 0), [queue, stats]);

  if (quiz) {
    return (
      <div className="review">
        <QuizRunner quiz={quiz} theme={theme} onDone={() => setQuiz(null)} deck="Mixed review" />
      </div>
    );
  }

  return (
    <div className="review">
      <h1 className="visually-hidden">Review</h1>
      <div className="review-bar">
        <select className="quiet-select" value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Deck">
          <option value="">All decks, interleaved</option>
          {decks?.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} ({d.count})
            </option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={typing}
            onChange={(e) => {
              setTyping(e.target.checked);
              localStorage.setItem("classroom-type-answers", e.target.checked ? "1" : "0");
            }}
          />
          Type answers first
        </label>
        <button type="button" className="button subtle" onClick={startMixed} disabled={quizLoading}>
          {quizLoading ? <Spinner label="Writing a quiz" /> : "Mixed quiz"}
        </button>
      </div>
      <div className="quiz-progress">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      {!queue ? (
        <div className="center-note">
          <Spinner label="Gathering your cards" />
        </div>
      ) : !card ? (
        <div className="review-done">
          <h2 className="empty-title">{stats.done ? `Done: ${stats.done} reviews` : "Nothing due right now"}</h2>
          <p className="fine">
            {stats.done
              ? `You recalled ${Math.round(((stats.done - stats.again) / stats.done) * 100)}% on the first try. Each card comes back just before you'd forget it.`
              : "Cards come back when you're about to forget them. Make new ones while you read: select a passage and choose Cards."}
          </p>
          <div className="row gap">
            <button type="button" className="button primary" onClick={startMixed} disabled={quizLoading}>
              Mixed quiz
            </button>
            <a className="button" href="#/library">
              Read
            </a>
          </div>
        </div>
      ) : (
        <article className="flash" data-revealed={revealed || undefined}>
          <div className="flash-meta">
            <span
              className="eyebrow"
              title={
                card.state
                  ? `${card.state.phase} · seen ${card.state.reps}×${card.state.lapses ? ` · forgot ${card.state.lapses}×` : ""}`
                  : "new"
              }
            >
              {card.deck}
            </span>
            {asked && (
              <span className="flash-asked fine">
                Known for weeks, so asked a new way
                {!revealed && (
                  <button
                    type="button"
                    className="button subtle small"
                    onClick={() => {
                      setPlain(true);
                      revealButton.current?.focus();
                      announce("The card itself");
                    }}
                  >
                    Show the card
                  </button>
                )}
              </span>
            )}
          </div>
          <Markdown
            text={asked ? asked.question : card.front}
            theme={theme}
            className="flash-front"
            hideCloze={!revealed}
          />
          {typing && !revealed && (
            <textarea
              className="flash-typed"
              rows={3}
              // biome-ignore lint/a11y/noAutofocus: "type it first" was chosen: the field is the next step
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Recall it first: type your answer (⌘↵ to reveal)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) setRevealed(true);
              }}
            />
          )}
          {revealed ? (
            <>
              {typed && (
                <div className="flash-yours">
                  <span className="eyebrow">You wrote</span>
                  <p>{typed}</p>
                </div>
              )}
              <div className="flash-back">
                <Markdown text={asked ? asked.answer : card.back} theme={theme} />
              </div>
              {asked && (
                <div className="flash-card">
                  <span className="eyebrow">The card</span>
                  <Markdown text={card.front} theme={theme} />
                  <Markdown text={card.back} theme={theme} className="flash-card-back" />
                </div>
              )}
              {card.source?.bookId && (
                <a className="fine" href={bookLink(card.source)}>
                  From the book{card.source.quote ? `: “${card.source.quote.slice(0, 90)}…”` : ""}
                </a>
              )}
              <div className="ratings">
                {([1, 2, 3, 4] as const).map((r) => (
                  <button type="button" key={r} className="rating" data-rating={r} onClick={() => rate(r)}>
                    <span className="rating-label">{LABELS[r]}</span>
                    <span className="rating-when">{card.next ? humanInterval(card.next[r]) : ""}</span>
                    <kbd>{r}</kbd>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button
              type="button"
              className="button primary reveal"
              ref={revealButton}
              onClick={() => setRevealed(true)}
            >
              Show answer <kbd>space</kbd>
            </button>
          )}
        </article>
      )}
      {queue && card && <p className="fine center">{queue.length} left</p>}
    </div>
  );
}
