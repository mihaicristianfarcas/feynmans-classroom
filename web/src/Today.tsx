import { useState } from "react";
import { go, learn } from "./api";
import { Spinner, timeAgo, useLoad } from "./Shell";

const KIND_MARK: Record<string, string> = { review: "↻", explain: "✎", read: "▤", quiz: "?", mixed: "⇄" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function Today() {
  const { data, error } = useLoad(() => learn.today());
  const { data: journey } = useLoad(() => learn.journey());
  const [question, setQuestion] = useState("");
  if (error) return <div className="center-note">Could not load today: {error}</div>;
  if (!data) return <div className="center-note"><Spinner label="Opening" /></div>;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const waiting = data.queue.due + data.queue.learning + data.queue.fresh;
  return (
    <div className="today">
      <header className="page-head">
        <h1 className="page-title">
          {greeting}
          {data.profile.name ? `, ${data.profile.name}` : ""}.
        </h1>
        {journey && (
          <p className="lede small">
            {journey.streak > 0 ? `${journey.streak}-day streak. ` : ""}
            {plural(journey.totals.concepts, "concept")} in your graph, {plural(journey.totals.cards, "card")}, {plural(journey.totals.notes, "note")}.
          </p>
        )}
      </header>

      <form
        className="ask-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) go(`#/ask?q=${encodeURIComponent(question.trim())}`);
        }}
      >
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask your library anything…" aria-label="Ask your library" />
        <button className="button" type="submit">Ask</button>
      </form>

      <section className="tiles">
        <a className="tile big" href="#/review" data-empty={waiting === 0 || undefined}>
          <span className="tile-label">Review</span>
          <span className="tile-number">{waiting}</span>
          <span className="tile-detail">{waiting ? `${data.queue.due} due · ${data.queue.learning} learning · ${data.queue.fresh} new` : data.queue.total ? "All caught up. Come back later." : "Make cards while you read: select a passage → Cards."}</span>
        </a>
        {!data.books.length && (
          <a className="tile" href="#/library">
            <span className="tile-label">Start here</span>
            <span className="tile-title">Add your first book</span>
            <span className="tile-detail">A PDF, EPUB, Markdown or text file: a textbook, a paper, lecture notes.</span>
          </a>
        )}
        {data.books[0] && (
          <a className="tile" href={`#/book/${data.books[0].id}`}>
            <span className="tile-label">Continue reading</span>
            <span className="tile-title">{data.books[0].title}</span>
            <span className="tile-detail">{data.books[0].chapter ? `${data.books[0].chapter} · ` : ""}{timeAgo(data.books[0].lastTs)}</span>
          </a>
        )}
        <a className="tile" href="#/brain">
          <span className="tile-label">Your brain</span>
          <span className="tile-title">Knowledge graph</span>
          <span className="tile-detail">See how your concepts connect, and which are fading.</span>
        </a>
      </section>

      {data.suggestions.length > 0 && (
        <section>
          <h2 className="section-title">Suggested next</h2>
          <ul className="suggestions">
            {data.suggestions.map((s, i) => (
              <li key={i}>
                <a className="suggestion" href={`${s.action.route}${Object.keys(s.action).length > 1 ? `?${new URLSearchParams(Object.fromEntries(Object.entries(s.action).filter(([k]) => k !== "route")))}` : ""}`}>
                  <span className="suggestion-mark" aria-hidden="true">{KIND_MARK[s.kind] || "◆"}</span>
                  <span>
                    <span className="suggestion-title">{s.title}</span>
                    <span className="suggestion-detail">{s.detail}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.books.length > 1 && (
        <section>
          <h2 className="section-title">Your books</h2>
          <div className="book-strip">
            {data.books.map((b) => (
              <a key={b.id} className="book-chip" href={`#/book/${b.id}`}>
                <span className="book-format">{b.format}</span>
                <span className="book-title">{b.title}</span>
                {b.author && <span className="book-author">{b.author}</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {journey && journey.recent.length > 0 && (
        <section>
          <h2 className="section-title">Recently</h2>
          <ul className="activity">
            {journey.recent.slice(0, 8).map((a, i) => (
              <li key={i}>
                <span className="activity-type">{a.type}</span>
                <span className="activity-text">{a.text}</span>
                <span className="activity-when">{timeAgo(a.ts)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
