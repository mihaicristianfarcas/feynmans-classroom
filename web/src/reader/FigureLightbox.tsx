/* A figure opened large, over the reader: the figure itself (a scene in the player, an animation, or a
 * hand-built demo in its sandboxed frame), its caption, and what can be done with it: go to its
 * passage, redraw it with your notes (quickly or carefully), keep it in your brain, make cards from it,
 * have Codex hand-build it, or delete it. */
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Book, learn } from "../api";
import { CardDrafter, Modal } from "../components/tools";
import { ManimView } from "../manim/ManimView";
import { SceneView } from "../scene/SceneView";
import type { FigureEntry } from "./figures";

export function FigureLightbox({
  entry,
  book,
  theme,
  onClose,
  onGo,
  say,
}: {
  entry: FigureEntry;
  book: Book;
  theme: "light" | "dark";
  onClose: () => void;
  onGo: (entry: FigureEntry) => void;
  say: (text: string) => void;
}) {
  const [redrawing, setRedrawing] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);
  const [cards, setCards] = useState(false);
  const { annotation: a, demo } = entry;
  const source = {
    bookId: book.id,
    chapterId: entry.chapter?.id,
    page: entry.loc.page,
    y: entry.loc.y,
    block: entry.loc.block,
    quote: entry.quote,
  };
  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) say(done);
    } catch (error) {
      say((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const redraw = (quality: "quick" | "careful") =>
    run(
      async () => {
        if (a) await learn.redraw(a.id, notes, quality);
        else if (demo) await api.regenerate(book.id, demo.id, notes, quality);
        setNotes("");
        setRedrawing(false);
        onClose();
      },
      quality === "careful" ? "Redrawing carefully: about a minute." : "Redrawing: about fifteen seconds.",
    );

  return (
    <Modal title={entry.title} eyebrow={entry.fig} onClose={onClose} wide>
      <div className="lightbox">
        {entry.kind === "scene" && entry.scene ? (
          <SceneView spec={entry.scene} theme={theme} fig={entry.fig} predict={false} />
        ) : entry.kind === "animation" && entry.animation ? (
          <ManimView
            source={entry.animation}
            title={entry.title}
            theme={theme}
            autoplay
            onFix={
              a
                ? (error) =>
                    run(async () => {
                      await learn.redraw(
                        a.id,
                        `When it played, the animation stopped with this error; fix it:\n${error}`,
                      );
                      onClose();
                    }, "Fixing the animation.")
                : undefined
            }
          />
        ) : demo ? (
          <HandBuilt book={book} entry={entry} theme={theme} />
        ) : null}
        {entry.caption && <p className="caption">{entry.caption}</p>}
        {redrawing && (
          <div className="lightbox-redraw">
            <label className="menu-label" htmlFor="redraw-notes">
              What should change?
            </label>
            <textarea
              id="redraw-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. add a slider for the timeout, slow it down, label the axes"
            />
            <div className="row gap">
              <button type="button" className="button primary" disabled={busy} onClick={() => redraw("quick")}>
                Redraw
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                title="Use the stronger model: slower, more thorough"
                onClick={() => redraw("careful")}
              >
                Careful redraw
              </button>
            </div>
          </div>
        )}
        <div className="lightbox-actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              onClose();
              onGo(entry);
            }}
          >
            Go to the passage
          </button>
          <button type="button" className="button" aria-expanded={redrawing} onClick={() => setRedrawing((r) => !r)}>
            Redraw…
          </button>
          {entry.kind === "scene" && entry.scene ? (
            <button
              type="button"
              className="button"
              disabled={kept || busy}
              onClick={() =>
                run(async () => {
                  await learn.keepFigure({ scene: entry.scene, source });
                  setKept(true);
                }, "Kept in your figures.")
              }
            >
              {kept ? "Kept" : "Keep in brain"}
            </button>
          ) : null}
          <button type="button" className="button" onClick={() => setCards(true)}>
            Make cards
          </button>
          {demo?.type === "scene" && (
            <button
              type="button"
              className="button"
              disabled={busy}
              title="Have Codex hand-build a custom version (minutes): for what the figure kinds can't show"
              onClick={() => run(() => api.craft(book.id, demo.id, notes), "Codex is hand-building it.")}
            >
              Hand-build
            </button>
          )}
          <span className="spacer" />
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Delete “${entry.title}”?`)) return;
              void run(async () => {
                if (a) await learn.deleteAnnotation(a.id);
                else if (demo) await api.deleteDemo(book.id, demo.id);
                onClose();
              });
            }}
          >
            Delete
          </button>
        </div>
        <p className="fine">
          Anchored to: “{entry.quote.length > 160 ? `${entry.quote.slice(0, 160)}…` : entry.quote}”
          {entry.loc.page !== undefined ? ` (p. ${entry.loc.page})` : ""}
        </p>
      </div>
      {cards && (
        <CardDrafter
          passage={`${entry.title}: ${entry.caption}\n\n${entry.quote}${demo ? `\n\n${demo.brief.idea}` : ""}`}
          source={source}
          deck={book.title}
          onClose={() => setCards(false)}
        />
      )}
    </Modal>
  );
}

/** A hand-built demo: its own page in a sandboxed frame (scripts run, nothing else loads). */
function HandBuilt({ book, entry, theme }: { book: Book; entry: FigureEntry; theme: "light" | "dark" }) {
  const demo = entry.demo!;
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  // the page is loaded with the theme it starts in; later switches go over postMessage
  // biome-ignore lint/correctness/useExhaustiveDependencies: the URL is fixed per demo version
  const src = useMemo(
    () => api.pageUrl(book.id, demo.id, theme, demo.updatedAt, false),
    [book.id, demo.id, demo.updatedAt],
  );
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ source: "classroom-host", type: "theme", theme }, "*");
  }, [theme]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== "classroom") return;
      if (event.data.type === "error") setError(String(event.data.message));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  return (
    <>
      <iframe
        ref={frame}
        className="demo-frame lightbox-frame"
        title={demo.brief.title}
        src={src}
        sandbox="allow-scripts"
        onLoad={() =>
          frame.current?.contentWindow?.postMessage({ source: "classroom-host", type: "theme", theme }, "*")
        }
      />
      {error && <p className="form-error">The demo hit an error: {error}</p>}
    </>
  );
}
