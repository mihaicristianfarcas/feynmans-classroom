/* An animation (a ManimGX scene, Python) in the app: ManimGX's own player in a sandboxed frame (see
 * server/manim/frame.ts), started when the reader presses play (each player runs its own Python, so
 * none starts by itself unless asked), recoloured for the theme, with what it's doing while it loads,
 * its error if the scene fails (and a way to have it fixed), and its code to read, copy or download
 * (`manimgx render scene.py` makes the video from it). */
import { Check, Copy, Download, Play, Wand2 } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Spinner } from "../components/feedback";
import { usePoster } from "./poster";

/** What "Fix it" does for the animations inside (a margin card has the animation written again). */
export const ManimFix = createContext<((error: string) => void) | null>(null);

/** A name for a scene from its class ("SecantToTangent" → "Secant to tangent"). */
export function sceneTitle(source: string): string {
  const name = /^class\s+(\w+)\s*\(/m.exec(source)?.[1];
  if (!name) return "Animation";
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
}

interface Report {
  scene?: string;
  duration?: number;
  error?: { message: string; type: string; trace?: string; line?: number | null };
  done?: boolean;
}

export function ManimView({
  source,
  title,
  theme,
  autoplay = false,
  onFix,
}: {
  source: string;
  title: string;
  theme: "light" | "dark";
  /** Start at once (a figure opened large), instead of waiting for the play button. */
  autoplay?: boolean;
  /** Has the animation written again to get past the error it hit. */
  onFix?: (error: string) => void;
}) {
  const fixFromCard = useContext(ManimFix);
  const fix = onFix || fixFromCard;
  const [started, setStarted] = useState(autoplay);
  const [status, setStatus] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const webgpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const poster = usePoster(source, theme);

  // the scene (recoloured in the frame for the theme) goes in once the frame is ready, and again when either changes
  useEffect(() => {
    if (!started) return;
    const post = () =>
      frame.current?.contentWindow?.postMessage({ source: "classroom-host", type: "manim", code: source, theme }, "*");
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== "classroom-manim") return;
      const data = event.data as { type: string; status?: string; report?: Report; key?: string };
      if (data.type === "key" && data.key === "Escape")
        // as if pressed on the frame itself, so a dialog around it closes
        frame.current?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      else if (data.type === "ready") {
        ready.current = true;
        post();
      } else if (data.type === "status") setStatus(String(data.status || ""));
      else if (data.type === "report" && data.report) {
        setReport(data.report);
        if (data.report.done) setStatus(null);
      }
    };
    window.addEventListener("message", onMessage);
    if (ready.current) {
      setReport(null);
      post();
    }
    return () => window.removeEventListener("message", onMessage);
  }, [started, source, theme]);

  const error = report?.error;
  const download = () => {
    const url = URL.createObjectURL(new Blob([source], { type: "text/x-python" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${
      title
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "animation"
    }.py`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="manim" data-theme={theme}>
      <div className="manim-stage">
        {!webgpu ? (
          <p className="manim-note">
            Animations play with WebGPU, which this browser doesn’t offer (Chrome, Edge and Safari 26 do). The code is
            below: <code>manimgx render</code> makes the video from it.
          </p>
        ) : started ? (
          <>
            <iframe
              ref={frame}
              className="manim-frame"
              title={`Animation: ${title}`}
              src="/api/manim/frame"
              sandbox="allow-scripts"
              allow="fullscreen"
            />
            {status && !report?.done && (
              <div className="manim-status">
                <Spinner label={status} />
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            className="manim-poster"
            onClick={() => setStarted(true)}
            data-still={poster ? "" : undefined}
          >
            {poster && <img className="manim-still" src={poster} alt="" />}
            <span className="manim-play" aria-hidden="true">
              <Play />
            </span>
            <span className="manim-poster-title">{title}</span>
            <span className="visually-hidden">: play the animation</span>
          </button>
        )}
      </div>
      {error && (
        <div className="manim-error" role="alert">
          <p>
            The animation hit an error{error.line ? ` (line ${error.line})` : ""}: {error.message}
          </p>
          {fix && (
            <button
              type="button"
              className="button"
              onClick={() => fix(error.trace?.trim() || `${error.type}: ${error.message}`)}
            >
              <Wand2 aria-hidden="true" />
              Fix it
            </button>
          )}
        </div>
      )}
      <details className="manim-code">
        <summary>
          The code{report?.duration ? <span className="fine"> · {Math.round(report.duration)} s film</span> : null}
        </summary>
        <div className="manim-code-tools">
          <button
            type="button"
            className="button subtle"
            onClick={() =>
              void navigator.clipboard?.writeText(source).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="button subtle" onClick={download}>
            <Download aria-hidden="true" />
            Download .py
          </button>
        </div>
        <pre className="manim-source">
          <code>{source}</code>
        </pre>
      </details>
    </div>
  );
}
