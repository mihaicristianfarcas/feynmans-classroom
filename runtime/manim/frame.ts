// The page inside an animation's sandboxed frame (served by server/manim/frame.ts): ManimGX's player,
// its Python and packages coming from the classroom's own mirror (/api/manim/…), never from elsewhere.
//
// Played: the app posts {source: "classroom-host", type: "manim", code, theme} and the film is made and
// played; the frame answers with {source: "classroom-manim", type: "ready" | "status" | "report"}.
// The scene's palette (PAPER, INK, ACCENT… at the top of its file) is set to the reader's theme first.
// Checked (?mode=check, in a headless browser): window.__manimCheck(code) runs it without drawing and
// resolves with what came of it: its error, or its length and ManimGX's layout problems.
// A still (?mode=poster, headless): window.__manimPoster(code, theme, wait) plays its last seconds and
// resolves just before its end (its finished picture, the controls faded), for a screenshot.
import { check, define, runtime, settings } from "./player.ts";
import type { Report } from "./protocol.ts";

declare const DIRECTOR: string;
declare const MANIMGX_VERSION: string;

runtime.worker = () => URL.createObjectURL(new Blob([DIRECTOR], { type: "text/javascript" }));
// an opaque origin's location still has the address it was loaded from: the mirror is beside it
const here = new URL(location.href);
const base = `${here.origin}/api/manim/`;
settings.pyodide = `${base}pyodide/`;
settings.manimgx = `manimgx==${MANIMGX_VERSION}`;
settings.index = `${base}pypi/{package_name}/json`;
settings.extras = ["networkx"];
define();

/** The classroom's palette for animations, in each theme (the names a scene's file defines at its top). */
const PALETTES: Record<"light" | "dark", Record<string, string>> = {
  light: {
    PAPER: "#ffffff",
    INK: "#2b2b2f",
    MUTED: "#69696d",
    FAINT: "#d6d2c9",
    ACCENT: "#6a5cc4",
    RED: "#d6606c",
    GREEN: "#4b986a",
    BLUE: "#4c7fc0",
    YELLOW: "#b08a1c",
    ORANGE: "#d0743c",
  },
  dark: {
    PAPER: "#252529",
    INK: "#edebe6",
    MUTED: "#949398",
    FAINT: "#3e3e44",
    ACCENT: "#c8bff3",
    RED: "#f0a0a8",
    GREEN: "#95d1a9",
    BLUE: "#9ec2ee",
    YELLOW: "#e3cc78",
    ORANGE: "#f2b48a",
  },
};

/** The scene with its palette set to a theme's colours (only the top-level `NAME = "#rrggbb"` lines). */
export function themed(code: string, theme: "light" | "dark"): string {
  const palette = PALETTES[theme];
  return code.replace(/^([A-Z]+)(\s*=\s*)(["'])#[0-9a-fA-F]{6}\3/gm, (line, name: string, eq: string, q: string) =>
    palette[name] ? `${name}${eq}${q}${palette[name]}${q}` : line,
  );
}

type Message =
  | { type: "key"; key: string }
  | { type: "ready"; webgpu: boolean }
  | { type: "status"; status: string }
  | { type: "report"; report: Report };

const mode = here.searchParams.get("mode");
if (mode === "check") {
  (window as unknown as { __manimCheck: typeof check }).__manimCheck = (code: string) => check(code);
} else if (mode === "poster") {
  // played into its last moments (its finished picture), long enough for the controls to fade
  (window as unknown as { __manimPoster: unknown }).__manimPoster = (
    code: string,
    theme: "light" | "dark",
    wait = 1500,
  ) =>
    new Promise<Report>((resolve) => {
      document.documentElement.dataset.theme = theme;
      const player = document.createElement("manimgx-player");
      player.addEventListener("manimgx-report", (e) => {
        const report = (e as CustomEvent<Report>).detail;
        if (!report.done) return;
        if (report.error || !report.duration) return resolve(report);
        player.currentTime = Math.max(0, report.duration - wait / 1000 - 0.3);
        player.play();
        setTimeout(() => resolve(report), wait);
      });
      document.body.append(player);
      player.source = themed(code, theme);
    });
} else {
  const tell = (message: Message) => parent.postMessage({ source: "classroom-manim", ...message }, "*");
  let player: HTMLElementTagNameMap["manimgx-player"] | null = null;
  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const data = event.data as { source?: string; type?: string; code?: unknown; theme?: unknown };
    if (data?.source !== "classroom-host") return;
    if (data.type === "manim" && typeof data.code === "string") {
      const theme = data.theme === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      if (!player) {
        player = document.createElement("manimgx-player");
        player.setAttribute("autoplay", "");
        player.addEventListener("manimgx-status", (e) =>
          tell({ type: "status", status: String((e as CustomEvent).detail) }),
        );
        player.addEventListener("manimgx-report", (e) => tell({ type: "report", report: (e as CustomEvent).detail }));
        document.body.append(player);
      }
      player.source = themed(data.code, theme);
    } else if (data.type === "play") player?.play();
    else if (data.type === "pause") player?.pause();
  });
  // Escape belongs to the page around the film (it closes the dialog the film is in), even while the
  // film has focus: a frame's keys don't reach its page by themselves
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") tell({ type: "key", key: "Escape" });
  });
  tell({ type: "ready", webgpu: "gpu" in navigator });
}
