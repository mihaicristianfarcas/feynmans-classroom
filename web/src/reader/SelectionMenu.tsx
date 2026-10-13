/* The menu that appears over a selected passage: Highlight · Explain · Visualize · Ask · Define, and
 * more (add the passage or a reference to your note, find resources, make cards, connect it to
 * today, teach it back, copy). Keys work too: H E V A D, N for "add to note". */
import {
  ArrowUp,
  BookA,
  Copy,
  Ellipsis,
  GraduationCap,
  Highlighter,
  Layers,
  Lightbulb,
  Link2,
  MessageCircleQuestion,
  MessagesSquare,
  Plus,
  Quote,
  Search,
  Shapes,
  Waypoints,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FigureRequest } from "../components/tools";

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

/** The menu, centred on the selection (x) and kept inside the pane; it grows from the selection's side. */
export function SelectionMenu({
  x,
  y,
  side,
  onAction,
  noteTitle,
}: {
  x: number;
  y: number;
  side: "top" | "bottom";
  onAction: (a: SelectionAction) => void;
  noteTitle?: string;
}) {
  const [mode, setMode] = useState<"menu" | "ask" | "visualize" | "more">("menu");
  const [question, setQuestion] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const bar = useRef(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const room = (el.offsetParent as HTMLElement | null)?.clientWidth ?? window.innerWidth;
    el.style.left = `${Math.max(8, Math.min(room - el.offsetWidth - 8, x - el.offsetWidth / 2))}px`;
    // above the passage, the taller panels (ask, visualize, more) grow upwards from the bar's bottom edge
    if (mode === "menu") bar.current = el.offsetHeight;
    el.style.top = `${side === "top" && mode !== "menu" ? Math.max(8, y + bar.current - el.offsetHeight) : y}px`;
  }, [x, y, side, mode]);
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
    <div
      className="sel-menu"
      ref={box}
      style={{ left: x, top: y }}
      data-mode={mode}
      data-side={side}
      onMouseDown={(e) => !(e.target as HTMLElement).closest("input, textarea") && e.preventDefault()}
      role="toolbar"
      aria-label="Do something with this passage"
    >
      {mode === "menu" && (
        <div className="sel-row">
          <span className="sel-highlight">
            <button
              type="button"
              className="sel-btn"
              onClick={() => onAction({ kind: "highlight" })}
              title="Highlight (H)"
            >
              <Highlighter aria-hidden="true" />
              Highlight
            </button>
            <span className="sel-colors">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className="color-dot"
                  data-color={c}
                  aria-label={`Highlight ${c}`}
                  title={c}
                  onClick={() => onAction({ kind: "highlight", color: c })}
                />
              ))}
            </span>
          </span>
          <span className="sel-sep" />
          <button
            type="button"
            className="sel-btn"
            onClick={() => onAction({ kind: "explain" })}
            title="Explain it, in the margin (E)"
          >
            <Lightbulb aria-hidden="true" />
            Explain
          </button>
          <button
            type="button"
            className="sel-btn"
            onClick={() => setMode("visualize")}
            title="Draw an interactive figure of it (V)"
          >
            <Shapes aria-hidden="true" />
            Visualize
          </button>
          <button type="button" className="sel-btn" onClick={() => setMode("ask")} title="Ask about it (A)">
            <MessageCircleQuestion aria-hidden="true" />
            Ask
          </button>
          <button
            type="button"
            className="sel-btn"
            onClick={() => onAction({ kind: "define" })}
            title="Define the term (D)"
          >
            <BookA aria-hidden="true" />
            Define
          </button>
          <span className="sel-sep" />
          <button
            type="button"
            className="sel-btn"
            onClick={() => onAction({ kind: "note", mode: "passage" })}
            title={`Add the passage to ${noteTitle ? `“${noteTitle}”` : "your note"} (N)`}
          >
            <Plus aria-hidden="true" />
            Note
          </button>
          <button type="button" className="sel-btn icon" onClick={() => setMode("more")} aria-label="More" title="More">
            <Ellipsis aria-hidden="true" />
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
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about this passage…"
            onKeyDown={(e) => e.key === "Escape" && setMode("menu")}
          />
          <button className="sel-send" type="submit" disabled={!question.trim()} aria-label="Ask">
            <ArrowUp aria-hidden="true" />
          </button>
        </form>
      )}
      {mode === "visualize" && (
        <div className="sel-visualize">
          <FigureRequest
            compact
            onSubmit={({ request, kind, quality }) =>
              onAction({ kind: "visualize", request, sceneKind: kind, quality })
            }
          />
        </div>
      )}
      {mode === "more" && (
        <div className="sel-more menu" role="menu">
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "note", mode: "passage" })}>
            <Quote aria-hidden="true" />
            Add the passage to {noteTitle ? `“${noteTitle}”` : "your note"}
          </button>
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "note", mode: "reference" })}>
            <Link2 aria-hidden="true" />
            Add a reference to it
          </button>
          <div className="menu-sep" />
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "resources" })}>
            <Search aria-hidden="true" />
            Find resources (videos, articles)
          </button>
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "cards" })}>
            <Layers aria-hidden="true" />
            Make flashcards
          </button>
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "teach" })}>
            <GraduationCap aria-hidden="true" />
            Teach it back (Feynman)
          </button>
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "connect" })}>
            <Waypoints aria-hidden="true" />
            Connect it to today
          </button>
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "tutor" })}>
            <MessagesSquare aria-hidden="true" />
            Talk it over with the tutor
          </button>
          <div className="menu-sep" />
          <button type="button" role="menuitem" onClick={() => onAction({ kind: "copy" })}>
            <Copy aria-hidden="true" />
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
