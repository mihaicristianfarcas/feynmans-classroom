/* Markdown as the vault writes it, rendered with react-markdown (remark/rehype): GitHub-flavoured
 * Markdown, KaTeX math, and Obsidian's additions: [[links]], ![[embeds]] (notes, annotations,
 * pictures, figures), > [!callouts] (folded with `-` or `+`, as disclosures), ==highlights==, #tags;
 * plus the platform's own: ```figure blocks become interactive figures, ```manim blocks animations
 * (ManimGX, played in a sandboxed frame), ```quiz blocks quizzes to play, and {{cloze}} deletions
 * become blanks. Raw HTML is never rendered. KaTeX (half a megabyte) loads with the first text that
 * has math in it; until then the math shows as its TeX. */
import type { Blockquote, Paragraph, PhrasingContent, Root, Text } from "mdast";
import { Children, isValidElement, memo, type ReactNode, useEffect, useState } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { SKIP, visit } from "unist-util-visit";
import { codeRanges } from "../../../shared/links.ts";
import { type Doc, docs, learn, type Resolved } from "../api";
import { openLink } from "../app/navigation";
import { ManimView, sceneTitle } from "../manim/ManimView";
import { SceneView } from "../scene/SceneView";
import { QuizBlock } from "./QuizBlock";

/* ---------------- Obsidian syntax, as a remark plugin ---------------- */

