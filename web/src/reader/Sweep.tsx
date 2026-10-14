/* A highlighter drawn across a passage the moment you mark it or ask about it: a wash in the mark's
 * colour sweeps along each of its lines, left to right, one line after the other, then gives way to the
 * mark itself. It follows the book if it scrolls meanwhile. With reduced motion there is no sweep: the
 * mark is simply there. */
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Anchor } from "../api";
import type { ReaderHandle } from "./readers";

export interface SweepRequest {
  /** The annotation it is for. */
  id: string;
  anchor: Anchor;
  /** A highlighter's colour (yellow, green, blue, pink, purple). */
  color: string;
}

const LONGEST = 1200;

export function Sweep({
  sweep,
  reader,
  bus,
  onDone,
}: {
  sweep: SweepRequest;
  reader: ReaderHandle | null;
  bus: EventTarget;
  onDone: () => void;
}) {
  const [boxes, setBoxes] = useState<DOMRect[]>([]);
  useLayoutEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return onDone();
    const measure = () => setBoxes(reader?.boxesOf(sweep.anchor, sweep.id) ?? []);
    measure();
    bus.addEventListener("scroll", measure);
    return () => bus.removeEventListener("scroll", measure);
  }, [sweep, reader, bus, onDone]);
  useEffect(() => {
    const t = setTimeout(onDone, Math.min(LONGEST, 700 + boxes.length * 60));
    return () => clearTimeout(t);
  }, [onDone, boxes.length]);
  if (!boxes.length) return null;
  return createPortal(
    <div className="sweep" data-color={sweep.color} aria-hidden="true">
      {boxes.map((b, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a passage's lines are fixed for the sweep
          key={i}
          style={{
            left: b.left,
            top: b.top,
            width: b.width,
            height: b.height,
            animationDelay: `${Math.min(i, 8) * 60}ms`,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
