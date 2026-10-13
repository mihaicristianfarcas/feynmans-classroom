import { learn } from "./api";
import { Mastery, Spinner, timeAgo, useLoad } from "./Shell";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** The learning journey: when you studied, how much stays, which concepts are solid and which fade. */
export function Journey() {
  const { data } = useLoad(() => learn.journey());
  const { data: vault } = useLoad(() => learn.vault());
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
    <div className="journey">
      <header className="page-head">
        <h1 className="page-title">Your journey</h1>
        <p className="lede small">What you've studied, how much of it stays, and where to go next.</p>
      </header>
      <section className="tiles">
        <div className="tile">
          <span className="tile-label">Streak</span>
          <span className="tile-number">{data.streak}</span>
          <span className="tile-detail">day{data.streak === 1 ? "" : "s"} in a row</span>
        </div>
        <div className="tile">
          <span className="tile-label">Recall now</span>
          <span className="tile-number">{pct(data.retention.now)}</span>
          <span className="tile-detail">predicted, across reviewed cards</span>
        </div>
        <div className="tile">
          <span className="tile-label">Last 30 days</span>
          <span className="tile-number">{pct(data.retention.month)}</span>
          <span className="tile-detail">of reviews recalled</span>
        </div>
        <div className="tile">
          <span className="tile-label">Concepts</span>
          <span className="tile-number">{known.filter((m) => m.mastery! >= 0.8).length}</span>
          <span className="tile-detail">solid of {data.totals.concepts}</span>
        </div>
      </section>
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
        <p className="fine">
          {data.totals.reviews} reviews · {data.totals.cards} cards ({data.retention.mature} mature,{" "}
          {data.retention.learning} learning, {data.retention.unseen} new) · {data.totals.notes} notes ·{" "}
          {data.totals.figures} figures · {data.totals.books} books
        </p>
      </section>
      <div className="concept-grid">
        <section>
          <h2 className="section-title">Concepts by recall</h2>
          {known.length ? (
            <ul className="plain mastery-list">
              {data.mastery.map((m) => (
                <li key={m.id}>
                  <a href={`#/brain/concept/${m.id}`}>{m.name}</a>
                  <Mastery value={m.mastery} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="fine">Recall shows up once you review cards or explain concepts.</p>
          )}
        </section>
        <section>
          <h2 className="section-title">Timeline</h2>
          <ul className="activity">
            {data.recent.map((a, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: a read-only list, replaced whole when it reloads
                key={i}
              >
                <span className="activity-type">{a.type}</span>
                <span className="activity-text">{a.text}</span>
                <span className="activity-when">{timeAgo(a.ts)}</span>
              </li>
            ))}
            {!data.recent.length && <li className="fine">Your journey starts with the first book you open.</li>}
          </ul>
          {vault?.git && vault.history.length > 0 && (
            <>
              <h2 className="section-title">Vault history</h2>
              <ul className="history">
                {vault.history.slice(0, 10).map((h) => (
                  <li key={h.hash}>
                    <code>{h.hash}</code> <span>{h.subject}</span> <span className="muted">{timeAgo(h.when)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
