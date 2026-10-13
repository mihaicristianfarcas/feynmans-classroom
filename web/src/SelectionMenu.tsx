/* The menu that appears over a selected passage: Highlight · Explain · Visualize · Ask · Define, and
 * more (add the passage or a reference to your note, find resources, make cards, connect it to
 * today, teach it back, copy). Keys work too: H E V A D, N for "add to note". */
import { useEffect, useRef, useState } from "react";
import { FigureRequest } from "./tools";

export type SelectionAction =
  | { kind: "highlight"; color?: string }
  | { kind: "explain" }
  | { kind: "define" }
  | { kind: "ask"; question: string }
  | { kind: "visualize"; request: string; sceneKind: string; quality: "quick" | "careful" }
  | { kind: "resources" }
  | { kind: "note"; mode: "passage" | "reference" }
  | { kind: "cards" }
  | { kind: "connect" }
  | { kind: "teach" }
  | { kind: "tutor" }
  | { kind: "copy" };

const COLORS = ["yellow", "green", "blue", "pink", "purple"];

export function SelectionMenu({ x, y, onAction, noteTitle }: { x: number; y: number; onAction: (a: SelectionAction) => void; noteTitle?: string }) {
  const [mode, setMode] = useState<"menu" | "ask" | "visualize" | "more">("menu");
  const [question, setQuestion] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== "menu") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)) return;
      const k = e.key.toLowerCase();
      const map: Record<string, () => void> = {
        h: () => onAction({ kind: "highlight" }),
        e: () => onAction({ kind: "explain" }),
        d: () => onAction({ kind: "define" }),
        v: () => setMode("visualize"),
        a: () => setMode("ask"),
        n: () => onAction({ kind: "note", mode: "passage" }),
      };
      if (map[k]) {
        e.preventDefault();
        map[k]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onAction]);
  return (
    <div className="sel-menu" ref={box} style={{ left: x, top: y }} data-mode={mode} onMouseDown={(e) => !(e.target as HTMLElement).closest("input, textarea") && e.preventDefault()} role="toolbar" aria-label="Do something with this passage">
      {mode === "menu" && (
        <div className="sel-row">
          <span className="sel-highlight">
            <button className="sel-btn" onClick={() => onAction({ kind: "highlight" })} title="Highlight (H)">
              Highlight
            </button>
            <span className="sel-colors">
              {COLORS.map((c) => (
                <button key={c} className="color-dot" data-color={c} aria-label={`Highlight ${c}`} title={c} onClick={() => onAction({ kind: "highlight", color: c })} />
              ))}
            </span>
          </span>
          <span className="sel-sep" />
          <button className="sel-btn" onClick={() => onAction({ kind: "explain" })} title="Explain it, in the margin (E)">
            Explain
          </button>
          <button className="sel-btn" onClick={() => setMode("visualize")} title="Draw an interactive figure of it (V)">
            ◆ Visualize
          </button>
          <button className="sel-btn" onClick={() => setMode("ask")} title="Ask about it (A)">
            Ask
          </button>
          <button className="sel-btn" onClick={() => onAction({ kind: "define" })} title="Define the term (D)">
            Define
          </button>
          <span className="sel-sep" />
          <button className="sel-btn" onClick={() => onAction({ kind: "note", mode: "passage" })} title={`Add the passage to ${noteTitle ? `“${noteTitle}”` : "your note"} (N)`}>
            + Note
          </button>
          <button className="sel-btn" onClick={() => setMode("more")} aria-label="More" title="More">
            ⋯
          </button>
        </div>
      )}
      {mode === "ask" && (
        <form
          className="sel-ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) onAction({ kind: "ask", question: question.trim() });
          }}
        >
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this passage…" onKeyDown={(e) => e.key === "Escape" && setMode("menu")} />
          <button className="sel-btn" type="submit" disabled={!question.trim()}>
            Ask
          </button>
        </form>
      )}
      {mode === "visualize" && (
        <div className="sel-visualize">
          <FigureRequest compact onSubmit={({ request, kind, quality }) => onAction({ kind: "visualize", request, sceneKind: kind, quality })} />
        </div>
      )}
      {mode === "more" && (
        <div className="sel-more" role="menu">
          <button role="menuitem" onClick={() => onAction({ kind: "note", mode: "passage" })}>
            Add the passage to {noteTitle ? `“${noteTitle}”` : "your note"}
          </button>
          <button role="menuitem" onClick={() => onAction({ kind: "note", mode: "reference" })}>
            Add a reference to it
          </button>
          <button role="menuitem" onClick={() => onAction({ kind: "resources" })}>
            Find resources (videos, articles)
          </button>
          <button role="menuitem" onClick={() => onAction({ kind: "cards" })}>
            Make flashcards
          </button>
          <button role="menuitem" onClick={() => onAction({ kind: "teach" })}>
            Teach it back (Feynman)
          </button>
          <button role="menuitem" onClick={() => onAction({ kind: "connect" })}>
            Connect it to today
          </button>
          <button role="menuitem" onClick={() => onAction({ kind: "tutor" })}>
            Talk it over with the tutor
          </button>
          <button role="menuitem" onClick={() => onAction({ kind: "copy" })}>
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
