/* The margin: what was made from passages (explanations, definitions, answers, figures, resources,
 * comments), each as a card at the height of its passage, as in a well-annotated book. Cards never
 * overlap: the focused one sits exactly by its passage and the others make room above and below it
 * (as comments do in a shared document). A thin line joins the focused card to its passage.
 *
 * Positions follow the book's scroll without React re-rendering: the reader announces each scroll
 * frame on `bus`, and the margin moves its cards directly. */
import { ArrowUp, Copy, Ellipsis, FileText, Link2, Maximize2, Quote, SquarePlus, Trash2, X } from "lucide-react";
import { memo, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Annotation, type Book, type Demo, learn } from "./api";
import { Markdown } from "./Markdown";
import type { ReaderHandle } from "./readers";
import { Spinner, timeAgo } from "./Shell";
import { SceneView } from "./scene/SceneView";

export type MarginItem =
  | { id: string; annotation: Annotation; demo?: undefined }
  | { id: string; demo: Demo; annotation?: undefined };

const GAP = 8;
const KIND: Record<string, string> = {
  explain: "Explain",
  define: "Define",
  ask: "Ask",
  visualize: "Figure",
  resources: "Resources",
  highlight: "Highlight",
  comment: "Comment",
};
const COLORS = ["yellow", "green", "blue", "pink", "purple"];

interface Props {
  book: Book;
  items: MarginItem[];
  reader: RefObject<ReaderHandle | null>;
  bus: EventTarget;
  focused: string | null;
  setFocused: (id: string | null) => void;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  leader: RefObject<SVGPathElement | null>;
  theme: "light" | "dark";
  onToNote: (a: Annotation, mode: "embed" | "passage" | "reference") => void;
  onOpenDemo: (demo: Demo) => void;
  toast: (text: string) => void;
}

