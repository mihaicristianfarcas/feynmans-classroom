/* The note editor: CodeMirror 6 (the editor Obsidian is built on) editing the Markdown text itself,
 * byte for byte, with a light live preview: headings sized, emphasis shown, and Markdown marks hidden
 * except on the line being edited; [[ completes to notes, concepts and books; pictures pasted or
 * dropped go to attachments/ and in as ![[picture.png]]. ⌘/Ctrl-click a link to follow it. In an
 * outside vault (Obsidian's) a LinkSource says what [[ completes to, where a link goes, and where a
 * pasted or dropped file (a picture, PDF, sound, video) is saved. */
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderExt,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { learn } from "../api";
import { openLink } from "../app/navigation";

/* ---------------- completion of [[links]] and #tags ---------------- */

let targetsCache: { at: number; list: { title: string; kind: string; detail?: string }[] } | null = null;
async function targets() {
  if (!targetsCache || Date.now() - targetsCache.at > 15000)
    targetsCache = { at: Date.now(), list: await learn.linkTargets().catch(() => []) };
  return targetsCache.list;
}

/** Where links go and files are kept, for an editor that isn't on the app's own vault. */
export interface LinkSource {
  targets: () => Promise<{ title: string; kind: string; detail?: string }[]>;
  follow: (target: string, sub?: string) => void;
  /** Saves a pasted or dropped file; returns the text to put in (e.g. "![[photo.png]]"). */
  attach: (file: File, data: string) => Promise<string>;
}

const completeLinks =
  (source: { current?: LinkSource }) =>
  async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const before = ctx.matchBefore(/!?\[\[[^\]|#\n]*$/);
    if (!before) return null;
    const open = before.text.indexOf("[[") + 2;
    const list = source.current ? await source.current.targets().catch(() => []) : await targets();
    const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
    return {
      from: before.from + open,
      options: list.map((x) => ({
        label: x.title,
        detail: x.kind,
        info: x.detail,
        apply: after === "]]" ? x.title : `${x.title}]]`,
        boost: x.kind === "note" ? 1 : x.kind === "concept" ? 0.5 : 0,
      })),
      validFor: /^[^\]|#\n]*$/,
    };
  };

/* ---------------- live preview ---------------- */

const HIDE = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "StrikethroughMark", "QuoteMark", "LinkMark", "URL"]);
const hidden = Decoration.replace({});
const wikilink = Decoration.mark({ class: "cm-wikilink" });
const highlight = Decoration.mark({ class: "cm-mark" });
const tagMark = Decoration.mark({ class: "cm-tag" });
const calloutMark = Decoration.mark({ class: "cm-callout" });

