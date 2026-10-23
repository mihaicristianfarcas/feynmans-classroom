/* The Journey page: how much you study and how much of it stays. A few numbers (with a streak you can
 * pause for a break), your study days over the last six months, and your concepts from best to least
 * known. */
import { useEffect, useRef, useState } from "react";
import { type Journey as JourneyData, learn } from "../api";
import { Mastery, Spinner } from "../components/feedback";
import { announce } from "../lib/a11y";
import { useLoad } from "../lib/useLoad";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
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
        Pause your streak and the days you're away won't break it. It counts the days you study, nothing more.
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
  const { data, setData } = useLoad(() => learn.journey());
  if (!data)
    return (
      <div className="center-note">
        <Spinner label="Opening your journey" />
      </div>
    );
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
  const known = data.mastery.filter((m) => m.mastery !== null);
  return (
    <div className="journey rise">
      <h1 className="page-title">Journey</h1>
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
        <div className="heatmap" style={{ gridTemplateColumns: `repeat(${Math.ceil(cells.length / 7)}, 1fr)` }}>
          {cells.map((c) => (
            <span
              key={c.key}
              className="heat"
              title={`${c.date.toDateString()}: ${data.days[c.key] ? `${data.days[c.key].reviews} reviews, ${data.days[c.key].events} activities` : "nothing"}`}
              data-level={c.value === 0 ? 0 : Math.min(4, 1 + Math.floor((c.value / max) * 3.999))}
            />
          ))}
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
  );
}