export function Margin({
  book,
  items,
  reader,
  bus,
  focused,
  setFocused,
  hovered,
  setHovered,
  leader,
  theme,
  onToNote,
  onOpenDemo,
  toast,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [shown, setShown] = useState<string[]>([]);
  const shownRef = useRef<string[]>([]);
  const scrolling = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Where each item's passage is on screen right now (client y), or null when its page isn't rendered. */
  const anchorY = useCallback(
    (item: MarginItem): number | null => {
      const r = reader.current;
      if (!r) return null;
      if (item.annotation) {
        const a = item.annotation.anchor;
        const boxes = r.boxesOf(a, item.id);
        if (boxes?.length) return boxes[0].top;
        if (a.page !== undefined) return r.clientYOf({ page: a.page, y: a.y ?? 0 });
        return r.clientYOf({ block: a.block ?? 0 });
      }
      return r.clientYOf(item.demo!.anchor);
    },
    [reader],
  );

  const layout = useCallback(() => {
    const host = box.current;
    if (!host) return;
    const frame = host.getBoundingClientRect();
    const placed = items
      .map((item) => ({ item, y: anchorY(item) }))
      .filter((p): p is { item: MarginItem; y: number } => p.y !== null);
    placed.sort((a, b) => a.y - b.y);
    // which cards to render: those whose passage is near the screen (a screen above and below)
    const near = placed
      .filter(
        (p) =>
          p.y > frame.top - frame.height * 1.2 &&
          p.y < frame.bottom + frame.height * 1.2 &&
          (p.item.annotation?.kind !== "highlight" || p.item.id === focused),
      )
      .map((p) => p.item.id);
    if (near.join() !== shownRef.current.join()) {
      shownRef.current = near;
      setShown(near);
    }
    const list = placed.filter((p) => cards.current.has(p.item.id));
    const tops = list.map((p) => p.y - frame.top);
    const heights = list.map((p) => cards.current.get(p.item.id)!.offsetHeight);
    const f = list.findIndex((p) => p.item.id === focused);
    if (f >= 0) {
      for (let i = f - 1; i >= 0; i--) tops[i] = Math.min(tops[i], tops[i + 1] - heights[i] - GAP);
      for (let i = f + 1; i < list.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + heights[i - 1] + GAP);
    } else {
      for (let i = 1; i < list.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + heights[i - 1] + GAP);
    }
    list.forEach((p, i) => {
      const el = cards.current.get(p.item.id)!;
      el.style.transform = `translateY(${Math.round(tops[i])}px)`;
      el.style.visibility = "visible";
    });
    // the line from the focused (or hovered) card to its passage
    const path = leader.current;
    if (path) {
      const which = list.findIndex((p) => p.item.id === (focused || hovered));
      const svg = path.ownerSVGElement?.getBoundingClientRect();
      if (which >= 0 && svg) {
        const p = list[which];
        const x1 = frame.right - 1 - svg.left;
        const y1 = frame.top + tops[which] + 15 - svg.top;
        const boxes = p.item.annotation ? reader.current?.boxesOf(p.item.annotation.anchor, p.item.id) : null;
        const target = boxes?.[0];
        const x2 = (target ? target.left : frame.right + 40) - svg.left - 2;
        const y2 = (target ? target.top + target.height / 2 : p.y + 8) - svg.top;
        const inView = y1 > 0 && y1 < svg.height && y2 > -20 && y2 < svg.height + 20;
        if (inView) {
          const mid = x1 + Math.max(16, (x2 - x1) * 0.45);
          path.setAttribute("d", `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`);
          path.style.opacity = "1";
          return;
        }
      }
      path.style.opacity = "0";
    }
  }, [items, anchorY, focused, hovered, leader, reader]);

  useEffect(() => {
    const onScroll = () => {
      box.current?.setAttribute("data-scrolling", "");
      clearTimeout(scrolling.current);
      scrolling.current = setTimeout(() => box.current?.removeAttribute("data-scrolling"), 160);
      layout();
    };
    bus.addEventListener("scroll", onScroll);
    return () => bus.removeEventListener("scroll", onScroll);
  }, [bus, layout]);
  useLayoutEffect(() => {
    layout();
  });
  // cards change height as answers arrive and figures render
  // biome-ignore lint/correctness/useExhaustiveDependencies: observes the cards again whenever the set of shown cards changes
  useEffect(() => {
    const ro = new ResizeObserver(() => layout());
    for (const el of cards.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [shown, layout]);
  useEffect(() => () => leader.current?.style.setProperty("opacity", "0"), [leader]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const visible = shown.map((id) => byId.get(id)).filter((x): x is MarginItem => !!x);
  return (
    <div className="margin" ref={box} onClick={(e) => e.target === box.current && setFocused(null)}>
      {visible.map((item) => (
        <div
          key={item.id}
          className="margin-slot"
          ref={(el) => {
            if (el) cards.current.set(item.id, el);
            else cards.current.delete(item.id);
          }}
          onMouseEnter={() => setHovered(item.id)}
          onMouseLeave={() => setHovered(null)}
        >
          {item.annotation ? (
            <AnnotationCard
              a={item.annotation}
              book={book}
              open={item.id === focused}
              theme={theme}
              onOpen={() => setFocused(item.id)}
              onClose={() => setFocused(null)}
              onToNote={onToNote}
              toast={toast}
            />
          ) : (
            <DemoCard
              demo={item.demo!}
              open={item.id === focused}
              theme={theme}
              onOpen={() => setFocused(item.id)}
              onClose={() => setFocused(null)}
              onOpenDemo={onOpenDemo}
            />
          )}
        </div>
      ))}
      {!items.some((i) => i.annotation && i.annotation.kind !== "highlight") && !items.some((i) => i.demo) && (
        <div className="margin-empty rise">
          <p className="margin-empty-title">The margin</p>
          <p className="fine">
            Select a passage in the book and choose Explain, Visualize, Ask or Define. The answer appears here, beside
            the passage, and is saved with the book in your vault.
          </p>
        </div>
      )}
    </div>
  );
}

/* ---------------- an annotation ---------------- */

const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (_, a, b) => b || a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>`~=]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const AnnotationCard = memo(function AnnotationCard({
  a,
  book,
  open,
  theme,
  onOpen,
  onClose,
  onToNote,
  toast,
}: {
  a: Annotation;
  book: Book;
  open: boolean;
  theme: "light" | "dark";
  onOpen: () => void;
  onClose: () => void;
  onToNote: Props["onToNote"];
  toast: (t: string) => void;
}) {
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [comment, setComment] = useState(a.body);
  const [redrawing, setRedrawing] = useState(false);
  const where = a.anchor.page !== undefined ? `p. ${a.anchor.page}` : "";
  const label = a.kind === "visualize" && a.title ? "Figure" : KIND[a.kind];
  const pending = a.status === "pending";
  const since = pending ? new Date(a.updated || a.created).getTime() : 0;

  if (!open)
    return (
      <button
        type="button"
        className="mcard collapsed"
        data-kind={a.kind}
        data-status={a.status}
        data-color={a.color}
        onClick={onOpen}
        title="Open"
      >
        <span className="mcard-label">
          <b>{label}</b>
          {a.kind === "visualize" && a.title
            ? ` · ${a.title}`
            : a.request
              ? ` “${a.request.length > 60 ? `${a.request.slice(0, 58)}…` : a.request}”`
              : ` “${a.anchor.quote.slice(0, 42)}${a.anchor.quote.length > 42 ? "…" : ""}”`}
          <span className="where">{where}</span>
        </span>
        {pending ? (
          <span className="skeleton short" />
        ) : a.status === "failed" ? (
          <span className="mcard-excerpt error">Couldn’t finish: {a.error}</span>
        ) : a.kind === "comment" || a.body ? (
          <span className="mcard-excerpt">
            {plain(a.kind === "visualize" ? a.body.split("```")[0].replace(/^##[^\n]*\n/, "") : a.body).slice(0, 180) ||
              "(figure)"}
          </span>
        ) : null}
      </button>
    );

  return (
    <article
      className="mcard open"
      data-kind={a.kind}
      data-status={a.status}
      data-color={a.color}
      onClick={(e) => e.stopPropagation()}
    >
      <header className="mcard-head">
        <span className="mcard-kind">{label}</span>
        {where && <span className="chip-where">{where}</span>}
        <span className="spacer" />
        <div className="menu-host">
          <button
            type="button"
            className="mcard-icon"
            aria-label="More"
            title="More"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            <Ellipsis aria-hidden="true" />
          </button>
          {menu && (
            <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onToNote(a, "embed");
                }}
              >
                <SquarePlus aria-hidden="true" />
                Add to note{a.kind === "highlight" ? "" : " (with the answer)"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onToNote(a, "passage");
                }}
              >
                <Quote aria-hidden="true" />
                Add the passage to note
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  onToNote(a, "reference");
                }}
              >
                <Link2 aria-hidden="true" />
                Add a reference to note
              </button>
              <div className="menu-sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  void navigator.clipboard
                    ?.writeText(`${a.anchor.quote}\n\n${a.body}`.trim())
                    .then(() => toast("Copied."));
                }}
              >
                <Copy aria-hidden="true" />
                Copy
              </button>
              <a
                role="menuitem"
                href={`#/open?target=${encodeURIComponent(a.path.replace(/\.md$/, ""))}`}
                onClick={() => setMenu(false)}
                title={a.path}
              >
                <FileText aria-hidden="true" />
                Show the file
              </a>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={async () => {
                  setMenu(false);
                  await learn.deleteAnnotation(a.id);
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </button>
            </div>
          )}
        </div>
        <button type="button" className="mcard-icon" aria-label="Collapse" title="Collapse (Esc)" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      <blockquote className="mcard-quote">
        {a.anchor.quote.length > 420 ? `${a.anchor.quote.slice(0, 420)}…` : a.anchor.quote}
      </blockquote>
      {a.request && a.kind !== "comment" && <p className="mcard-request">{a.request}</p>}
      {a.kind === "highlight" || a.kind === "comment" ? (
        <div className="mcard-comment">
          <div className="colors" role="group" aria-label="Colour">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className="color-dot"
                data-color={c}
                aria-pressed={(a.color || "yellow") === c}
                aria-label={c}
                onClick={() => learn.updateAnnotation(a.id, { color: c })}
              />
            ))}
          </div>
          <textarea
            rows={2}
            value={comment}
            placeholder="Add a comment…"
            onChange={(e) => setComment(e.target.value)}
            onBlur={() =>
              comment !== a.body &&
              learn.updateAnnotation(a.id, { body: comment, kind: comment.trim() ? "comment" : "highlight" })
            }
          />
        </div>
      ) : pending ? (
        <div className="mcard-body">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton short" />
          <Spinner
            label={a.kind === "visualize" ? "Drawing" : a.kind === "resources" ? "Searching" : "Thinking"}
            since={since}
          />
        </div>
      ) : a.status === "failed" ? (
        <div className="mcard-body">
          <p className="form-error">{a.error}</p>
          <button
            type="button"
            className="button"
            onClick={() => (a.kind === "visualize" ? learn.redraw(a.id) : learn.retryAnnotation(a.id))}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="mcard-body">
          <Markdown text={a.body} theme={theme} className="mcard-md" base={a.path} />
        </div>
      )}
      <footer className="mcard-foot">
        <span className="fine">
          {a.model
            ? `${a.model.name || a.model.provider}${a.model.ms ? ` · ${Math.round(a.model.ms / 1000)} s` : ""} · `
            : ""}
          {timeAgo(a.created)}
        </span>
        <span className="spacer" />
        {a.kind === "visualize" && !pending && (
          <button type="button" className="link" onClick={() => setRedrawing((r) => !r)}>
            Redraw
          </button>
        )}
      </footer>
      {GENERATED.includes(a.kind) && !pending && a.status !== "failed" && (
        <form
          className="mcard-ask"
          onSubmit={async (e) => {
            e.preventDefault();
            const q = ask.trim();
            if (!q || asking) return;
            setAsking(Date.now());
            try {
              if (redrawing || a.kind === "visualize") {
                await learn.redraw(a.id, q);
                setRedrawing(false);
              } else await learn.followUp(a.id, q);
              setAsk("");
            } catch (error) {
              toast((error as Error).message);
            } finally {
              setAsking(null);
            }
          }}
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder={a.kind === "visualize" ? "What should change? (redraws it)" : "Ask a follow-up…"}
            disabled={!!asking}
          />
          <button className="mcard-send" type="submit" disabled={!ask.trim() || !!asking} aria-label="Send">
            {asking ? <span className="spinner-mark" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </button>
        </form>
      )}
      {asking && <Spinner label={a.kind === "visualize" ? "Redrawing" : "Thinking"} since={asking} />}
      <span className="sr-only">{book.title}</span>
    </article>
  );
});
const GENERATED = ["explain", "define", "ask", "visualize", "resources"];

