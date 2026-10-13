import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTheme } from "./api";
import { Gallery } from "./Gallery";
import { Library } from "./Library";
import { Reader } from "./Reader";
import "./styles.css";

function route() {
  const match = location.hash.match(/^#\/book\/([a-z0-9]+)/i);
  if (match) return { name: "book" as const, id: match[1] };
  if (location.hash.startsWith("#/gallery")) return { name: "gallery" as const };
  return { name: "library" as const };
}

function App() {
  const [current, setCurrent] = useState(route);
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    const onHash = () => {
      const next = route();
      setCurrent((old) => (old.name === next.name && (old as { id?: string }).id === (next as { id?: string }).id ? old : next));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (current.name === "gallery") return <Gallery theme={theme} />;
  return current.name === "book" ? <Reader key={current.id} bookId={current.id} theme={theme} setTheme={setTheme} /> : <Library theme={theme} setTheme={setTheme} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
