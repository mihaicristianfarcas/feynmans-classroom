/* Your figures (#/library/figures): the ones drawn from notes and concepts, with a field to draw one of
 * any idea. Figures drawn in a book stay beside its text. */
import { Shapes, Trash2 } from "lucide-react";
import { useState } from "react";
import { learn } from "../api";
import { Spinner } from "../components/feedback";
import { FigureMaker } from "../components/tools";
import { useLoad } from "../lib/useLoad";
import { SceneView } from "../scene/SceneView";

export function Figures({ theme }: { theme: "light" | "dark" }) {
  const { data, reload } = useLoad(() => learn.figures());
  const [making, setMaking] = useState(false);
  const [topic, setTopic] = useState("");
  return (
    <div className="figures">
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (topic.trim()) setMaking(true);
        }}
      >
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Draw a figure of any idea, e.g. how a B-tree splits a full node"
          aria-label="What to draw"
        />
        <button className="button" type="submit" aria-haspopup="dialog" disabled={!topic.trim()}>
          <Shapes aria-hidden="true" />
          Draw
        </button>
      </form>
      {making && (
        <FigureMaker
          passage={topic}
          theme={theme}
          onClose={() => {
            setMaking(false);
            setTopic("");
            reload();
          }}
        />
      )}
      {!data ? (
        <Spinner label="Loading figures" />
      ) : !data.length ? (
        <p className="fine">Figures you draw from notes and concepts collect here.</p>
      ) : (
        <div className="figure-grid">
          {data.map((f, i) => (
            <section key={f.id} className="figure-item" aria-label={f.title}>
              <SceneView spec={f.scene} theme={theme} fig={`Fig ${i + 1}`} predict={false} compact />
              <div className="figure-item-foot">
                <code className="fine" title="Embed it in a note with this">
                  ![[figure:{f.id}]]
                </code>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete ${f.title}`}
                  title="Delete"
                  onClick={async () => {
                    if (!confirm(`Delete "${f.title}"?`)) return;
                    await learn.deleteFigure(f.id);
                    reload();
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
