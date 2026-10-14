/* A book taken down from the shelf: it slides out spine first, tips toward you, turns to show its cover
 * as it reaches the middle of the screen, and opens. Inside the cover, a bookplate (whose library, its
 * number, when it was shelved); on the first page, what it is and how far you are, the way in, and
 * what can be done with it (rename it, move it to another topic, take it off the shelf). Esc puts it
 * back, along the way it came. Opened from the keyboard, or with reduced motion, it is simply there,
 * open. It is a dialog: focus moves in, stays in, and goes back to the spine. */
import { ArrowRight, ArrowUpRight, ChevronDown, PencilLine, Trash2 } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOPICS, topicOf } from "../../../shared/topics.ts";
import { api, type Book } from "../api";
import { useFocusTrap } from "../lib/a11y";
import { bylineOf, Cover, Spine, TopicIcon } from "./Spine";
import { fmtMinutes, hash, lookOf, minutesOf, progressOf } from "./shelf";

const ASPECT = 1.42;
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const SWING = "cubic-bezier(0.65, 0, 0.35, 1)";

interface Geometry {
  W: number;
  H: number;
  /** Thickness. */
  D: number;
  wide: boolean;
  vw: number;
  vh: number;
}

function measure(book: Book): Geometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const wide = vw >= 760;
  const W = Math.round(
    wide ? Math.min(320, (vw - 120) / 2, (vh - 120) / ASPECT) : Math.min(vw - 40, 340, (vh - 140) / ASPECT),
  );
  const H = Math.round(W * ASPECT);
  const look = lookOf(book);
  return { W, H, D: Math.max(16, Math.round((look.w * H) / look.h)), wide, vw, vh };
}

/** Where the book is, as one transform: moved, scaled, pushed back by half its depth, turned. */
const place = (x: number, y: number, s: number, z: number, turn: number, tip = 0, tilt = 0) =>
  `translate3d(${x}px, ${y}px, 0) scale3d(${s}, ${s}, ${s}) translateZ(${z}px) rotateY(${turn}deg) rotateX(${tip}deg) rotateZ(${tilt}deg)`;

/** From the spine on the shelf to your hands: pulled out, tipped toward you, turned to its cover. */
function flight(g: Geometry, spine: DOMRect): Keyframe[] {
  const dx = spine.left + spine.width / 2 - g.vw / 2;
  const dy = spine.top + spine.height / 2 - g.vh / 2;
  const k = spine.height / g.H;
  const mid = k + (1 - k) * 0.75;
  return [
    { offset: 0, transform: place(dx, dy, k, -g.W / 2, 90), easing: EASE },
    { offset: 0.22, transform: place(dx, dy - 16, k * 1.02, -g.W / 2 + 56, 90, -6), easing: SWING },
    { offset: 0.66, transform: place(dx * 0.2, dy * 0.2 - 12, mid, -g.D / 2 + 34, 26, -3, -1.2), easing: EASE },
    { offset: 1, transform: place(0, 0, 1, -g.D / 2, 0) },
  ];
}

type Phase = "arriving" | "open" | "closing" | "leaving";

interface Props {
  book: Book;
  /** The spine it was taken from; its place on the shelf stays empty meanwhile. */
  spine: HTMLElement | null;
  /** Fly it out and open it (false: from the keyboard, or with reduced motion). */
  animate: boolean;
  /** Whose library it is (the profile's name). */
  owner: string;
  onClose: () => void;
  onRead: (book: Book) => void;
  onChange: (book: Book, change: { title?: string; topic?: string }) => void;
  onRemove: (book: Book) => void;
}

