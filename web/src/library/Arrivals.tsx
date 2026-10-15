/* Links being saved and books that just arrived, in a card at the bottom of the library: the page each
 * link is being read from, then the book's cover and title as it lands on the shelf, with a way to open
 * it, or to take a whole batch back off. It goes once everything has landed (it stays while you point at
 * it or Tab into it), and says what happened to screen readers. */
import { Check, CircleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Book } from "../api";
import { Spinner } from "../components/feedback";
import { Cover } from "./Spine";
import { lookOf } from "./shelf";

export interface Save {
  key: string;
  url: string;
  status: "saving" | "saved" | "failed";
  book?: Book;
  error?: string;
}

const hostOf = (url: string) => {
  try {
    return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function Arrivals({
  saves,
  onOpen,
  onUndo,
  onDismiss,
}: {
  saves: Save[];
  onOpen: (book: Book) => void;
  onUndo: (books: Book[]) => void;
  onDismiss: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);
  const busy = saves.some((s) => s.status === "saving");
  const saved = saves.filter((s) => s.status === "saved" && s.book).map((s) => s.book!);
  const failed = saves.filter((s) => s.status === "failed");

  // once all have landed (and none failed), it goes by itself, unless you're using it
  useEffect(() => {
    if (busy || failed.length || held || !saves.length) return;
    const t = setTimeout(onDismiss, 7000);
    return () => clearTimeout(t);
  }, [busy, failed.length, held, saves.length, onDismiss]);

  if (!saves.length) return null;
  const reading = saves.find((s) => s.status === "saving");
  const latest = saved.at(-1);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointing at the card keeps it open; focus does the same
    <div
      className="arrivals"
      ref={box}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && setHeld(false)}
    >
      <div className="arrivals-head">
        <span className="arrivals-what" role="status">
          {reading ? (
            <Spinner label={`Reading ${hostOf(reading.url)}…`} />
          ) : failed.length && !saved.length ? (
            <>
              <CircleAlert aria-hidden="true" />{" "}
              {failed.length === 1 ? "Couldn’t save that link" : "Couldn’t save those links"}
            </>
          ) : (
            <>
              <Check aria-hidden="true" />{" "}
              {saved.length === 1 ? "Saved to your library" : `${saved.length} saved to your library`}
            </>
          )}
        </span>
        {saves.length > 1 && (
          <span className="arrivals-count">
            {saved.length + failed.length} of {saves.length}
          </span>
        )}
        <button type="button" className="icon-button" aria-label="Close" onClick={onDismiss}>
          <X aria-hidden="true" />
        </button>
      </div>
      {latest && (
        <div className="arrivals-latest">
          <span className="arrivals-covers" aria-hidden="true">
            {saved.slice(-5).map((b) => (
              <span key={b.id} className="arrivals-cover">
                <Cover book={b} look={lookOf(b)} />
              </span>
            ))}
          </span>
          <span className="arrivals-title">{latest.title}</span>
          <span className="spacer" />
          <button type="button" className="button" onClick={() => onOpen(latest)}>
            Open
          </button>
          <button type="button" className="button subtle" onClick={() => onUndo(saved)}>
            {saved.length > 1 ? "Undo all" : "Undo"}
          </button>
        </div>
      )}
      {failed.map((f) => (
        <p key={f.key} className="arrivals-error">
          <strong>{hostOf(f.url)}</strong> {f.error}
        </p>
      ))}
    </div>
  );
}
