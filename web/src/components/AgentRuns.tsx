/* Ask an agent to work on the vault. It writes in its own jj workspace inside the CLI's sandbox; the
 * changes land after the checks, after whatever you did meanwhile, and every run can be undone. */
import { useEffect, useState } from "react";
import { type AgentRun, learn } from "../api";
import { timeAgo } from "../lib/time";
import { Spinner } from "./feedback";
import { Markdown } from "./Markdown";

const EXAMPLES = [
  "Turn my highlights and explanations from the last chapter I read into one summary note, linked to the concepts it mentions",
  "Find notes that say the same thing and propose merging them",
  "Write a note comparing how my books explain consistency, citing pages",
  "Add [[links]] to concepts that my notes mention but don't link",
];

const STATUS: Record<AgentRun["status"], string> = {
  running: "Working",
  review: "Waiting for your OK",
  merged: "Done · in your vault",
  discarded: "Discarded",
  failed: "Failed",
  undone: "Undone",
  done: "Done · nothing changed",
};

export function AgentRuns({ theme }: { theme: "light" | "dark" }) {
  const [task, setTask] = useState("");
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, string>>({});
  useEffect(() => {
    learn.agents().then(setRuns, (e) => setError(e.message));
    const source = new EventSource("/api/events");
    source.addEventListener("agent", (e) => {
      const run = JSON.parse((e as MessageEvent).data) as AgentRun;
      setRuns((list) =>
        [run, ...(list || []).filter((r) => r.id !== run.id)].sort((a, b) => b.started.localeCompare(a.started)),
      );
    });
    return () => source.close();
  }, []);
  const busy = runs?.some((r) => r.status === "running");
  const act = async (run: AgentRun, action: "approve" | "discard" | "undo") => {
    setError(null);
    try {
      await learn.agentAction(run.id, action);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="agent-runs">
      <form
        className="agent-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!task.trim()) return;
          setError(null);
          try {
            await learn.runAgent(task.trim());
            setTask("");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <textarea
          rows={3}
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="What should the agent do in your vault?"
          disabled={busy}
        />
        <div className="row gap">
          <span className="fine">Works on its own copy of your vault, offline. Every run can be undone.</span>
          <span className="spacer" />
          <button className="button primary" type="submit" disabled={busy || task.trim().length < 8}>
            {busy ? "Working…" : "Start"}
          </button>
        </div>
        {!task && runs?.length === 0 && (
          <div className="starters">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" className="chip" onClick={() => setTask(x)}>
                {x}
              </button>
            ))}
          </div>
        )}
      </form>
      {error && <p className="form-error">{error}</p>}
      {!runs ? (
        <Spinner label="Loading" />
      ) : (
        runs.map((run) => (
          <article key={run.id} className="run" data-status={run.status}>
            <header className="row gap">
              <span className="eyebrow">{STATUS[run.status]}</span>
              <span className="fine">
                {timeAgo(run.started)}
                {run.ms ? ` · ${Math.round(run.ms / 1000)} s` : ""}
                {run.model ? ` · ${run.model}` : ""}
              </span>
              <span className="spacer" />
              {run.status === "review" && (
                <>
                  <button type="button" className="button primary" onClick={() => act(run, "approve")}>
                    Apply
                  </button>
                  <button type="button" className="button" onClick={() => act(run, "discard")}>
                    Discard
                  </button>
                </>
              )}
              {run.status === "merged" && (
                <button
                  type="button"
                  className="button"
                  onClick={() => act(run, "undo")}
                  title="Take this run's change out of the vault"
                >
                  Undo
                </button>
              )}
            </header>
            <p className="run-task">{run.task}</p>
            {run.status === "running" && (
              <Spinner label={run.activity || "Working"} since={new Date(run.started).getTime()} />
            )}
            {run.review && (
              <ul className="run-review">
                {run.review.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {run.error && <p className="form-error">{run.error}</p>}
            {run.answer && <Markdown text={run.answer} theme={theme} className="run-answer" />}
            {run.files && run.files.length > 0 && (
              <details
                onToggle={(e) => {
                  if ((e.target as HTMLDetailsElement).open && diffs[run.id] === undefined)
                    learn.agentDiff(run.id).then(
                      (d) => setDiffs((m) => ({ ...m, [run.id]: d.diff })),
                      () => {},
                    );
                }}
              >
                <summary className="fine">
                  {run.files.length} file{run.files.length === 1 ? "" : "s"}:{" "}
                  {run.files.map((f) => `${f.change} ${f.path.split("/").pop()}`).join(", ")}
                </summary>
                <ul className="run-files">
                  {run.files.map((f) => (
                    <li key={f.path}>
                      <code>{f.change}</code>{" "}
                      {f.change !== "D" && f.path.endsWith(".md") ? (
                        <a href={`#/open?target=${encodeURIComponent(f.path.replace(/\.md$/, ""))}`}>{f.path}</a>
                      ) : (
                        f.path
                      )}
                    </li>
                  ))}
                </ul>
                {diffs[run.id] !== undefined && <pre className="run-diff">{diffs[run.id] || "(no diff)"}</pre>}
              </details>
            )}
          </article>
        ))
      )}
    </div>
  );
}
