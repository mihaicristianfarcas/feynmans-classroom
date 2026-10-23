/* Today: a greeting and the date, a field for the agent (ask your library anything, or tell it what to
 * do), the book you were reading (its cover, where you were, how far through, and a button to carry
 * on) with the others you've started under it, and the few other things worth doing next; beside them,
 * what's waiting in Review and the week's study days with your streak. With no book yet, the book to
 * add is the page's one thing: choose a file or drop one on it. */
import { ArrowRight, ArrowUp, Layers, ListChecks, type LucideIcon, Shuffle, Sparkles } from "lucide-react";
import { useState } from "react";
import { openAgent } from "../agent/store";
import { type Journey, learn, type Today as TodayData } from "../api";
import { ahead } from "../app/pages";
import { BookCover, Meter, progressText } from "../components/BookCover";
import { Spinner } from "../components/feedback";
import { TodaySkeleton } from "../components/Skeletons";
import { BOOK_FORMATS, useBookUpload } from "../lib/useBookUpload";
import { useLoad } from "../lib/useLoad";
import { under, useVaultEvents } from "../lib/useVaultEvents";

/** Each kind of suggestion keeps its pastel and an icon: lavender to explain, sky for a quiz, and so on. */
const KIND: Record<string, { tone: string; icon: LucideIcon }> = {
  explain: { tone: "lavender", icon: Sparkles },
  quiz: { tone: "sky", icon: ListChecks },
  mixed: { tone: "sage", icon: Shuffle },
  review: { tone: "butter", icon: Layers },
};

