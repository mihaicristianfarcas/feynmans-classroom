/* The Journey page: how much you study and how much of it stays. A few numbers (with a streak you can
 * pause for a break), your study days over the last six months (the months named over them, and a key),
 * and your concepts from best to least known; beside them, what you've made so far and what you did
 * lately. */
import {
  BookOpen,
  Brain,
  Highlighter,
  Layers,
  Link2,
  ListChecks,
  type LucideIcon,
  MessageCircleQuestion,
  NotebookPen,
  Plus,
  Shapes,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Activity, type Journey as JourneyData, learn } from "../api";
import { Mastery } from "../components/feedback";
import { PageSkeleton } from "../components/Skeletons";
import { announce } from "../lib/a11y";
import { timeAgo } from "../lib/time";
import { useLoad } from "../lib/useLoad";

/** Each kind of thing done, by its icon and pastel. */
const DONE: Partial<Record<Activity["type"], { icon: LucideIcon; tone: string }>> = {
  read: { icon: BookOpen, tone: "peach" },
  review: { icon: Layers, tone: "butter" },
  note: { icon: Sparkles, tone: "lavender" },
  explain: { icon: Sparkles, tone: "lavender" },
  ask: { icon: MessageCircleQuestion, tone: "lavender" },
  highlight: { icon: Highlighter, tone: "butter" },
  card: { icon: Layers, tone: "butter" },
  figure: { icon: Shapes, tone: "peach" },
  quiz: { icon: ListChecks, tone: "sky" },
  connect: { icon: Link2, tone: "sky" },
  concept: { icon: Brain, tone: "sage" },
  book: { icon: Plus, tone: "sage" },
};

const pct = (v: number | null) => (v === null ? <span>Not yet</span> : `${Math.round(v * 100)}%`);
/** "Friday, 31 October" for a day's key (YYYY-MM-DD). */
const longDate = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