function preview(view: EditorView): DecorationSet {
  const builder: { from: number; to: number; deco: Decoration }[] = [];
  const { state } = view;
  const cursorLines = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) cursorLines.add(n);
  }
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const line = state.doc.lineAt(node.from).number;
        if (node.name.startsWith("ATXHeading")) {
          const level = Number(node.name.slice(-1)) || 1;
          builder.push({
            from: state.doc.line(line).from,
            to: state.doc.line(line).from,
            deco: Decoration.line({ class: `cm-h cm-h${level}` }),
          });
        }
        if (cursorLines.has(line) || !HIDE.has(node.name)) return;
        if (node.name === "URL" || node.name === "LinkMark") return; // keep [text](url) visible: links are edited often
        let end = node.to;
        // a heading's "# " or a quote's "> ": hide the space after the mark too
        if ((node.name === "HeaderMark" || node.name === "QuoteMark") && state.doc.sliceString(end, end + 1) === " ")
          end++;
        if (end > node.from) builder.push({ from: node.from, to: end, deco: hidden });
      },
    });
    const text = state.doc.sliceString(from, to);
    for (const m of text.matchAll(/(!?)\[\[([^\]|\n]*)(\|[^\]\n]*)?\]\]/g)) {
      const a = from + m.index!;
      const b = a + m[0].length;
      builder.push({ from: a, to: b, deco: wikilink });
      // away from the cursor a link reads as its text: [[target|shown]] → shown, [[Note]] → Note
      if (m[1] || cursorLines.has(state.doc.lineAt(a).number)) continue;
      const open = m[3] ? a + 2 + m[2].length + 1 : a + 2;
      builder.push({ from: a, to: open, deco: hidden });
      builder.push({ from: b - 2, to: b, deco: hidden });
    }
    for (const m of text.matchAll(/^> \[!(\w+)\][+-]?/gm)) {
      const a = from + m.index! + 2;
      builder.push({ from: a, to: a + m[0].length - 2, deco: calloutMark });
    }
    for (const m of text.matchAll(/==[^=\n]+==/g))
      builder.push({ from: from + m.index!, to: from + m.index! + m[0].length, deco: highlight });
    for (const m of text.matchAll(/(^|\s)(#[\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)) {
      const at = from + m.index! + m[1].length;
      const line = state.doc.lineAt(at);
      if (!/^#{1,6} /.test(line.text) || at > line.from)
        builder.push({ from: at, to: at + m[2].length, deco: tagMark });
    }
  }
  builder.sort((a, b) => a.from - b.from || (a.deco.startSide ?? 0) - (b.deco.startSide ?? 0));
  const set = new RangeSetBuilder<Decoration>();
  let lastHidden = -1;
  for (const d of builder) {
    // replacements may not overlap each other; marks may span them
    if (d.deco === hidden) {
      if (d.from < lastHidden) continue;
      lastHidden = d.to;
    }
    set.add(d.from, d.to, d.deco);
  }
  return set.finish();
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = preview(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = preview(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

const style = HighlightStyle.define([
  { tag: t.heading, fontWeight: "600", color: "var(--ink)" },
  { tag: t.strong, fontWeight: "650", color: "var(--ink)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--sky-ink)", textDecoration: "underline" },
  { tag: t.url, color: "var(--ink-3)" },
  { tag: t.monospace, fontFamily: "var(--mono)", fontSize: "0.88em", color: "var(--ink)" },
  { tag: t.quote, color: "var(--ink-2)", fontStyle: "italic" },
  { tag: t.processingInstruction, color: "var(--ink-4)" },
  { tag: t.meta, color: "var(--ink-4)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "16px", background: "transparent", color: "var(--ink)" },
  ".cm-scroller": { fontFamily: "var(--serif)", lineHeight: "1.65", overflow: "auto" },
  ".cm-content": { padding: "14px 0 40vh", caretColor: "var(--ink)", maxWidth: "760px" },
  ".cm-line": { padding: "0 32px" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--ink)", borderLeftWidth: "1.5px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    background: "color-mix(in srgb, var(--lavender) 50%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--ink-4)", fontStyle: "italic" },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    background: "var(--raised)",
    border: "0",
    boxShadow: "var(--shadow-lg)",
    borderRadius: "10px",
    padding: "4px",
    fontFamily: "var(--sans)",
    fontSize: "13px",
  },
  ".cm-tooltip-autocomplete ul li": { borderRadius: "6px", padding: "4px 8px !important" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { background: "var(--hover)", color: "var(--ink)" },
  ".cm-completionDetail": {
    fontFamily: "var(--sans)",
    fontSize: "11px",
    color: "var(--ink-3)",
    marginLeft: "10px",
    fontStyle: "normal",
  },
});

/* ---------------- pictures ---------------- */

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Pictures only, in the app's vault; in an outside one, PDFs, sound and video too. */
const attachable = (f: File, source?: LinkSource) =>
  f.type.startsWith("image/") || (!!source && /^(application\/pdf|audio\/|video\/)/.test(f.type));

const pictures = (source: { current?: LinkSource }) =>
  EditorView.domEventHandlers({
    paste(event, view) {
      const file = [...(event.clipboardData?.files || [])].find((f) => attachable(f, source.current));
      if (!file) return false;
      event.preventDefault();
      void insertPicture(view, file, view.state.selection.main.from, source.current);
      return true;
    },
    drop(event, view) {
      const file = [...(event.dataTransfer?.files || [])].find((f) => attachable(f, source.current));
      if (!file) return false;
      event.preventDefault();
      const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
      void insertPicture(view, file, at, source.current);
      return true;
    },
    mousedown(event, view) {
      if (!(event.metaKey || event.ctrlKey)) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;
      const line = view.state.doc.lineAt(pos);
      for (const m of line.text.matchAll(/!?\[\[([^\]|#\n]*)(?:#([^\]|\n]*))?(?:\|[^\]\n]*)?\]\]/g)) {
        const a = line.from + m.index!;
        if (pos >= a && pos <= a + m[0].length) {
          event.preventDefault();
          if (source.current) source.current.follow(m[1].trim(), m[2]?.trim());
          else void openLink(m[1].trim(), m[2]?.trim());
          return true;
        }
      }
      return false;
    },
  });

async function insertPicture(view: EditorView, file: File, at: number, source?: LinkSource) {
  try {
    if (source) {
      const insert = await source.attach(file, await readAsDataUrl(file));
      view.dispatch({ changes: { from: at, insert } });
      return;
    }
    const saved = await learn.attach(
      await readAsDataUrl(file),
      file.name && file.name !== "image.png" ? file.name : undefined,
    );
    view.dispatch({ changes: { from: at, insert: `![[${saved.name}]]` } });
  } catch (error) {
    view.dispatch({
      changes: { from: at, insert: `<!-- could not attach the picture: ${(error as Error).message} -->` },
    });
  }
}

/* ---------------- the component ---------------- */

export function NoteEditor({
  value,
  onChange,
  placeholder = "Write…",
  label = "Note text",
  autoFocus = false,
  onBlur,
  extensions = [],
  links,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  /** What screen readers call the editor. */
  label?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  extensions?: Extension[];
  /** For an outside vault: what [[ completes to, where links go, where files are saved. */
  links?: LinkSource;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const blur = useRef(onBlur);
  blur.current = onBlur;
  const source = useRef<LinkSource | undefined>(links);
  source.current = links;

  // biome-ignore lint/correctness/useExhaustiveDependencies: the editor is made once; new values arrive through the effect below, as transactions
  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          closeBrackets(),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(style),
          autocompletion({ override: [completeLinks(source)], icons: false }),
          highlightSelectionMatches(),
          EditorView.lineWrapping,
          // a named, multi-line text field, in the Tab order (CodeMirror's own element is a contenteditable)
          EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", tabindex: "0" }),
          placeholderExt(placeholder),
          livePreview,
          pictures(source),
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current(u.state.doc.toString());
            if (u.focusChanged && !u.view.hasFocus) blur.current?.();
          }),
          ...extensions,
        ],
      }),
    });
    view.current = v;
    if (autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
  }, []);

  // a new value from outside (another note, an agent's edit): replace the text, keep the cursor where it can stay
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const current = v.state.doc.toString();
    if (current === value) return;
    const head = Math.min(v.state.selection.main.head, value.length);
    v.dispatch({ changes: { from: 0, to: current.length, insert: value }, selection: { anchor: head } });
  }, [value]);

  return <div className="note-editor" ref={host} />;
}

/** Inserts text at the end of whatever editor is mounted under `root` (used by "add to note" while editing). */
export function appendToEditor(root: HTMLElement | null, text: string): boolean {
  const el = root?.querySelector(".cm-editor");
  const v = el ? EditorView.findFromDOM(el as HTMLElement) : null;
  if (!v) return false;
  const doc = v.state.doc.toString();
  const insert = `${doc.trim() ? (doc.endsWith("\n\n") ? "" : doc.endsWith("\n") ? "\n" : "\n\n") : ""}${text}\n`;
  v.dispatch({ changes: { from: doc.length, insert }, scrollIntoView: true });
  return true;
}
