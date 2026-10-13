/* The web app's entry point: the global styles (in cascade order) and the app, mounted into #root. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/styles.css";
import "./styles/app.css";
import "./reader/reader.css";
import "./notes/notes.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