/** Pausing the streak for a break, so the days away don't break it; while paused, until when. */
function StreakPause({ until, onPaused }: { until: string | null; onPaused: (journey: JourneyData) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const note = useRef<HTMLParagraphElement>(null);
  // the buttons are gone once it is paused: the focus goes to the line that says so
  useEffect(() => {
    if (paused && until) note.current?.focus();
  }, [paused, until]);
  if (until)
    return (
      <p className="fine streak-pause" ref={note} tabIndex={-1}>
        Your streak is paused until {longDate(until)}. The days you study still count.
      </p>
    );
  const pause = async (days: number) => {
    setBusy(true);
    setError(null);
    try {
      const journey = await learn.pauseStreak(days);
      onPaused(journey);
      setPaused(true);
      if (journey.pausedUntil) announce(`Streak paused until ${longDate(journey.pausedUntil)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="disclosure streak-pause">
      <summary>Taking a break?</summary>
      <p className="fine">
        Pause your streak and the days you’re away won’t break it. It counts the days you study, nothing more.
      </p>
      <div className="row gap">
        {(
          [
            [3, "3 days"],
            [7, "A week"],
            [14, "Two weeks"],
          ] as const
        ).map(([days, label]) => (
          <button key={days} type="button" className="button small" disabled={busy} onClick={() => pause(days)}>
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}

export function Journey() {
  const { data, setData } = useLoad(() => learn.journey(), [], "journey");
  if (!data) return <PageSkeleton page="journey" title="Journey" />;
  const weeks = 26;
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1) - start.getDay());
  const cells: { key: string; date: Date; value: number }[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = data.days[key];
    cells.push({ key, date: new Date(d), value: day ? day.reviews + day.events * 2 + day.minutes : 0 });
  }
  const max = Math.max(1, ...cells.map((c) => c.value));
  const columns = Math.ceil(cells.length / 7);
  // each month named over the week it begins in
  const months: { col: number; name: string }[] = [];
  for (let col = 0; col < columns; col++) {
    const first = cells[col * 7]?.date;
    if (first && (col === 0 || first.getDate() <= 7))
      months.push({ col, name: first.toLocaleDateString(undefined, { month: "short" }) });
  }
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
  const known = data.mastery.filter((m) => m.mastery !== null);
  const totals: [string, number][] = [
    ["Books", data.totals.books],
    ["Notes", data.totals.notes],
    ["Cards", data.totals.cards],
    ["Figures", data.totals.figures],
    ["Concepts", data.totals.concepts],
    ["Reviews", data.totals.reviews],
  ];
  const lately = data.recent.filter((a) => a.type !== "pause").slice(0, 6);
  return (
    <div className="journey rise">
      <header className="page-head">
        <h1 className="page-title">Journey</h1>
      </header>
      <div className="journey-grid">
        <div className="journey-main">
          <dl className="stats">
            <div>
              <dt>Streak</dt>
              <dd>
                {data.streak} <span>day{data.streak === 1 ? "" : "s"}</span>
              </dd>
            </div>
            <div>
              <dt>Recall now</dt>
              <dd>{pct(data.retention.now)}</dd>
            </div>
            <div>
              <dt>Recalled, last 30 days</dt>
              <dd>{pct(data.retention.month)}</dd>
            </div>
            <div>
              <dt>Solid concepts</dt>
              <dd>
                {known.filter((m) => m.mastery! >= 0.8).length} <span>of {data.totals.concepts}</span>
              </dd>
            </div>
          </dl>
          <StreakPause until={data.pausedUntil} onPaused={setData} />
          <section>
            <h2 className="section-title">Study days</h2>
            <div className="heatmap-wrap">
              <div
                className="heat-months"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
                aria-hidden="true"
              >
                {months.map((m) => (
                  <span key={m.col} style={{ gridColumn: `${m.col + 1} / span 4` }}>
                    {m.name}
                  </span>
                ))}
              </div>
              <div className="heatmap" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                {cells.map((c) => (
                  <span
                    key={c.key}
                    className="heat"
                    title={`${c.date.toDateString()}: ${data.days[c.key] ? `${data.days[c.key].reviews} reviews, ${data.days[c.key].events} activities` : "nothing"}`}
                    data-level={c.value === 0 ? 0 : Math.min(4, 1 + Math.floor((c.value / max) * 3.999))}
                  />
                ))}
              </div>
              <div className="heat-key" aria-hidden="true">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((l) => (
                  <span key={l} className="heat" data-level={l} />
                ))}
                <span>More</span>
              </div>
            </div>
          </section>
          <section>
            <h2 className="section-title">Concepts by recall</h2>
            {known.length ? (
              <ul className="plain mastery-list">
                {data.mastery.map((m) => (
                  <li key={m.id}>
                    <a href={`#/brain?focus=concept:${encodeURIComponent(m.id)}`}>{m.title}</a>
                    <Mastery value={m.mastery} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="fine">Recall shows up once you review cards or explain concepts.</p>
            )}
          </section>
        </div>
        <aside className="journey-side" aria-label="What you've made and done">
          <section className="side-panel">
            <h2 className="panel-title">So far</h2>
            <dl className="totals">
              {totals.map(([name, n]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{n}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="side-panel">
            <h2 className="panel-title">Lately</h2>
            {lately.length ? (
              <ul className="lately">
                {lately.map((a) => {
                  const { icon: Icon, tone } = DONE[a.type] ?? { icon: NotebookPen, tone: "sky" };
                  const body = (
                    <>
                      <Icon className="lately-icon" data-tone={tone} aria-hidden="true" />
                      <span className="lately-text">
                        <span className="lately-what">{a.text}</span>
                        <span className="lately-when">{timeAgo(a.ts)}</span>
                      </span>
                    </>
                  );
                  return (
                    <li key={`${a.ts}-${a.type}`}>
                      {a.bookId ? (
                        <a className="lately-row" href={`#/book/${a.bookId}`}>
                          {body}
                        </a>
                      ) : (
                        <span className="lately-row">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="side-detail">What you read, make and review shows up here.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
