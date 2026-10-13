import { ChevronDown, ChevronUp, Shapes } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Book, type Demo, type Job, learn, type TocEntry } from "../api";
import { CardDrafter } from "../components/tools";
import { SceneView } from "../scene/SceneView";

const STATUS_WORDS: Record<string, string> = {
  queued: "Waiting",
  planning: "Planning",
  building: "Drawing",
  checking: "Checking it",
  failed: "This one didn't work out",
};

function since(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function useNow(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
}

interface Props {
  book: Book;
  demo: Demo | null;
  chapter: TocEntry | null;
  chapterDemos: Demo[];
  allDemos: Demo[];
  jobs: Job[];
  theme: "light" | "dark";
  held: boolean;
  onJump: (demo: Demo) => void;
  onStep: (direction: -1 | 1) => void;
  canStep: { prev: boolean; next: boolean };
}

export function DemoPanel({
  book,
  demo,
  chapter,
  chapterDemos,
  allDemos,
  jobs,
  theme,
  held,
  onJump,
  onStep,
  canStep,
}: Props) {
  const planning = jobs.find((job) => job.kind === "plan" && job.status === "running" && job.chapterId === chapter?.id);
  return (
    <div className="demo-panel">
      {demo ? (
        <DemoView book={book} demo={demo} theme={theme} held={held} />
      ) : (
        <ChapterCard
          book={book}
          chapter={chapter}
          demos={chapterDemos}
          planning={planning}
          onJump={onJump}
          total={allDemos.length}
        />
      )}
      <footer className="demo-foot">
        <div className="demo-steps">
          <button
            type="button"
            className="icon-button"
            onClick={() => onStep(-1)}
            disabled={!canStep.prev}
            aria-label="Previous figure"
            title="Previous figure ( [ )"
          >
            <ChevronUp aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onStep(1)}
            disabled={!canStep.next}
            aria-label="Next figure"
            title="Next figure ( ] )"
          >
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
        <span className="demo-count">
          {demo
            ? `${demo.fig} · ${chapterDemos.indexOf(chapterDemos.find((d) => d.id === demo.id)!) + 1} of ${chapterDemos.length} in this chapter`
            : chapterDemos.length
              ? `${chapterDemos.length} figure${chapterDemos.length === 1 ? "" : "s"} in this chapter`
              : ""}
        </span>
        {demo && <DemoMenu book={book} demo={demo} />}
      </footer>
    </div>
  );
}

function DemoView({ book, demo, theme, held }: { book: Book; demo: Demo; theme: "light" | "dark"; held: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  useNow(demo.status !== "ready" && demo.status !== "failed");
  const ready = demo.status === "ready";
  // the page is loaded with the theme it should start in; later switches go over postMessage
  // a predict-first question is asked once per demo version; after that the demo just plays
  const predictKey = `classroom-predicted-${demo.id}-${demo.updatedAt}`;
  const asked = (() => {
    try {
      return localStorage.getItem(predictKey) === "1";
    } catch {
      return false;
    }
  })();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the URL is fixed per demo version; a loaded page gets theme changes by message, and the predict question only on first load
  const src = useMemo(
    () => (ready ? api.pageUrl(book.id, demo.id, theme, demo.updatedAt, !asked) : ""),
    [ready, book.id, demo.id, demo.updatedAt],
  );

  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ source: "classroom-host", type: "theme", theme }, "*");
  }, [theme]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens afresh (and clears the error) whenever the frame loads another demo or version
  useEffect(() => {
    setError(null);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== "classroom") return;
      if (event.data.type === "error") setError(event.data.message);
      if (event.data.type === "predict" && event.data.open === false) {
        try {
          localStorage.setItem(predictKey, "1");
        } catch {}
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [demo.id, demo.updatedAt, predictKey]);

  if (demo.type === "scene") return <SceneDemo book={book} demo={demo} theme={theme} held={held} />;
  return (
    <div className="demo-view">
      <header className="demo-head">
        <div className="eyebrow">
          {demo.brief.eyebrow || demo.brief.title}
          {held && <span className="held-tag">held</span>}
        </div>
        <p className="caption">{demo.brief.caption}</p>
      </header>
      {ready ? (
        <iframe
          key={`${demo.id}-${demo.updatedAt}`}
          ref={frame}
          className="demo-frame"
          title={demo.brief.title}
          src={src}
          sandbox="allow-scripts"
          onLoad={() =>
            frame.current?.contentWindow?.postMessage({ source: "classroom-host", type: "theme", theme }, "*")
          }
        />
      ) : (
        <div className="demo-pending" data-status={demo.status}>
          <div className="pending-figure" aria-hidden="true">
            <Shapes />
          </div>
          <div className="pending-text">
            <div className="pending-title">
              {demo.status === "building" ? "Codex is building it" : STATUS_WORDS[demo.status] || demo.status}
              {demo.status !== "failed" && <span className="pending-time"> · {since(demo.createdAt)}</span>}
            </div>
            <div className="pending-activity">{demo.status === "failed" ? demo.error : demo.activity || "…"}</div>
            {demo.status === "failed" && (
              <button type="button" className="button" onClick={() => api.regenerate(book.id, demo.id)}>
                Try again
              </button>
            )}
          </div>
        </div>
      )}
      {error && <div className="demo-error">The demo hit an error: {error}</div>}
    </div>
  );
}