export function BookInHand({ book, spine, animate, owner, onClose, onRead, onChange, onRemove }: Props) {
  const [g] = useState(() => measure(book));
  const [phase, setPhase] = useState<Phase>(animate ? "arriving" : "open");
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const bookEl = useRef<HTMLDivElement>(null);
  const coverEl = useRef<HTMLDivElement>(null);
  const shiftEl = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const look = lookOf(book);
  const shift = g.wide ? g.W / 2 : 0;
  const coverZ = `translateZ(${g.D / 2}px)`;
  const pct = progressOf(book);
  const reading = pct > 0.01 && pct < 0.98;

  // the reader is fetched while the book is in your hands, so it opens on it at once
  useEffect(() => {
    api.fetchAhead(book);
    void import("../reader/Reader").catch(() => {});
  }, [book]);

  // its place on the shelf is empty while you hold it
  useLayoutEffect(() => {
    if (!spine) return;
    spine.style.visibility = "hidden";
    return () => {
      spine.style.visibility = "";
    };
  }, [spine]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: flies once, when it is taken down
  useLayoutEffect(() => {
    const b = bookEl.current!;
    const c = coverEl.current!;
    const s = shiftEl.current!;
    const rect = spine?.getBoundingClientRect();
    if (!animate || !rect || rect.height === 0) {
      b.style.transform = place(0, 0, 1, -g.D / 2, 0);
      c.style.transform = `${coverZ} rotateY(-180deg)`;
      s.style.transform = `translateX(${shift}px)`;
      return;
    }
    const fly = b.animate(flight(g, rect), { duration: 640, fill: "forwards" });
    // the cover starts to open just before the book lands, so the two read as one movement
    const opening: KeyframeAnimationOptions = { duration: 560, delay: 500, easing: SWING, fill: "forwards" };
    c.animate([{ transform: `${coverZ} rotateY(0deg)` }, { transform: `${coverZ} rotateY(-180deg)` }], opening);
    s.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${shift}px)` }], opening);
    const t = setTimeout(() => setPhase("open"), 760);
    return () => {
      clearTimeout(t);
      fly.cancel();
    };
  }, []);

  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    setPhase("closing");
    const b = bookEl.current!;
    const c = coverEl.current!;
    const s = shiftEl.current!;
    const rect = spine?.getBoundingClientRect();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // back along the way it came, if its place is still on screen; otherwise it just goes
    if (!animate || reduced || !rect || rect.bottom < 0 || rect.top > innerHeight) {
      await stage.current
        ?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" })
        .finished.catch(() => {});
      return onClose();
    }
    const shut: KeyframeAnimationOptions = { duration: 420, easing: SWING, fill: "forwards" };
    for (const a of c.getAnimations()) a.cancel();
    c.animate([{ transform: `${coverZ} rotateY(-180deg)` }, { transform: `${coverZ} rotateY(0deg)` }], shut);
    s.animate([{ transform: `translateX(${shift}px)` }, { transform: "translateX(0px)" }], shut);
    const back = flight(measure(book), rect)
      .map((k) => ({ ...k, offset: 1 - (k.offset as number) }))
      .reverse()
      .map((k, i, all) => ({ ...k, easing: i < all.length - 1 ? EASE : undefined }));
    for (const a of b.getAnimations()) a.cancel();
    await b.animate(back, { duration: 560, delay: 300, fill: "forwards" }).finished.catch(() => {});
    onClose();
  }, [animate, book, coverZ, onClose, shift, spine]);

  const read = () => {
    setPhase("leaving");
    setTimeout(() => onRead(book), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 170);
  };

  const refocus = (selector: string) =>
    requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }));
  useFocusTrap(stage, true, {
    // Escape steps back out of confirming a removal first, then puts the book back
    onEscape: () => {
      if (removing) {
        setRemoving(false);
        refocus(".bih-read");
      } else void close();
    },
    initial: ".bih-read",
  });
  useEffect(() => {
    const before = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = before;
    };
  }, []);

  const topic = topicOf(book.topic);
  const facts = [
    book.format === "pdf" && book.pageCount ? `${book.pageCount} pages` : null,
    book.toc.length > 1 ? `${book.toc.length} chapters` : null,
    book.demoCount ? `${book.demoCount} figure${book.demoCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  const host = book.source?.url ? new URL(book.source.url).hostname.replace(/^www\./, "") : null;
  const shelved = new Date(book.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return createPortal(
    <div
      className="bih-stage"
      ref={stage}
      data-phase={phase}
      data-animate={animate || undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bih-title"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a click beside the book puts it back; Escape and "Put it back" do the same */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: as above */}
      <div className="bih-backdrop" onClick={() => void close()} />
      <div className="bih-world">
        <div className="bih-shift" ref={shiftEl}>
          <div
            className="bih-book"
            ref={bookEl}
            style={
              {
                width: g.W,
                height: g.H,
                marginLeft: -g.W / 2,
                marginTop: -g.H / 2,
                transform: animate && spine ? "scale(0)" : place(0, 0, 1, -g.D / 2, 0),
              } as CSSProperties
            }
          >
            {/* the back board, the spine and the edges of the pages */}
            <div
              className="bih-face bih-board"
              data-tone={look.tone}
              data-shade={look.shade}
              style={{ transform: `rotateY(180deg) translateZ(${g.D / 2}px)` }}
            />
            <div
              className="bih-face bih-spine"
              style={{ width: g.D, left: (g.W - g.D) / 2, transform: `rotateY(-90deg) translateZ(${g.W / 2}px)` }}
            >
              <div
                style={{ transform: `scale(${g.H / look.h})`, transformOrigin: "0 0", width: look.w, height: look.h }}
              >
                <Spine book={book} look={look} reading={false} />
              </div>
            </div>
            <div
              className="bih-face bih-edge"
              style={{
                width: g.D - 6,
                height: g.H - 8,
                top: 4,
                left: (g.W - g.D + 6) / 2,
                transform: `rotateY(90deg) translateZ(${g.W / 2 - 4}px)`,
              }}
            />
            {[90, -90].map((tip) => (
              <div
                key={tip}
                className="bih-face bih-edge"
                data-across=""
                style={{
                  width: g.W - 6,
                  height: g.D - 6,
                  left: 2,
                  top: (g.H - g.D + 6) / 2,
                  transform: `rotateX(${tip}deg) translateZ(${g.H / 2 - 4}px)`,
                }}
              />
            ))}
            <div
              className="bih-face bih-board"
              data-inside=""
              data-tone={look.tone}
              data-shade={look.shade}
              style={{ transform: `translateZ(${g.D / 2 - 6}px)` }}
            />

            {/* the first page: what it is, how far you are, the way in */}
            <div
              className="bih-face bih-page"
              style={{ width: g.W - 9, height: g.H - 12, top: 6, left: 1, transform: `translateZ(${g.D / 2 - 2}px)` }}
            >
              <div className="bih-page-in">
                <div className="bih-kicker">
                  <label className="bih-topic" data-tone={book.topic ? topic.tone : undefined}>
                    <TopicIcon topic={book.topic} size={14} />
                    <span>{book.topic ? topic.name : "Not sorted yet"}</span>
                    <ChevronDown className="bih-caret" aria-hidden="true" />
                    <select
                      value={book.topic || ""}
                      aria-label="Topic"
                      onChange={(e) => onChange(book, { topic: e.target.value })}
                    >
                      {!book.topic && <option value="">Not sorted yet</option>}
                      {TOPICS.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Rename"
                    title="Rename"
                    onClick={() => setRenaming(true)}
                  >
                    <PencilLine aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Remove from the library"
                    title="Remove from the library"
                    onClick={() => setRemoving(true)}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
                {renaming ? (
                  <TitleField
                    title={book.title}
                    onDone={(title) => {
                      setRenaming(false);
                      if (title && title !== book.title) onChange(book, { title });
                      refocus('[aria-label="Rename"]');
                    }}
                  />
                ) : (
                  <h2 id="bih-title" className="bih-title">
                    {book.title}
                  </h2>
                )}
                <p className="bih-by">
                  {bylineOf(book)}
                  <span className="bih-meta">
                    {host && book.author ? ` · ${host}` : ""} · {fmtMinutes(minutesOf(book))}
                  </span>
                </p>
                {book.summary && <p className="bih-summary">{book.summary}</p>}
                {(book.tags?.length || facts.length) > 0 && (
                  <p className="bih-tags">
                    {facts.map((f) => (
                      <span key={f} className="bih-fact">
                        {f}
                      </span>
                    ))}
                    {book.tags?.map((t) => (
                      <span key={t} className="tag-pill">
                        {t}
                      </span>
                    ))}
                  </p>
                )}
                <div className="bih-progress">
                  <span className="bih-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(pct * 100)}%` }} />
                  </span>
                  <span>{pct >= 0.98 ? "Read" : reading ? `${Math.round(pct * 100)}% read` : "Not started"}</span>
                </div>
                <div className="bih-actions">
                  {removing ? (
                    <fieldset className="bih-remove">
                      <legend>Remove it, with its figures and margin?</legend>
                      <div className="row">
                        <button type="button" className="button danger" onClick={() => onRemove(book)}>
                          Remove
                        </button>
                        <button
                          type="button"
                          className="button"
                          // biome-ignore lint/a11y/noAutofocus: the safe choice takes focus when asked to confirm
                          autoFocus
                          onClick={() => {
                            setRemoving(false);
                            refocus(".bih-read");
                          }}
                        >
                          Keep it
                        </button>
                      </div>
                    </fieldset>
                  ) : (
                    <button type="button" className="button primary bih-read" onClick={read}>
                      {pct >= 0.98 ? "Read again" : reading ? "Continue reading" : "Start reading"}
                      <ArrowRight aria-hidden="true" />
                    </button>
                  )}
                  <div className="bih-sub">
                    {book.source?.url ? (
                      <a href={book.source.url} target="_blank" rel="noreferrer noopener" className="link">
                        {host}
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                    ) : (
                      <span />
                    )}
                    <button type="button" className="link" onClick={() => void close()}>
                      Put it back <kbd>Esc</kbd>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* the front board: the cover outside, the bookplate inside */}
            <div className="bih-cover" ref={coverEl} style={{ transform: `${coverZ} rotateY(0deg)` }}>
              <div className="bih-face bih-front">
                <Cover book={book} look={look} />
              </div>
              <div className="bih-face bih-inside" data-tone={look.tone}>
                <div className="bookplate">
                  <span className="bookplate-mark">
                    <TopicIcon topic={book.topic} size={30} />
                  </span>
                  <span className="bookplate-head">From the library of</span>
                  <span className="bookplate-name">{owner || "a curious reader"}</span>
                  <span className="bookplate-rule" />
                  <span className="bookplate-meta">
                    No. {(hash(book.id) % 900) + 100} · shelved {shelved}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The title as a field: Enter (or leaving it) keeps the new name, Escape the old one. */
function TitleField({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = useRef((value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value === null ? null : value.replace(/\s+/g, " ").trim());
  });
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
    // listened to on the field itself, so Escape cancels the new name before the dialog hears it
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish.current(input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish.current(null);
      }
    };
    input.addEventListener("keydown", onKey);
    return () => input.removeEventListener("keydown", onKey);
  }, []);
  return (
    <input
      ref={ref}
      id="bih-title"
      className="bih-title bih-title-field"
      defaultValue={title}
      aria-label="Title"
      spellCheck={false}
      onBlur={(e) => finish.current(e.currentTarget.value)}
    />
  );
}