/* ---------------- a figure from the chapter's figures ---------------- */

const DemoCard = memo(function DemoCard({
  demo,
  open,
  theme,
  onOpen,
  onClose,
  onOpenDemo,
}: {
  demo: Demo;
  open: boolean;
  theme: "light" | "dark";
  onOpen: () => void;
  onClose: () => void;
  onOpenDemo: (d: Demo) => void;
}) {
  if (!open)
    return (
      <button
        type="button"
        className="mcard collapsed"
        data-kind="figure"
        data-status={demo.status === "ready" ? "ready" : demo.status === "failed" ? "failed" : "pending"}
        onClick={onOpen}
      >
        <span className="mcard-label">
          <b>{demo.fig}</b> · {demo.brief.title}
        </span>
        {demo.status !== "ready" && (
          <span className="mcard-excerpt">
            {demo.status === "failed" ? `Couldn’t finish: ${demo.error}` : demo.activity || "drawing…"}
          </span>
        )}
      </button>
    );
  return (
    <article className="mcard open" data-kind="figure" onClick={(e) => e.stopPropagation()}>
      <header className="mcard-head">
        <span className="mcard-kind">{demo.fig}</span>
        <span className="spacer" />
        <button type="button" className="link" onClick={() => onOpenDemo(demo)}>
          <Maximize2 aria-hidden="true" />
          Open large
        </button>
        <button type="button" className="mcard-icon" aria-label="Collapse" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      {demo.type === "scene" && demo.scene && demo.status === "ready" ? (
        <SceneView spec={demo.scene} theme={theme} compact predict={false} />
      ) : (
        <p className="fine">
          {demo.status === "ready" ? "A hand-built demo: open it large to play with it." : demo.activity || demo.status}
        </p>
      )}
    </article>
  );
});
