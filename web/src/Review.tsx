import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { humanInterval } from "../../shared/fsrs.ts";
import { bookLink, learn, type CardView, type Quiz } from "./api";
import { Markdown } from "./Markdown";
import { QuizRunner } from "./Quiz";
import { Spinner, useLoad } from "./Shell";

const LABELS: Record<1 | 2 | 3 | 4, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

export function Review({ theme }: { theme: "light" | "dark" }) {
  const query = new URLSearchParams(location.hash.split("?")[1] || "");
  const [deck, setDeck] = useState(query.get("deck") || "");
  const { data: decks } = useLoad(() => learn.decks());
  const [queue, setQueue] = useState<CardView[] | null>(null);
  const [stats, setStats] = useState({ done: 0, again: 0 });
  const [revealed, setRevealed] = useState(false);
  const [typing, setTyping] = useState(() => localStorage.getItem("classroom-type-answers") === "1");
  const [typed, setTyped] = useState("");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const shownAt = useRef(Date.now());

  const load = useCallback(() => {
    setQueue(null);
    learn.queue(deck || undefined).then((q) => setQueue(q.cards));
  }, [deck]);
  useEffect(load, [load]);
  useEffect(() => {
    if (query.get("mixed")) startMixed();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const card = queue?.[0];
  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
    setTyped("");
  }, [card?.id]);

  const rate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!card) return;
      const took = Math.round((Date.now() - shownAt.current) / 1000);
      const updated = await learn.rate(card.id, rating, took);
      setStats((s) => ({ done: s.done + 1, again: s.again + (rating === 1 ? 1 : 0) }));
      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        // a card that comes back within the session goes a few cards later
        if (updated.state && updated.state.due - Date.now() < 20 * 60000) rest.splice(Math.min(rest.length, 3), 0, updated);
        return rest;
      });
      window.dispatchEvent(new Event("classroom:reviewed"));
    },
    [card],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !(e.key === "Enter" && (e.metaKey || e.ctrlKey))) return;
      if (!card || quiz) return;
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
      <header className="page-head row">
        <h1 className="page-title">Review</h1>
        <span className="spacer" />
        <select value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="Deck">
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
        <button className="button" onClick={startMixed} disabled={quizLoading}>
          {quizLoading ? <Spinner label="Writing a quiz" /> : "Mixed quiz"}
        </button>
      </header>
      <div className="quiz-progress">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      {!queue ? (
        <div className="center-note">
          <Spinner label="Gathering your cards" />
        </div>
      ) : !card ? (
        <div className="review-done">
          <h2 className="section-title">{stats.done ? `Done: ${stats.done} reviews` : "Nothing due right now."}</h2>
          <p className="lede small">
            {stats.done
              ? `You recalled ${Math.round(((stats.done - stats.again) / stats.done) * 100)}% on the first try. The scheduler will bring each card back just before you'd forget it.`
              : "Cards come back when you're about to forget them. Make new ones while you read: select a passage and choose Cards."}
          </p>
          <div className="row gap">
            <button className="button primary" onClick={startMixed} disabled={quizLoading}>
              Mixed quiz across your topics
            </button>
            <a className="button" href="#/library">
              Read
            </a>
          </div>
        </div>
      ) : (
        <article className="flash" data-revealed={revealed || undefined}>
          <div className="flash-meta">
            <span className="eyebrow">{card.deck}</span>
            <span className="fine">{card.state ? `${card.state.phase} · seen ${card.state.reps}×${card.state.lapses ? ` · forgot ${card.state.lapses}×` : ""}` : "new"}</span>
          </div>
          <Markdown text={card.front} theme={theme} className="flash-front" hideCloze={!revealed} />
          {typing && !revealed && (
            <textarea
              className="flash-typed"
              rows={3}
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
                <Markdown text={card.back} theme={theme} />
              </div>
              {card.source?.bookId && (
                <a className="fine" href={bookLink(card.source)}>
                  From the book{card.source.quote ? `: “${card.source.quote.slice(0, 90)}…”` : ""}
                </a>
              )}
              <div className="ratings">
                {([1, 2, 3, 4] as const).map((r) => (
                  <button key={r} className="rating" data-rating={r} onClick={() => rate(r)}>
                    <span className="rating-label">{LABELS[r]}</span>
                    <span className="rating-when">{card.next ? humanInterval(card.next[r]) : ""}</span>
                    <kbd>{r}</kbd>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="button primary reveal" onClick={() => setRevealed(true)}>
              Show answer <kbd>space</kbd>
            </button>
          )}
        </article>
      )}
      {queue && card && <p className="fine center">{queue.length} left in this session · {stats.done} done</p>}
    </div>
  );
}
