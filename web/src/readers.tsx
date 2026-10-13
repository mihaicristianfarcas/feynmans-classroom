import { CanvasLayer, CustomLayer, Page, Pages, Root, TextLayer, usePdf, usePdfJump } from "@anaralabs/lector";
import { GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { blockRange, pageEls, pdfRects } from "./anchoring";
import type { Anchor, Annotation, Block, Loc } from "./api";

GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGE_WIDTH = 760;

/** What the reader page needs from either kind of book view. */
export interface ReaderHandle {
  /** The scrolling element. */
  scroller(): HTMLElement | null;
  /** Reading position (page + fraction, or block + fraction) under a client y, if that spot is rendered. */
  positionAt(clientY: number): number | null;
  /** Client y of a location, if it is rendered. */
  clientYOf(loc: Loc): number | null;
  /** Scroll so that loc sits at the given client y. */
  jumpTo(loc: Loc, clientY: number, smooth?: boolean): void;
  /** Total pages or blocks. */
  count(): number;
  /** The passage's boxes on screen (client coordinates), if its page or block is rendered. */
  boxesOf(anchor: Anchor, key: string): DOMRect[] | null;
}

/** What the views draw over the text: highlights and underlines for the book's annotations. */
export interface Marks {
  annotations: Annotation[];
  focused: string | null;
  hovered: string | null;
}
export const MarksContext = createContext<Marks>({ annotations: [], focused: null, hovered: null });

const markStyle = (a: Annotation) => (a.kind === "highlight" || a.kind === "comment" ? "fill" : "line");

/* ---------------- PDF (Lector) ---------------- */

interface PdfProps {
  url: string;
  dark: boolean;
  onScroll: () => void;
  onReady: () => void;
}

export const PdfReader = forwardRef<ReaderHandle, PdfProps>(function PdfReader({ url, dark, onScroll, onReady }, ref) {
  return (
    <Root source={url} className="pdf-root" colorScheme={dark ? "dark" : "light"} loader={<div className="reader-loading">Opening the book…</div>}>
      <PdfInner ref={ref} onScroll={onScroll} onReady={onReady} />
    </Root>
  );
});

const PdfInner = forwardRef<ReaderHandle, Omit<PdfProps, "url" | "dark">>(function PdfInner({ onScroll, onReady }, ref) {
  const viewportRef = usePdf((state) => state.viewportRef);
  const doc = usePdf((state) => state.pdfDocumentProxy);
  const viewports = usePdf((state) => state.viewports);
  const updateZoom = usePdf((state) => state.updateZoom);
  const { jumpToPage } = usePdfJump();
  const pending = useRef<{ loc: Loc; clientY: number; tries: number } | null>(null);

  const pageEl = useCallback((page: number) => viewportRef.current?.querySelector<HTMLElement>(`[data-cr-page="${page}"]`)?.parentElement || null, [viewportRef]);

  const settleJump = useCallback(() => {
    const job = pending.current;
    const scroller = viewportRef.current;
    if (!job || !scroller) return;
    const el = pageEl(job.loc.page ?? 1);
    if (!el) {
      if (job.tries++ < 30) requestAnimationFrame(settleJump);
      return;
    }
    const rect = el.getBoundingClientRect();
    const target = rect.top + (job.loc.y ?? 0) * rect.height;
    scroller.scrollBy({ top: target - job.clientY });
    pending.current = null;
  }, [pageEl, viewportRef]);

  useImperativeHandle(
    ref,
    () => ({
      scroller: () => viewportRef.current,
      count: () => doc?.numPages ?? 0,
      positionAt(clientY) {
        const scroller = viewportRef.current;
        if (!scroller) return null;
        const pages = [...scroller.querySelectorAll<HTMLElement>("[data-cr-page]")];
        let best: number | null = null;
        let bestGap = Infinity;
        for (const marker of pages) {
          const el = marker.parentElement!;
          const rect = el.getBoundingClientRect();
          const page = Number(marker.dataset.crPage);
          if (clientY >= rect.top && clientY <= rect.bottom) return page + (clientY - rect.top) / rect.height;
          // in the gap between pages: snap to the nearer edge
          const gap = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
          if (gap < bestGap) {
            bestGap = gap;
            best = clientY < rect.top ? page : page + 0.9999;
          }
        }
        return best;
      },
      clientYOf(loc) {
        const el = pageEl(loc.page ?? 1);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return rect.top + (loc.y ?? 0) * rect.height;
      },
      boxesOf(anchor, key) {
        const scroller = viewportRef.current;
        if (!scroller || anchor.page === undefined) return null;
        const pages = pageEls(scroller);
        const page = pages.find((p) => p.page === anchor.page);
        if (!page) return null;
        const rects = pdfRects(anchor, key, page);
        if (!rects?.length) return null;
        return rects.map((r) => {
          const host = r.p !== undefined ? pages.find((p) => p.page === r.p) : page;
          const box = (host || page).el.getBoundingClientRect();
          return new DOMRect(box.left + r.x * box.width, box.top + r.y * box.height, r.w * box.width, r.h * box.height);
        });
      },
      jumpTo(loc, clientY, smooth = false) {
        const el = pageEl(loc.page ?? 1);
        const scroller = viewportRef.current;
        if (el && scroller) {
          const rect = el.getBoundingClientRect();
          scroller.scrollBy({ top: rect.top + (loc.y ?? 0) * rect.height - clientY, behavior: smooth ? "smooth" : "auto" });
          return;
        }
        pending.current = { loc, clientY, tries: 0 };
        jumpToPage(loc.page ?? 1, { behavior: "auto", align: "start" } as never);
        requestAnimationFrame(() => requestAnimationFrame(settleJump));
      },
    }),
    [doc, jumpToPage, pageEl, settleJump, viewportRef],
  );

  useEffect(() => {
    const scroller = viewportRef.current;
    if (!scroller) return;
    let frame = 0;
    const handler = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        onScroll();
      });
    };
    scroller.addEventListener("scroll", handler, { passive: true });
    // fit the page to the pane, but never wider than a comfortable reading measure
    const fit = () => {
      const width = viewports?.[0]?.width;
      if (!width) return;
      const room = scroller.clientWidth - 40;
      const zoom = Math.max(0.5, Math.min(room / width, MAX_PAGE_WIDTH / width));
      updateZoom(Math.round(zoom * 100) / 100);
    };
    fit();
    const resize = new ResizeObserver(() => {
      fit();
      handler();
    });
    resize.observe(scroller);
    onReady();
    return () => {
      scroller.removeEventListener("scroll", handler);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [viewportRef, onScroll, onReady, updateZoom, viewports]);

  return (
    <Pages className="pdf-pages" gap={14}>
      <Page className="pdf-page">
        <CanvasLayer />
        <CustomLayer>{(page) => <PageMarks page={page} />}</CustomLayer>
        <TextLayer />
        <CustomLayer>{(page) => <span data-cr-page={page} className="page-marker" aria-hidden="true" />}</CustomLayer>
      </Page>
    </Pages>
  );
});

