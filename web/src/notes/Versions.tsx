/* A note's saved versions (from the vault's jj history): pick one to read it as it was, see what that
 * version changed, and bring it back (as a new change, so the current text stays in the history). */
import { useEffect, useState } from "react";
import { learn, type NoteDetail, type Version } from "../api";
import { Spinner } from "../components/feedback";
import { Markdown } from "../components/Markdown";
import { Modal } from "../components/tools";
import { useIndicator } from "../components/ui";
import { announce } from "../lib/a11y";
import { timeAgo } from "../lib/time";

export function Versions({
  note,
  theme,
  onClose,
  onRestored,
}: {
  note: NoteDetail;
  theme: "light" | "dark";
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [picked, setPicked] = useState<Version | null>(null);
  const [shown, setShown] = useState<{ body: string; diff: string } | null>(null);
  const [view, setView] = useState<"text" | "changes">("text");
  const [error, setError] = useState<string | null>(null);
  const views = useIndicator<HTMLFieldSetElement>(`${view}:${picked?.commit}:${!!shown}`);
  useEffect(() => {
    learn.noteVersions(note.id).then(setVersions, (e) => setError((e as Error).message));
  }, [note.id]);
  useEffect(() => {
    if (!picked) return;
    setShown(null);
    learn.noteVersion(note.id, picked.commit).then(setShown, (e) => setError((e as Error).message));
  }, [note.id, picked]);
  return (
    <Modal title={`Versions of “${note.title}”`} eyebrow="History" onClose={onClose} wide>
      {error && <p className="form-error">{error}</p>}
      {!versions ? (
        <Spinner label="Reading the history" />
      ) : versions.length === 0 ? (
        <p className="fine">
          No saved versions yet. Changes are saved a few minutes after you stop, and before the agent changes anything.
        </p>
      ) : (
        <div className="versions">
          <ul className="versions-list" aria-label="Saved versions, newest first">
            {versions.map((v) => (
              <li key={v.commit}>
                <button
                  type="button"
                  aria-pressed={picked?.commit === v.commit}
                  onClick={() => setPicked(v)}
                  title={new Date(v.when).toLocaleString()}
                >
                  <span className="versions-when">{timeAgo(v.when)}</span>
                  <span className="versions-what">{v.subject}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="versions-view">
            {!picked ? (
              <p className="fine">Pick a version to read it as it was.</p>
            ) : !shown ? (
              <Spinner label="Opening that version" />
            ) : (
              <>
                <div className="row gap">
                  <fieldset className="segmented" ref={views}>
                    <legend className="visually-hidden">Show</legend>
                    <button type="button" aria-pressed={view === "text"} onClick={() => setView("text")}>
                      As it was
                    </button>
                    <button type="button" aria-pressed={view === "changes"} onClick={() => setView("changes")}>
                      What changed
                    </button>
                  </fieldset>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="button primary"
                    onClick={async () => {
                      try {
                        await learn.restoreNote(note.id, picked.commit);
                        announce("Brought back that version");
                        onRestored();
                        onClose();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Bring this version back
                  </button>
                </div>
                {view === "text" ? (
                  <Markdown text={shown.body} theme={theme} className="note-read versions-text" base={note.path} />
                ) : (
                  <pre className="run-diff">{shown.diff || "(no changes to this note in that version)"}</pre>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