/** A scene figure: drawn by the platform's player, right here (no iframe, no code). */
function SceneDemo({ book, demo, theme, held }: { book: Book; demo: Demo; theme: "light" | "dark"; held: boolean }) {
  useNow(demo.status !== "ready" && demo.status !== "failed");
  const predictKey = `classroom-predicted-${demo.id}-${demo.updatedAt}`;
  const asked = (() => {
    try {
      return localStorage.getItem(predictKey) === "1";
    } catch {
      return false;
    }
  })();
  const ready = demo.status === "ready" && !!demo.scene;
  return (
    <div className="demo-view scene-demo">
      <header className="demo-head">
        <div className="eyebrow">
          {demo.brief.eyebrow || demo.brief.title}
          {held && <span className="held-tag">held</span>}
          {demo.request && (
            <span className="request-tag" title={demo.request}>
              asked
            </span>
          )}
        </div>
        {demo.brief.caption && <p className="caption">{demo.brief.caption}</p>}
      </header>
      {ready ? (
        <div className="scene-wrap">
          <SceneView
            spec={demo.scene}
            theme={theme}
            fig={demo.fig}
            predict={!asked}
            onEvent={(e) => {
              if (e.type === "predict") {
                try {
                  localStorage.setItem(predictKey, "1");
                } catch {}
              }
            }}
          />
        </div>
      ) : (
        <div className="demo-pending" data-status={demo.status}>
          <div className="pending-figure" aria-hidden="true">
            <Shapes />
          </div>
          <div className="pending-text">
            <div className="pending-title">
              {STATUS_WORDS[demo.status] || demo.status}
              {demo.status !== "failed" && (
                <span className="pending-time">
                  {" "}
                  · {since(demo.status === "building" && demo.startedAt ? demo.startedAt : demo.createdAt)}
                </span>
              )}
            </div>
            <div className="pending-activity">{demo.status === "failed" ? demo.error : demo.activity || "…"}</div>
            {demo.request && demo.status !== "failed" && <div className="fine">“{demo.request}”</div>}
            {demo.status === "failed" && (
              <button type="button" className="button" onClick={() => api.regenerate(book.id, demo.id)}>
                Try again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DemoMenu({ book, demo }: { book: Book; demo: Demo }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(false);
  const [cards, setCards] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const working = !["ready", "failed"].includes(demo.status);
  return (
    <div className="demo-menu" ref={box}>
      <button type="button" className="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        Improve
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-pop" role="dialog" aria-label="Improve this demo">
          <label className="menu-label" htmlFor="feedback">
            {demo.type === "scene" ? "Redraw it with your notes" : "Ask Codex to rebuild it"}
          </label>
          <textarea
            id="feedback"
            rows={3}
            placeholder={
              demo.type === "scene"
                ? "e.g. add a slider for the timeout, show a lost message, make it 3D"
                : "e.g. show the forces as arrows, slow the motion down"
            }
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <div className="menu-row">
            <button
              type="button"
              className="button primary"
              disabled={busy || working}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.regenerate(book.id, demo.id, feedback);
                  setOpen(false);
                  setFeedback("");
                } catch (error) {
                  alert((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {working ? "Working…" : demo.type === "scene" ? "Redraw" : "Rebuild"}
            </button>
            {demo.type === "scene" && (
              <button
                type="button"
                className="button"
                disabled={busy || working}
                title="Use the stronger model: slower, more thorough"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.regenerate(book.id, demo.id, feedback, "careful");
                    setOpen(false);
                    setFeedback("");
                  } catch (error) {
                    alert((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Careful redraw
              </button>
            )}
            {demo.status === "ready" && demo.type !== "scene" && (
              <a
                className="button"
                href={api.pageUrl(book.id, demo.id, "light", demo.updatedAt)}
                target="_blank"
                rel="noreferrer"
              >
                Open alone
              </a>
            )}
            {demo.status === "ready" && demo.type === "scene" && (
              <>
                <button
                  type="button"
                  className="button"
                  disabled={kept}
                  onClick={async () => {
                    await learn.keepFigure({
                      scene: demo.scene,
                      source: {
                        bookId: book.id,
                        chapterId: demo.chapterId,
                        page: demo.anchor.page,
                        y: demo.anchor.y,
                        block: demo.anchor.block,
                        quote: demo.anchor.quote,
                      },
                    });
                    setKept(true);
                  }}
                >
                  {kept ? "Kept" : "Keep in brain"}
                </button>
                <button type="button" className="button" onClick={() => setCards(true)}>
                  Make cards
                </button>
                <button
                  type="button"
                  className="button"
                  title="Have Codex hand-build a custom version (minutes): for what the figure kinds can't show"
                  onClick={async () => {
                    try {
                      await api.craft(book.id, demo.id, feedback);
                      setOpen(false);
                    } catch (error) {
                      alert((error as Error).message);
                    }
                  }}
                >
                  Hand-build
                </button>
              </>
            )}
            <button
              type="button"
              className="button danger"
              onClick={async () => {
                if (!confirm(`Delete "${demo.brief.title}"?`)) return;
                await api.deleteDemo(book.id, demo.id);
                setOpen(false);
              }}
            >
              Delete
            </button>
          </div>
          <p className="menu-note">
            Anchored to: “{demo.anchor.quote}”{demo.anchor.matched ? "" : " (approximate)"}
            {demo.ms ? ` · drawn in ${(demo.ms / 1000).toFixed(0)} s` : ""}
          </p>
        </div>
      )}
      {cards && (
        <CardDrafter
          passage={`${demo.brief.title}: ${demo.brief.caption}\n\n${demo.anchor.quote}\n\n${demo.brief.idea}`}
          source={{
            bookId: book.id,
            chapterId: demo.chapterId,
            page: demo.anchor.page,
            block: demo.anchor.block,
            quote: demo.anchor.quote,
          }}
          deck={book.title}
          onClose={() => setCards(false)}
        />
      )}
    </div>
  );
}

function ChapterCard({
  book,
  chapter,
  demos,
  planning,
  onJump,
  total,
}: {
  book: Book;
  chapter: TocEntry | null;
  demos: Demo[];
  planning?: Job;
  onJump: (d: Demo) => void;
  total: number;
}) {
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!chapter) return <div className="chapter-card" />;
  const generate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.generate(book.id, chapter.id, count);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="chapter-card">
      <div className="eyebrow">{chapter.title}</div>
      {chapter.subtitle && <h2 className="chapter-title">{chapter.subtitle}</h2>}
      {demos.length > 0 ? (
        <>
          <p className="caption">Scroll on: each diamond beside the page is a figure. Or jump straight to one.</p>
          <ol className="demo-list">
            {demos.map((demo) => (
              <li key={demo.id}>
                <button type="button" className="demo-link" onClick={() => onJump(demo)}>
                  <span className="demo-link-fig">{demo.fig}</span>
                  <span className="demo-link-title">{demo.brief.eyebrow || demo.brief.title}</span>
                  <span className="demo-link-status" data-status={demo.status}>
                    {demo.status === "ready" ? "" : demo.status}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="button" onClick={generate} disabled={busy || !!planning}>
            {planning ? "Planning more…" : "Add more figures"}
          </button>
        </>
      ) : planning ? (
        <div className="planning">
          <div className="pending-title">Reading the chapter</div>
          <div className="pending-activity">{planning.message || "…"}</div>
        </div>
      ) : (
        <>
          <p className="caption">
            No figures for this chapter yet. The tutor will read it, pick the ideas worth seeing move, and draw an
            interactive figure for each, anchored to the passage it explains. Or select any passage and choose
            Visualize.
          </p>
          <div className="generate-row">
            <label className="count-select">
              <span>Figures</span>
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="button primary" onClick={generate} disabled={busy}>
              Visualize this chapter
            </button>
          </div>
          <p className="fine">About a minute to plan, then seconds per figure. You can keep reading.</p>
        </>
      )}
      {message && <p className="form-error">{message}</p>}
      {total === 0 && (
        <p className="fine">
          Tip: select any passage in the book and choose Visualize, with your own request if you like.
        </p>
      )}
    </div>
  );
}
