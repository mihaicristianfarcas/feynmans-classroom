/* Capturing a region of a PDF page (a figure, a formula, a table): drag a box over the page (or, from
 * the keyboard, place one with the arrow keys, Shift to resize, Enter to capture); the pixels are cut
 * from the page's canvas and saved as a picture in attachments/. Then add it to your
 * note (linked to its page), with or without a transcription (LaTeX for formulas, a Markdown table,
 * or a description of a figure, by the model looking at it). */
import { useEffect, useRef, useState } from "react";
import { type Book, learn, vaults } from "../api";
import { Spinner } from "../components/feedback";
import { Markdown } from "../components/Markdown";
import { noteRoute } from "../vaults/routes";
import { pageEls } from "./anchoring";
import type { VaultTarget } from "./session";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cuts a client-space box out of the PDF page it lies on, as a PNG data URL (with the page number). */
function cut(root: HTMLElement, box: Box): { data: string; page: number } | null {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const page = pageEls(root).find((p) => {
    const r = p.el.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  });
  const canvas = page?.el.querySelector("canvas");
  if (!page || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  const sx = canvas.width / r.width;
  const sy = canvas.height / r.height;
  const x = Math.max(0, (box.x - r.left) * sx);
  const y = Math.max(0, (box.y - r.top) * sy);
  const w = Math.min(canvas.width - x, box.w * sx);
  const h = Math.min(canvas.height - y, box.h * sy);
  if (w < 4 || h < 4) return null;
  const out = document.createElement("canvas");
  out.width = Math.round(w);
  out.height = Math.round(h);
  out.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
  return { data: out.toDataURL("image/png"), page: page.page };
}

export function CaptureLayer({
  book,
  root,
  theme,
  noteTitle,
  ensureNote,
  onDone,
  say,
}: {
  book: Book;
  root: HTMLElement | null;
  theme: "light" | "dark";
  noteTitle?: string;
  ensureNote: () => Promise<VaultTarget>;
  onDone: () => void;
  say: (text: string, action?: { label: string; href: string }) => void;
}) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [shot, setShot] = useState<{ data: string; page: number; box: Box } | null>(null);
  const [busy, setBusy] = useState<{ what: string; at: number } | null>(null);
  const [text, setText] = useState<string | null>(null);
  /** The box placed from the keyboard (client coordinates). */
  const [keyBox, setKeyBox] = useState<Box | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const saved = useRef<{ path: string; name: string } | null>(null);
  const frame = layer.current?.getBoundingClientRect();
  // the layer takes focus, so Escape and the arrow keys work at once; a capture hands focus to its buttons
  useEffect(() => layer.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (shot) pop.current?.querySelector<HTMLElement>("button")?.focus();
  }, [shot]);

  /** A first box from the keyboard: the width of the page in the middle of the view, a third of its height. */
  const firstBox = (): Box | null => {
    const view = layer.current?.getBoundingClientRect();
    if (!view || !root) return null;
    const cy = view.top + view.height * 0.4;
    const page = pageEls(root).find((p) => {
      const r = p.el.getBoundingClientRect();
      return cy >= r.top && cy <= r.bottom;
    });
    if (!page) return null;
    const r = page.el.getBoundingClientRect();
    return { x: r.left + r.width * 0.08, y: cy - r.height * 0.12, w: r.width * 0.84, h: r.height * 0.24 };
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onDone();
    if (shot) return;
    const step = e.altKey ? 2 : 12;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setKeyBox((b) => {
        const from = b ?? firstBox();
        if (!from) return b;
        return e.shiftKey
          ? { ...from, w: Math.max(16, from.w + dx), h: Math.max(16, from.h + dy) }
          : { ...from, x: from.x + dx, y: from.y + dy };
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const b = keyBox ?? firstBox();
      const got = b && root ? cut(root, b) : null;
      if (got && b) {
        setShot({ ...got, box: b });
        setKeyBox(null);
      } else say("Move the box over a page of the book.");
    }
  };

  const save = async () => {
    if (!shot) throw new Error("nothing captured");
    if (!saved.current)
      saved.current = await learn.attach(
        shot.data,
        `${book.title.slice(0, 50)} p${shot.page} ${new Date().toISOString().slice(11, 19).replace(/:/g, ".")}`,
      );
    return saved.current;
  };
  const addToNote = async (withText: boolean) => {
    setBusy({ what: "Adding to your note", at: Date.now() });
    try {
      const n = await ensureNote();
      // the picture goes in the vault, where Obsidian keeps attachments
      const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, ".");
      const pic = await vaults.attach(
        n.vault,
        shot!.data,
        `${book.title.slice(0, 50)} p${shot!.page} ${stamp}.png`,
        n.path,
      );
      const title = book.title.replace(/[[\]|#^]/g, "");
      const md = `${pic.embed}\n*[[${title}#page=${shot!.page}|${title}, p. ${shot!.page}]]*${withText && text ? `\n\n${text}` : ""}`;
      await vaults.append(n.vault, n.path, md);
      say(`Added to “${n.title}”.`, { label: "Open", href: noteRoute(n.vault, n.path) });
      onDone();
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const transcribe = async () => {
    setBusy({ what: "Reading it", at: Date.now() });
    try {
      const pic = await save();
      setText((await learn.transcribe(pic.path)).markdown);
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const box = drag
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        w: Math.abs(drag.x1 - drag.x0),
        h: Math.abs(drag.y1 - drag.y0),
      }
    : (keyBox ?? shot?.box);
  return (
    <div
      ref={layer}
      className="capture-layer"
      role="application"
      aria-label="Capture a region of the page: arrow keys move the box, Shift and the arrow keys resize it, Enter captures, Escape stops"
      onPointerDown={(e) => {
        if (shot || (e.target as HTMLElement).closest(".capture-pop")) return;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
      }}
      onPointerMove={(e) => drag && setDrag({ ...drag, x1: e.clientX, y1: e.clientY })}
      onPointerUp={() => {
        if (!drag || !root) return;
        const b = {
          x: Math.min(drag.x0, drag.x1),
          y: Math.min(drag.y0, drag.y1),
          w: Math.abs(drag.x1 - drag.x0),
          h: Math.abs(drag.y1 - drag.y0),
        };
        setDrag(null);
        const got = b.w > 8 && b.h > 8 ? cut(root, b) : null;
        if (got) setShot({ ...got, box: b });
        else if (b.w > 8) say("Drag over a page of the book.");
      }}
      onKeyDown={onKey}
      tabIndex={-1}
    >
      {!shot && !drag && (
        <div className="capture-hint">
          Drag a box around a figure, formula or table (or use the arrow keys, then Enter) · Esc to stop
        </div>
      )}
      {box && frame && (
        <div
          className="capture-box"
          style={{ left: box.x - frame.left, top: box.y - frame.top, width: box.w, height: box.h }}
        />
      )}
      {shot && frame && (
        <div
          className="capture-pop"
          ref={pop}
          style={{
            left: Math.min(frame.width - 380, Math.max(10, shot.box.x - frame.left)),
            top: Math.min(frame.height - 120, shot.box.y - frame.top + shot.box.h + 10),
          }}
        >
          <img src={shot.data} alt="The captured region" />
          {text !== null && <Markdown text={text} theme={theme} className="capture-text" />}
          {busy && <Spinner label={busy.what} since={busy.at} />}
          <div className="row gap">
            <button type="button" className="button primary" disabled={!!busy} onClick={() => addToNote(text !== null)}>
              Add to {noteTitle ? `“${noteTitle.length > 24 ? `${noteTitle.slice(0, 22)}…` : noteTitle}”` : "your note"}
            </button>
            {text === null && (
              <button
                type="button"
                className="button"
                disabled={!!busy}
                onClick={transcribe}
                title="The model reads the picture: LaTeX for formulas, a table, or a description"
              >
                Transcribe
              </button>
            )}
            <span className="spacer" />
            <button
              type="button"
              className="link"
              onClick={() => {
                setShot(null);
                setText(null);
                saved.current = null;
              }}
            >
              Again
            </button>
            <button type="button" className="link" onClick={onDone}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
