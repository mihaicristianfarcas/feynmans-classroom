/* The web app's entry point: the typefaces (bundled, so the app looks the same offline), the global
 * styles (in cascade order) and the app, mounted into #root. */
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
