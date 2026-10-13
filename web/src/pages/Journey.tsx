/* The Journey page: how much you study and how much of it stays. A few numbers, your study days over
 * the last six months, and your concepts from best to least known. */
import { learn } from "../api";
import { Mastery, Spinner } from "../components/feedback";
import { useLoad } from "../lib/useLoad";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function Journey() {
  const { data } = useLoad(() => learn.journey());
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
                <a href={`#/brain?focus=concept:${encodeURIComponent(m.id)}`}>{m.name}</a>
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