const INLINE =
  /(!?)\[\[([^[\]\n|#]*)(?:#([^[\]\n|]*))?(?:\|([^[\]\n]*))?\]\]|==([^=\n]+)==|\{\{([^}\n]+)\}\}|(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)|\s\^([a-z0-9-]+)$/gu;

function splitText(node: Text): PhrasingContent[] | null {
  const value = node.value;
  const out: PhrasingContent[] = [];
  let last = 0;
  INLINE.lastIndex = 0;
  for (const m of value.matchAll(INLINE)) {
    const at = m.index!;
    const lead = m[7] ?? "";
    if (at + lead.length > last) out.push({ type: "text", value: value.slice(last, at + lead.length) });
    if (m[2] !== undefined || m[3] !== undefined) {
      const [target, sub, alias] = [m[2].trim(), m[3]?.trim(), m[4]?.trim()];
      const props = { "data-target": target, "data-sub": sub || "", "data-alias": alias || "" };
      if (m[1])
        out.push({
          type: "text",
          value: "",
          data: { hName: "span", hProperties: { ...props, className: ["md-embed"] } },
        } as unknown as Text);
      else
        out.push({
          type: "link",
          url: `#/open?target=${encodeURIComponent(target)}${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`,
          children: [{ type: "text", value: alias || (sub && !target ? sub : target.split("/").pop()!) }],
          data: { hProperties: { ...props, className: ["wikilink"] } },
        });
    } else if (m[5] !== undefined) out.push({ type: "text", value: m[5], data: { hName: "mark" } } as unknown as Text);
    else if (m[6] !== undefined)
      out.push({
        type: "text",
        value: m[6],
        data: { hName: "span", hProperties: { className: ["cloze"] } },
      } as unknown as Text);
    else if (m[8] !== undefined)
      out.push({
        type: "text",
        value: `#${m[8]}`,
        data: { hName: "span", hProperties: { className: ["tag"] } },
      } as unknown as Text);
    // ^block-id at the end of a paragraph: an anchor for links, not shown
    last = at + m[0].length;
  }
  if (!last) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function remarkObsidian() {
  return (tree: Root) => {
    // > [!type] Title  →  a callout
    visit(tree, "blockquote", (node: Blockquote) => {
      const p = node.children[0];
      if (p?.type !== "paragraph") return;
      const first = p.children[0];
      if (first?.type !== "text") return;
      const m = /^\[!(\w+)\]([+-]?)[ \t]*/.exec(first.value);
      if (!m) return;
      // [!type]- is folded (opens with a click), [!type]+ folds but starts open
      const fold = m[2];
      first.value = first.value.slice(m[0].length);
      const title: PhrasingContent[] = [];
      const rest: PhrasingContent[] = [];
      let split = false;
      for (const child of p.children) {
        if (split) rest.push(child);
        else if (child.type === "text" && child.value.includes("\n")) {
          const i = child.value.indexOf("\n");
          if (child.value.slice(0, i)) title.push({ type: "text", value: child.value.slice(0, i) });
          if (child.value.slice(i + 1)) rest.push({ type: "text", value: child.value.slice(i + 1) });
          split = true;
        } else if (child.type === "break") split = true;
        else title.push(child);
      }
      const kind = m[1].toLowerCase();
      node.data = {
        hName: fold ? "details" : "div",
        hProperties: { className: ["callout"], "data-callout": kind, ...(fold === "+" ? { open: true } : {}) },
      };
      const head: Paragraph = {
        type: "paragraph",
        children:
          title.length && title.some((t) => t.type !== "text" || t.value.trim())
            ? title
            : [{ type: "text", value: kind[0].toUpperCase() + kind.slice(1) }],
        data: { hName: fold ? "summary" : "div", hProperties: { className: ["callout-title"] } },
      };
      node.children = [
        head,
        ...(rest.length ? [{ ...p, children: rest } as Paragraph] : []),
        ...node.children.slice(1),
      ];
    });
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined || (parent as { type: string }).type === "link") return;
      const parts = splitText(node);
      if (!parts) return;
      (parent as { children: PhrasingContent[] }).children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}

/** Models often write math as \\( … \\) and \\[ … \\]; remark-math reads $ … $ and $$ … $$. */
function normalizeMath(text: string): string {
  if (!text.includes("\\(") && !text.includes("\\[")) return text;
  const code = codeRanges(text);
  const inCode = (at: number) => code.some(([a, b]) => at >= a && at < b);
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (m, tex: string, at: number) => (inCode(at) ? m : `$$${tex}$$`))
    .replace(/\\\(([\s\S]+?)\\\)/g, (m, tex: string, at: number) => (inCode(at) ? m : `$${tex.trim()}$`));
}

/* ---------------- rendering ---------------- */

const textOf = (children: ReactNode): string =>
  Children.toArray(children)
    .map((c) =>
      typeof c === "string" ? c : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : "",
    )
    .join("");

/** A relative link in a file (e.g. "../../library/x/text/07-chapter.md") as a vault path. */
function vaultPath(href: string, base?: string) {
  const parts = (base ? base.split("/").slice(0, -1) : []).concat(decodeURIComponent(href.split("#")[0]).split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

function makeComponents(
  theme: "light" | "dark",
  depth: number,
  onLink?: (href: string) => boolean,
  base?: string,
): Components {
  return {
    a({ href, children, node: _node, ...props }) {
      // a relative link (an agent's or Obsidian's [text](path.md)) points into the vault
      if (href && !/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) {
        const target = vaultPath(href, base).replace(/\.md$/i, "");
        return (
          <a
            {...props}
            href={`#/open?target=${encodeURIComponent(target)}`}
            className="wikilink"
            onClick={(e) => {
              e.preventDefault();
              openLink(target);
            }}
          >
            {children}
          </a>
        );
      }
      const internal = href?.startsWith("#");
      return (
        <a
          {...props}
          href={href}
          target={internal ? undefined : "_blank"}
          rel={internal ? undefined : "noopener noreferrer"}
          onClick={(e) => {
            if (!href?.startsWith("#/open?")) return;
            e.preventDefault();
            if (onLink?.(href)) return;
            const q = new URLSearchParams(href.slice(7));
            openLink(q.get("target") || "", q.get("sub") || undefined);
          }}
        >
          {children}
        </a>
      );
    },
    span({ node: _node, ...props }) {
      const p = props as Record<string, string> & { className?: string; children?: ReactNode };
      if (p.className?.includes("md-embed"))
        return depth > 2 ? (
          <span className="fine">{p["data-target"]}</span>
        ) : (
          <Embed target={p["data-target"]} sub={p["data-sub"]} alias={p["data-alias"]} theme={theme} depth={depth} />
        );
      return <span {...props} />;
    },
    pre({ node, children }) {
      const code = node?.children?.[0] as { tagName?: string; properties?: { className?: string[] } } | undefined;
      if (code?.tagName === "code" && code.properties?.className?.includes("language-figure"))
        return <FigureBlock source={textOf(children)} theme={theme} />;
      if (code?.tagName === "code" && code.properties?.className?.includes("language-manim")) {
        const source = textOf(children);
        return (
          <div className="md-figure">
            <ManimView source={source} title={sceneTitle(source)} theme={theme} />
          </div>
        );
      }
      if (code?.tagName === "code" && code.properties?.className?.includes("language-quiz"))
        return <QuizBlock source={textOf(children)} theme={theme} depth={depth} />;
      return <pre>{children}</pre>;
    },
    img({ src, alt, node: _node }) {
      const url =
        typeof src === "string"
          ? /^(https?:|data:image\/)/.test(src)
            ? src
            : `/api/vault/attachment?path=${encodeURIComponent(src.startsWith("attachments/") ? src : `attachments/${src}`)}`
          : "";
      return <img src={url} alt={alt || ""} loading="lazy" />;
    },
    input({ node: _node, ...props }) {
      // task list checkboxes: shown, not editable here
      return <input {...props} disabled />;
    },
  };
}

/* ---------------- math, loaded on first use ---------------- */

type Plugins = NonNullable<Options["rehypePlugins"]>;
let katex: Plugins | null = null;
let loadingKatex: Promise<Plugins> | null = null;

/** The KaTeX plugin once it has loaded, starting the load when `needed`. */
function useKatex(needed: boolean): Plugins | null {
  const [plugins, setPlugins] = useState(katex);
  useEffect(() => {
    if (!needed || plugins) return;
    let alive = true;
    loadingKatex ??= Promise.all([import("rehype-katex"), import("katex/dist/katex.min.css")]).then(
      ([m]) => (katex = [[m.default, { throwOnError: false, strict: false }]]),
    );
    loadingKatex.then((p) => alive && setPlugins(p)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [needed, plugins]);
  return plugins;
}

/** Markdown with math, links, embeds, callouts, cloze blanks and figures. */
export const Markdown = memo(function Markdown({
  text,
  className = "",
  theme = "light",
  hideCloze = false,
  depth = 0,
  onLink,
  base,
}: {
  text: string;
  className?: string;
  theme?: "light" | "dark";
  hideCloze?: boolean;
  depth?: number;
  onLink?: (href: string) => boolean /** The file's vault path, for relative links in it. */;
  base?: string;
}) {
  const source = normalizeMath(text || "");
  const math = useKatex(source.includes("$"));
  return (
    <div className={`md ${hideCloze ? "hide-cloze" : ""} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkObsidian]}
        rehypePlugins={math || undefined}
        components={makeComponents(theme, depth, onLink, base)}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
});

/* ---------------- embeds ---------------- */

function FigureBlock({ source, theme }: { source: string; theme: "light" | "dark" }) {
  let spec: unknown = null;
  try {
    spec = JSON.parse(source);
  } catch {
    return <pre className="fine">{source.slice(0, 400)}</pre>;
  }
  return (
    <div className="md-figure">
      <SceneView spec={spec} theme={theme} compact predict={false} />
    </div>
  );
}

function Embed({
  target,
  sub,
  alias,
  theme,
  depth,
}: {
  target: string;
  sub?: string;
  alias?: string;
  theme: "light" | "dark";
  depth: number;
}) {
  if (/^figure:/i.test(target)) return <EmbeddedFigure id={target.slice(7).trim()} theme={theme} />;
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(target)) {
    const width = alias && /^\d+$/.test(alias) ? Number(alias) : undefined;
    return (
      <img
        className="md-image"
        src={`/api/vault/attachment?path=${encodeURIComponent(target.includes("/") ? target : `attachments/${target}`)}`}
        alt={alias && !width ? alias : target}
        width={width}
        loading="lazy"
      />
    );
  }
  return <EmbeddedFile target={target} sub={sub} theme={theme} depth={depth} />;
}

function EmbeddedFigure({ id, theme }: { id: string; theme: "light" | "dark" }) {
  const [spec, setSpec] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    docs.get(id).then(
      (f) => (f.kind === "figure" ? setSpec(f.scene) : setError("not a figure")),
      (e) => setError(e.message),
    );
  }, [id]);
  if (error) return <span className="fine">Figure {id} not found.</span>;
  if (!spec) return <span className="fine">Loading figure…</span>;
  return (
    <span className="md-figure">
      <SceneView spec={spec} theme={theme} compact predict={false} />
    </span>
  );
}

/** What an embedded document shows: its body, a concept with its summary first, an annotation under its passage. */
function embedBody(doc: Doc) {
  if (doc.kind === "concept") return `**${doc.title}**: ${doc.summary}\n\n${doc.body}`;
  if (doc.kind === "annotation") return `> ${doc.source.quote.replace(/\n/g, "\n> ")}\n\n${doc.body}`;
  return doc.body;
}

/** ![[Note]] or ![[library/…/annotations/…]]: the file's content, framed, with a way to open it. */
function EmbeddedFile({
  target,
  sub,
  theme,
  depth,
}: {
  target: string;
  sub?: string;
  theme: "light" | "dark";
  depth: number;
}) {
  const [state, setState] = useState<{ resolved?: Resolved; body?: string; error?: string }>({});
  useEffect(() => {
    let alive = true;
    learn.resolve(target, sub).then(
      async (resolved) => {
        const body =
          resolved.kind === "book" || resolved.kind === "attachment" ? "" : embedBody(await docs.get(resolved.id));
        if (alive) setState({ resolved, body });
      },
      (e) => alive && setState({ error: (e as Error).message }),
    );
    return () => {
      alive = false;
    };
  }, [target, sub]);
  if (state.error)
    return (
      <span className="md-embed-box missing">
        <a
          href={`#/open?target=${encodeURIComponent(target)}`}
          onClick={(e) => {
            e.preventDefault();
            openLink(target);
          }}
        >
          {target}
        </a>{" "}
        <span className="fine">doesn’t exist yet</span>
      </span>
    );
  if (!state.resolved) return <span className="md-embed-box fine">Loading {target}…</span>;
  const r = state.resolved;
  return (
    <span className="md-embed-box" data-kind={r.kind}>
      <span className="md-embed-head">
        <span className="eyebrow">
          {r.kind === "annotation" ? `${r.title.split(":")[0]}${r.page ? ` · p. ${r.page}` : ""}` : r.kind}
        </span>
        <a
          href={`#/open?target=${encodeURIComponent(target)}${sub ? `&sub=${encodeURIComponent(sub)}` : ""}`}
          onClick={(e) => {
            e.preventDefault();
            openLink(target, sub);
          }}
        >
          {r.kind === "annotation" ? "Open in the book ↗" : r.title}
        </a>
      </span>
      {state.body ? <Markdown text={state.body} theme={theme} depth={depth + 1} /> : null}
    </span>
  );
}
