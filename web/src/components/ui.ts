/* Small pieces of the design system that need a little script. */
import { useLayoutEffect, useRef } from "react";

const ACTIVE = '[aria-current="page"], [aria-pressed="true"], [aria-selected="true"]';

/**
 * Slides an indicator to the active item of a tab list, a segmented control or the side nav: sets
 * --ind-x/--ind-w (or --ind-y/--ind-h) on the container, which draws the indicator in CSS. The first
 * placement is instant (data-ind="instant"), later ones slide (data-ind="on").
 */
export function useIndicator<T extends HTMLElement>(active: unknown, axis: "x" | "y" = "x") {
  const ref = useRef<T>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the indicator moves whenever the active item changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const place = () => {
      const on = el.querySelector<HTMLElement>(ACTIVE);
      if (!on?.offsetWidth) {
        el.removeAttribute("data-ind");
        return;
      }
      if (axis === "x") {
        el.style.setProperty("--ind-x", `${on.offsetLeft}px`);
        el.style.setProperty("--ind-w", `${on.offsetWidth}px`);
      } else {
        el.style.setProperty("--ind-y", `${on.offsetTop}px`);
        el.style.setProperty("--ind-h", `${on.offsetHeight}px`);
      }
      // placed without a transition first; from the next frame on, moves slide
      if (el.getAttribute("data-ind") !== "on") {
        el.setAttribute("data-ind", "instant");
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => el.setAttribute("data-ind", "on"))));
      }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [active, axis]);
  return ref;
}

/** Opens the search palette (it also opens with ⌘K). */
export const openPalette = () => window.dispatchEvent(new Event("classroom:palette"));

/** A soft pastel for a string (a book, a concept), the same every time. */
const TONES = ["lavender", "sage", "sky", "peach", "butter", "rose"] as const;
export function toneOf(key: string): (typeof TONES)[number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}