/** A page's highlights and underlines, under the text layer (so selecting text still works). */
function PageMarks({ page }: { page: number }) {
  const { annotations, focused, hovered } = useContext(MarksContext);
  const ref = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const here = annotations.filter((a) => a.anchor.page === page || a.anchor.rects?.some((r) => r.p === page));
  // an annotation with only a quote is found in the text layer once it has rendered
  const missing = here.some((a) => !a.anchor.rects?.length);
  useEffect(() => {
    if (!missing) return;
    let tries = 0;
    const timer = setInterval(() => {
      const layer = ref.current?.parentElement?.querySelector(".textLayer");
      if ((layer && layer.childNodes.length) || ++tries > 40) {
        clearInterval(timer);
        setTick((t) => t + 1);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [missing, page]);
  const host = ref.current?.parentElement;
  const pageRef = host ? { page, el: host } : undefined;
  void tick;
  return (
    <div ref={ref} className="page-marks" aria-hidden="true">
      {here.flatMap((a) => {
        const rects = a.anchor.rects?.length ? a.anchor.rects : pageRef ? pdfRects(a.anchor, a.id, pageRef) : null;
        return (rects || [])
          .filter((r) => (r.p ?? a.anchor.page) === page)
          .map((r, i) => <span key={`${a.id}-${i}`} className="mark" data-style={markStyle(a)} data-kind={a.kind} data-color={a.color || undefined} data-state={a.id === focused ? "focused" : a.id === hovered ? "hovered" : undefined} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />);
      })}
    </div>
  );
}

/* ---------------- EPUB, Markdown, text ---------------- */

interface HtmlProps {
  blocks: Block[];
  onScroll: () => void;
  onReady: () => void;
}

export const HtmlReader = forwardRef<ReaderHandle, HtmlProps>(function HtmlReader({ blocks, onScroll, onReady }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const blockEl = (id: number) => scrollRef.current?.querySelector<HTMLElement>(`[data-block="${id}"]`) || null;

  useImperativeHandle(
    ref,
    () => ({
      scroller: () => scrollRef.current,
      count: () => blocks.length,
      positionAt(clientY) {
        const root = scrollRef.current;
        if (!root) return null;
        const els = root.querySelectorAll<HTMLElement>("[data-block]");
        let lo = 0,
          hi = els.length - 1,
          found = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (els[mid].getBoundingClientRect().top <= clientY) {
            found = mid;
            lo = mid + 1;
          } else hi = mid - 1;
        }
        if (found < 0) return els.length ? Number(els[0].dataset.block) : null;
        const rect = els[found].getBoundingClientRect();
        const frac = rect.height ? Math.min(0.9999, Math.max(0, (clientY - rect.top) / rect.height)) : 0;
        return Number(els[found].dataset.block) + frac;
      },
      clientYOf(loc) {
        const el = blockEl(loc.block ?? 0);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return rect.top + (loc.y ?? 0) * rect.height;
      },
      boxesOf(anchor) {
        const root = scrollRef.current;
        if (!root) return null;
        const range = blockRange(anchor, root);
        return range ? [...range.getClientRects()].filter((r) => r.width > 0.5) : null;
      },
      jumpTo(loc, clientY, smooth = false) {
        const el = blockEl(loc.block ?? 0);
        if (!el || !scrollRef.current) return;
        const rect = el.getBoundingClientRect();
        scrollRef.current.scrollBy({ top: rect.top + (loc.y ?? 0) * rect.height - clientY, behavior: smooth ? "smooth" : "auto" });
      },
    }),
    [blocks],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const handler = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        onScroll();
      });
    };
    el.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler);
    onReady();
    return () => {
      el.removeEventListener("scroll", handler);
      window.removeEventListener("resize", handler);
      cancelAnimationFrame(frame);
    };
  }, [onScroll, onReady]);

  // highlights through the CSS Custom Highlight API: no change to the book's DOM
  const { annotations, focused } = useContext(MarksContext);
  useLayoutEffect(() => {
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const HighlightCtor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    const root = scrollRef.current;
    if (!registry || !HighlightCtor || !root) return;
    const groups = new Map<string, Range[]>();
    for (const a of annotations) {
      const range = blockRange(a.anchor, root);
      if (!range) continue;
      const name = a.id === focused ? "anno-focused" : markStyle(a) === "fill" ? `anno-${a.color || "yellow"}` : "anno-line";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(range);
    }
    const names = ["anno-focused", "anno-line", "anno-yellow", "anno-green", "anno-blue", "anno-pink", "anno-purple"];
    for (const name of names) {
      const ranges = groups.get(name);
      if (ranges?.length) registry.set(name, new HighlightCtor(...ranges));
      else registry.delete(name);
    }
    return () => names.forEach((n) => registry.delete(n));
  }, [annotations, focused, blocks]);

  return (
    <div className="html-reader" ref={scrollRef}>
      <article className="html-book">
        {blocks.map((block) => {
          const Tag = (["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote", "pre", "figure", "table", "dt", "dd", "hr"].includes(block.tag) ? block.tag : "p") as "p";
          if (block.tag === "hr") return <hr key={block.id} data-block={block.id} />;
          // block.html is sanitized on the server (allow-listed inline tags, no attributes but img src/alt)
          return <Tag key={block.id} data-block={block.id} className={`b-${block.tag}`} dangerouslySetInnerHTML={{ __html: block.html }} />;
        })}
      </article>
    </div>
  );
});
