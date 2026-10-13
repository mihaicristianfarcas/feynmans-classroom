/* Capturing a region of a PDF page (a figure, a formula, a table): drag a box over the page; the
 * pixels are cut from the page's canvas and saved as a picture in attachments/. Then add it to your
 * note (linked to its page), with or without a transcription (LaTeX for formulas, a Markdown table,
 * or a description of a figure, by the model looking at it). */
import { useRef, useState } from "react";
import { type Book, learn, type Note } from "../api";
import { Spinner } from "../components/feedback";
import { Markdown } from "../components/Markdown";
import { pageEls } from "./anchoring";

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
  note,
  ensureNote,
  onNote,
  onDone,
  say,
}: {
  book: Book;
  root: HTMLElement | null;
  theme: "light" | "dark";
  note: Note | null;
  ensureNote: () => Promise<Note>;
  onNote: (n: Note) => void;
  onDone: () => void;
  say: (text: string, action?: { label: string; href: string }) => void;
}) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [shot, setShot] = useState<{ data: string; page: number; box: Box } | null>(null);
  const [busy, setBusy] = useState<{ what: string; at: number } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const saved = useRef<{ path: string; name: string } | null>(null);
  const frame = layer.current?.getBoundingClientRect();

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
      const pic = await save();
      const n = await ensureNote();
      const pageLink =
        book.folder && book.file
          ? `[[library/${book.folder}/${book.file}#page=${shot!.page}|${book.title}, p. ${shot!.page}]]`
          : `${book.title}, p. ${shot!.page}`;
      const md = `![[${pic.name}]]\n*${pageLink}*${withText && text ? `\n\n${text}` : ""}`;
      const updated = await learn.appendToNote(n.id, md);
      onNote(updated);
      say(`Added to “${updated.title}”.`, { label: "Open", href: `#/notes/${updated.id}` });
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
    : shot?.box;
  return (
    <div
      ref={layer}
      className="capture-layer"
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
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      tabIndex={-1}
    >
      {!shot && !drag && <div className="capture-hint">Drag a box around a figure, formula or table · Esc to stop</div>}
      {box && frame && (
        <div
          className="capture-box"
          style={{ left: box.x - frame.left, top: box.y - frame.top, width: box.w, height: box.h }}
        />
      )}
      {shot && frame && (
        <div
          className="capture-pop"
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
              Add to {note ? `“${note.title.length > 24 ? `${note.title.slice(0, 22)}…` : note.title}”` : "your note"}
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
