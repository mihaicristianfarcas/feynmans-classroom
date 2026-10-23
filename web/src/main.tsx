/* The web app's entry point: the typefaces (bundled, so the app looks the same offline), the global
 * styles (in cascade order) and the app, mounted into #root once the typefaces it sets its bar and
 * titles in have loaded (they're on this computer, so that's a moment): drawn in them from its first
 * frame, nothing reflows when they arrive. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource-variable/hanken-grotesk/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./styles/styles.css";
import "./styles/app.css";
import "./reader/reader.css";
import "./notes/notes.css";

/** The faces the first frame is set in: the controls' sans and the titles' serif. */
const FIRST_FACES = ["550 1em 'Hanken Grotesk Variable'", "500 1em 'Newsreader Variable'"];
/** The longest the first frame waits for them (a deadline, should a face fail to load). */
const FONT_WAIT = 500;

Promise.race([
  Promise.all(FIRST_FACES.map((face) => document.fonts.load(face))),
  new Promise((done) => setTimeout(done, FONT_WAIT)),
])
  .catch(() => {})
  .then(() =>
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
