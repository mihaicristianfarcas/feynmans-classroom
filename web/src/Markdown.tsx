import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { learn } from "./api";
import { SceneView } from "./scene/SceneView";

marked.setOptions({ gfm: true, breaks: false });

/** Math first ($$…$$ and $…$, rendered by KaTeX), then Markdown, then sanitising. */
function render(source: string): string {
  const math: string[] = [];
  const keep = (html: string) => `\u0000${math.push(html) - 1}\u0000`;
  let text = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => keep(safeTex(tex, true)))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$(?!\d)/g, (_, pre, tex) => `${pre}${keep(safeTex(tex, false))}`);
  // ![[figure:id]] embeds a figure; [[target]] or [[target|label]] links into the brain
  text = text.replace(/!\[\[figure:([\w-]+)\]\]/g, (_, id) => `<div class="md-figure" data-figure="${id}"></div>`);
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => `<a class="wikilink" href="#/brain/find/${encodeURIComponent(target.trim())}">${(label || target).trim()}</a>`);
  // cloze deletions {{…}} render as blanks unless revealed
  text = text.replace(/\{\{([^}]+)\}\}/g, (_, inner) => `<span class="cloze">${inner}</span>`);
  const html = marked.parse(text, { async: false }) as string;
  const withMath = html.replace(/\u0000(\d+)\u0000/g, (_, i) => math[Number(i)]);
  return DOMPurify.sanitize(withMath, { ADD_ATTR: ["data-figure", "aria-hidden", "encoding"], ADD_TAGS: ["semantics", "annotation"] });
}

function safeTex(tex: string, display: boolean) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" });
  } catch {
    return tex;
  }
}

/** Markdown with math, wikilinks, cloze blanks and embedded figures. */
export function Markdown({ text, className = "", theme = "light", hideCloze = false }: { text: string; className?: string; theme?: "light" | "dark"; hideCloze?: boolean }) {
  const html = useMemo(() => render(text || ""), [text]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const roots: Root[] = [];
    ref.current?.querySelectorAll<HTMLElement>(".md-figure").forEach((node) => {
      const root = createRoot(node);
      roots.push(root);
      root.render(<EmbeddedFigure id={node.dataset.figure!} theme={theme} />);
    });
    return () => roots.forEach((r) => setTimeout(() => r.unmount()));
  }, [html, theme]);
  return <div ref={ref} className={`md ${hideCloze ? "hide-cloze" : ""} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

function EmbeddedFigure({ id, theme }: { id: string; theme: "light" | "dark" }) {
  const [spec, setSpec] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    learn.figure(id).then((f) => setSpec(f.scene), (e) => setError(e.message));
  }, [id]);
  if (error) return <p className="fine">Figure {id} not found.</p>;
  if (!spec) return <p className="fine">Loading figure…</p>;
  return <SceneView spec={spec} theme={theme} compact predict={false} />;
}
