/* Keyboard and screen-reader helpers shared by the app's dialogs, menus and tab lists, so every one
 * of them behaves the way assistive technology expects (the WAI-ARIA Authoring Practices):
 *   useFocusTrap   a dialog takes focus, keeps Tab inside, closes on Escape, gives focus back
 *   useArrowKeys   arrow keys (and Home/End) move between the items of a tab list, menu or toolbar
 *   announce       a polite message for screen readers ("Saved", "3 results") */
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable=true]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** The elements in `root` that Tab can reach, in order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest("[inert]") && (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement),
  );
}

/**
 * While `active`: moves focus into `ref` (to `initial` if given and found, else the first field, else
 * the first focusable), keeps Tab and Shift+Tab inside it, and calls `onEscape` on Escape. When it
 * ends, focus goes back to what had it before (the button that opened the dialog).
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  { onEscape, initial }: { onEscape?: () => void; initial?: string } = {},
) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const before = document.activeElement as HTMLElement | null;
    const first =
      (initial && root.querySelector<HTMLElement>(initial)) ||
      root.querySelector<HTMLElement>("textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden])") ||
      focusables(root)[0] ||
      root;
    if (first === root && !root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
    first.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escapeRef.current) {
        e.stopPropagation();
        escapeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(root);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const at = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (at <= 0 || !root.contains(document.activeElement))) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (at === items.length - 1 || !root.contains(document.activeElement))) {
        e.preventDefault();
        items[0].focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref, active, initial]);
}

/**
 * Arrow keys move focus between the items (`selector`) inside `ref`; Home and End go to the first and
 * last. Horizontal lists use Left/Right, vertical ones Up/Down, "both" either pair. With `select`, moving to an item also
 * clicks it (tabs that show their panel as you arrow through them). Only the current item is in the
 * Tab order (roving tabindex), so Tab leaves the list instead of walking through it. The element behind
 * `ref` may come and go (a menu drawn only while it is open): the keys follow whichever one is there.
 */
/** Something that can take focus: an HTML element or an SVG one (a node in a drawn graph). */
type Item = Element & HTMLOrSVGElement;
type Orientation = "horizontal" | "vertical" | "both";

export function useArrowKeys(
  ref: RefObject<Element | null>,
  {
    selector,
    orientation = "horizontal",
    select = false,
  }: { selector: string; orientation?: Orientation; select?: boolean },
) {
  const attached = useRef<{ root: Element; options: string; detach: () => void } | null>(null);
  // after every render: the element may have appeared, gone or been replaced since the last one
  useEffect(() => {
    const root = ref.current;
    const options = `${selector}\u0000${orientation}\u0000${select}`;
    const was = attached.current;
    if (was?.root === root && was.options === options) return;
    was?.detach();
    attached.current = root ? { root, options, detach: arrowKeys(root, selector, orientation, select) } : null;
  });
  useEffect(
    () => () => {
      attached.current?.detach();
      attached.current = null;
    },
    [],
  );
}

/** Wires the arrow keys and the roving tabindex into `root`; returns what undoes it. */
function arrowKeys(root: Element, selector: string, orientation: Orientation, select: boolean): () => void {
  const items = () => [...root.querySelectorAll<Item & Element>(selector)].filter((el) => !el.hasAttribute("disabled"));
  const current = (list: Item[]) =>
    Math.max(
      0,
      list.findIndex(
        (el) =>
          el === document.activeElement ||
          el.getAttribute("aria-selected") === "true" ||
          el.getAttribute("aria-checked") === "true" ||
          el.getAttribute("aria-pressed") === "true" ||
          el.getAttribute("aria-current") === "true",
      ),
    );
  const rove = () => {
    const list = items();
    const at = current(list);
    list.forEach((el, i) => {
      el.tabIndex = i === at ? 0 : -1;
    });
  };
  rove();
  const observer = new MutationObserver(rove);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-selected", "aria-pressed", "aria-checked", "aria-current"],
  });
  const next =
    orientation === "horizontal"
      ? ["ArrowRight"]
      : orientation === "vertical"
        ? ["ArrowDown"]
        : ["ArrowRight", "ArrowDown"];
  const prev =
    orientation === "horizontal" ? ["ArrowLeft"] : orientation === "vertical" ? ["ArrowUp"] : ["ArrowLeft", "ArrowUp"];
  const onKey = (e: Event) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (![...next, ...prev, "Home", "End"].includes(e.key)) return;
    const list = items();
    const at = list.indexOf(document.activeElement as unknown as Item);
    if (at < 0) return;
    e.preventDefault();
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? list.length - 1
          : (at + (next.includes(e.key) ? 1 : -1) + list.length) % list.length;
    list[to].focus();
    if (select) (list[to] as unknown as HTMLElement).click?.();
  };
  root.addEventListener("keydown", onKey);
  return () => {
    observer.disconnect();
    root.removeEventListener("keydown", onKey);
  };
}

let region: HTMLElement | null = null;
/** Says `message` to screen readers, politely (after whatever they are reading now). */
export function announce(message: string) {
  if (!region?.isConnected) {
    region = document.createElement("div");
    region.className = "visually-hidden";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("role", "status");
    document.body.append(region);
  }
  // clear first, so the same message twice is still read twice
  region.textContent = "";
  const el = region;
  setTimeout(() => {
    el.textContent = message;
  }, 50);
}