/** A day's key in the journey (YYYY-MM-DD, local). */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function Today() {
  const { data, error, reload } = useLoad(() => learn.today(), [], "today");
  const { data: journey, reload: reloadJourney } = useLoad(() => learn.journey(), [], "journey");
  useVaultEvents(
    () => {
      reload();
      reloadJourney();
    },
    under("cards/", "notes/", "concepts/"),
  );
  if (error) return <div className="center-note">Could not load today: {error}</div>;
  if (!data) return <TodaySkeleton />;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const [reading, ...others] = data.books;
  const next = data.suggestions
    .filter((s) => s.kind !== "read" && s.kind !== "review")
    .map((s) => {
      const { route, ...query } = s.action;
      const params = new URLSearchParams(query).toString();
      return { title: s.title, detail: s.detail, href: `${route}${params ? `?${params}` : ""}`, kind: s.kind };
    });
  return (
    <div className="today rise">
      <header className="today-head">
        <h1 className="today-greeting">
          {greeting}
          {data.profile.name ? `, ${data.profile.name}` : ""}.
        </h1>
        <p className="today-date">
          {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>
      <AskBar />
      <ReviewRow queue={data.queue} />
      <div className="today-grid">
        <div className="today-main">
          {reading ? (
            <section aria-labelledby="reading-title">
              <h2 className="today-label" id="reading-title">
                Continue reading
              </h2>
              <a className="resume" href={`#/book/${reading.id}`} {...ahead("#/book")}>
                <BookCover id={reading.id} title={reading.title} author={reading.author} size="small" hidden />
                <span className="resume-text">
                  <span className="resume-title">{reading.title}</span>
                  {reading.author && <span className="resume-author">{reading.author}</span>}
                  {reading.chapter ? (
                    <span className="resume-where">{reading.chapter}</span>
                  ) : !reading.progress ? (
                    <span className="resume-where">From the beginning</span>
                  ) : null}
                  <span className="resume-progress">
                    <Meter value={reading.progress?.fraction ?? 0} />
                    <span>{progressText(reading.progress, true)}</span>
                  </span>
                  <span className="button primary resume-go">
                    {reading.progress ? "Carry on reading" : "Start reading"}
                    <ArrowRight aria-hidden="true" />
                  </span>
                </span>
              </a>
              {others.length > 0 && (
                <ul className="also-reading" aria-label="Your other books">
                  {others.slice(0, 3).map((b) => (
                    <li key={b.id}>
                      <a href={`#/book/${b.id}`} className="also-row">
                        <BookCover id={b.id} title={b.title} size="tiny" />
                        <span className="also-text">
                          <span className="also-title">{b.title}</span>
                          <span className="also-meta">
                            <Meter value={b.progress?.fraction ?? 0} />
                            {progressText(b.progress)}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                  {others.length > 3 && (
                    <li>
                      <a href="#/library" className="also-more">
                        All {data.books.length} books
                      </a>
                    </li>
                  )}
                </ul>
              )}
            </section>
          ) : (
            <FirstBook onAdded={reload} />
          )}
          {next.length > 0 && (
            <section className="next" aria-labelledby="next-title">
              <h2 className="today-label" id="next-title">
                Up next
              </h2>
              <ul className="next-list stagger">
                {next.map((item) => {
                  const { tone, icon: Icon } = KIND[item.kind] ?? KIND.explain;
                  return (
                    <li key={item.href + item.title}>
                      <a className="next-row" href={item.href}>
                        <Icon className="next-icon" data-tone={tone} aria-hidden="true" />
                        <span className="next-text">
                          <span className="next-title">{item.title}</span>
                          <span className="next-detail">{item.detail}</span>
                        </span>
                        <ArrowRight className="next-go" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <aside className="today-side" aria-label="Your study">
          <ReviewPanel queue={data.queue} />
          {journey && <WeekPanel journey={journey} />}
        </aside>
      </div>
    </div>
  );
}

function AskBar() {
  const [question, setQuestion] = useState("");
  return (
    <form
      className="ask-bar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!question.trim()) return;
        openAgent({ text: question.trim(), send: true });
        setQuestion("");
      }}
    >
      <Sparkles className="ask-icon" aria-hidden="true" />
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask your library anything, or tell the agent what to do…"
        aria-label="Ask or tell the agent"
      />
      <button className="icon-button ask-send" type="submit" aria-label="Send" disabled={!question.trim()}>
        <ArrowUp aria-hidden="true" />
      </button>
    </form>
  );
}

/** On a narrow screen, where the side column falls below the books: what Review holds, as one row near the top. */
function ReviewRow({ queue }: { queue: TodayData["queue"] }) {
  const waiting = queue.due + queue.learning + queue.fresh;
  if (!waiting) return null;
  return (
    <a className="review-row" href="#/review" {...ahead("#/review")}>
      <Layers className="next-icon" data-tone="butter" aria-hidden="true" />
      <span className="review-row-text">
        Review <strong>{waiting}</strong> card{waiting === 1 ? "" : "s"} waiting
      </span>
      <ArrowRight className="next-go" aria-hidden="true" />
    </a>
  );
}

/** What Review holds: how many cards wait (new ones and ones due), and the way in. */
function ReviewPanel({ queue }: { queue: TodayData["queue"] }) {
  const waiting = queue.due + queue.learning + queue.fresh;
  const parts = [
    queue.due + queue.learning ? `${queue.due + queue.learning} due` : "",
    queue.fresh ? `${queue.fresh} new` : "",
  ].filter(Boolean);
  return (
    <section className="side-panel review-panel" aria-labelledby="review-panel-title">
      <h2 className="panel-title" id="review-panel-title">
        Review
      </h2>
      {waiting ? (
        <>
          <p className="side-number">
            {waiting} <span>card{waiting === 1 ? "" : "s"} waiting</span>
          </p>
          <p className="side-detail">{parts.join(", ")}. A few minutes keeps them.</p>
          <a className="button primary side-action" href="#/review" {...ahead("#/review")}>
            Start reviewing
          </a>
        </>
      ) : (
        <>
          <p className="side-number">
            All done <span>for now</span>
          </p>
          <p className="side-detail">
            {queue.total
              ? "Each card comes back just before you'd forget it."
              : "Make cards while you read: select a passage and choose Cards."}
          </p>
          {queue.total > 0 && (
            <a className="button side-action" href="#/review?mixed=1">
              Mixed quiz
            </a>
          )}
        </>
      )}
    </section>
  );
}

/** The last seven days, each marked if you studied, today ringed; the streak under them. */
function WeekPanel({ journey }: { journey: Journey }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const day = journey.days[dayKey(d)];
    return { d, key: dayKey(d), studied: !!day && day.reviews + day.events + day.minutes > 0 };
  });
  const studied = days.filter((d) => d.studied).length;
  return (
    <section className="side-panel" aria-labelledby="week-title">
      <h2 className="panel-title" id="week-title">
        This week
      </h2>
      <ol className="week" aria-label={`Studied ${studied} of the last 7 days`}>
        {days.map((day, i) => (
          <li
            key={day.key}
            className="week-day"
            data-studied={day.studied || undefined}
            data-today={i === 6 || undefined}
            title={`${day.d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}: ${day.studied ? "studied" : "nothing yet"}`}
          >
            <span className="week-dot" aria-hidden="true" />
            <span className="week-name" aria-hidden="true">
              {day.d.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
          </li>
        ))}
      </ol>
      <p className="side-detail">
        {journey.streak
          ? `${journey.streak}-day streak${journey.pausedUntil ? ", paused for a break" : ""}.`
          : "Study today to start a streak."}{" "}
        <a href="#/journey" {...ahead("#/journey")}>
          Your journey
        </a>
      </p>
    </section>
  );
}

/** No book yet: choose one, or drop it here. */
function FirstBook({ onAdded }: { onAdded: () => void }) {
  const add = useBookUpload(onAdded);
  return (
    <section className="first-book" data-dragging={add.dragging || undefined} {...add.dropTarget}>
      <h2 className="first-book-title">Bring in a hard book</h2>
      <p className="side-detail">
        Read it beside a margin that explains, draws and quizzes. {BOOK_FORMATS}: choose one, or drop it here.
      </p>
      <input {...add.field} />
      <button type="button" className="button primary" onClick={add.choose} disabled={!!add.uploading}>
        {add.uploading ? <Spinner label={`Reading “${add.uploading}”`} /> : "Choose a book"}
      </button>
      {add.error && (
        <p className="form-error" role="alert">
          {add.error}
        </p>
      )}
    </section>
  );
}
