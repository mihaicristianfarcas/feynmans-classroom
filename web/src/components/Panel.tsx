/* The two controls of a side panel (see lib/usePanel.ts). PanelEdge is its inner edge: drag it to resize
 * the panel, well past its narrowest width to close it, double-click it for the default width; from the
 * keyboard it's a separator (the WAI-ARIA window splitter): the arrow keys resize, Home and End go to the
 * narrowest and widest, Enter closes. PanelToggle is the button that closes and opens it again. */
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useRef } from "react";
import { fitWidth, type Panel } from "../lib/usePanel";

/** How far one press of an arrow key moves the edge (with Shift, four times as far). */
const STEP = 16;

/** Gives focus to the panel's button (anything marked data-panel-toggle with its id), once the panel has closed. */
export const focusToggle = (panel: Panel) =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`[data-panel-toggle="${panel.id}"]`)?.focus({ preventScroll: true }),
  );

/**
 * The edge of `panel` (on the page's `side`), between it and what it sits beside. While dragging, the
 * width goes straight to the page (the panel's custom property); it's kept when the pointer lets go.
 */
export function PanelEdge({
  panel,
  side,
  label,
  className = "",
  onClose,
}: {
  panel: Panel;
  /** The side of the page the panel is on: its edge is on the other side. */
  side: "left" | "right";
  /** What the panel is, for screen readers ("Resize the …"). */
  label: string;
  className?: string;
  /** Called when the edge closes the panel (instead of focusing its button). */
  onClose?: () => void;
}) {
  const drag = useRef<{ x: number; from: number; width: number; moved: boolean; frame: number } | null>(null);
  if (!panel.open) return null;
  // a left panel grows to the right, a right panel to the left
  const sign = side === "left" ? 1 : -1;
  /** The width it has on screen (it can be less than the one kept, when the page is narrow). */
  const shown = () => document.getElementById(panel.id)?.getBoundingClientRect().width || panel.width;
  /** Shows the width being dragged, once a frame however often the pointer moves. */
  const live = () => {
    const d = drag.current;
    if (!d || d.frame) return;
    d.frame = requestAnimationFrame(() => {
      d.frame = 0;
      panel.host.current?.style.setProperty(panel.cssVar, `${d.width}px`);
    });
  };
  const commit = (width: number, byKeyboard: boolean) => {
    panel.setWidth(width);
    if (width > 0) return;
    if (onClose) onClose();
    else if (byKeyboard) focusToggle(panel);
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    document.documentElement.removeAttribute("data-resizing");
    if (!d) return;
    cancelAnimationFrame(d.frame);
    if (d.moved) {
      panel.host.current?.style.setProperty(panel.cssVar, `${d.width}px`);
      commit(d.width, false);
    }
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is the window splitter pattern (an <hr> can't take focus or a value)
    <div
      role="separator"
      tabIndex={0}
      className={`panel-edge ${className}`}
      data-side={side}
      aria-orientation="vertical"
      aria-controls={panel.id}
      aria-label={`Resize the ${label}`}
      aria-valuemin={0}
      aria-valuemax={panel.max}
      aria-valuenow={panel.width}
      aria-valuetext={`${panel.width} pixels wide`}
      title="Drag to resize, or to close · double-click for the default width"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const from = shown();
        drag.current = { x: e.clientX, from, width: from, moved: false, frame: 0 };
        document.documentElement.setAttribute("data-resizing", "");
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.moved ||= Math.abs(e.clientX - d.x) > 2;
        d.width = fitWidth(d.from + (e.clientX - d.x) * sign, panel);
        live();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => panel.setWidth(panel.initial)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? STEP * 4 : STEP;
        const now = shown();
        let next: number | null = null;
        if (e.key === "ArrowLeft") next = Math.max(panel.min, now - step * sign);
        else if (e.key === "ArrowRight") next = Math.max(panel.min, now + step * sign);
        else if (e.key === "Home") next = panel.min;
        else if (e.key === "End") next = panel.max;
        else if (e.key === "Enter") next = 0;
        if (next === null) return;
        e.preventDefault();
        commit(next, true);
      }}
    />
  );
}

/** The button that hides `panel` and shows it again (at its default width). */
export function PanelToggle({
  panel,
  side,
  label,
  className = "icon-button",
}: {
  panel: Panel;
  side: "left" | "right";
  /** What the panel is ("study panel"): the button says "Hide the …" or "Show the …". */
  label: string;
  className?: string;
}) {
  const Icon =
    side === "left" ? (panel.open ? PanelLeftClose : PanelLeftOpen) : panel.open ? PanelRightClose : PanelRightOpen;
  const name = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <button
      type="button"
      className={className}
      data-panel-toggle={panel.id}
      aria-label={name}
      aria-expanded={panel.open}
      aria-controls={panel.open ? panel.id : undefined}
      title={`${panel.open ? "Hide" : "Show"} the ${label}`}
      onClick={panel.toggle}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
