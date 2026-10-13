/* Finding a quoted passage again, in text that was extracted differently: the PDF's text layer in
 * the browser, pdf-inspector's Markdown on the server, a chapter text file an agent reads. The
 * texts differ in whitespace, hyphenation at line ends, ligatures, curly quotes and Markdown marks,
 * so both sides are folded to a plain form first (keeping a map back to the original offsets), then
 * matched exactly, then approximately (Myers' bit-parallel algorithm, as Hypothesis does), with the
 * text before and after the quote breaking ties. */
import approxSearch from "approx-string-match";

export interface Folded {
  text: string;
  /** For each folded character, its offset in the original text. */
  map: number[];
}

const QUOTES: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "″": '"',
  "«": '"',
  "»": '"',
};
const DASHES = /[‐-―−⸺⸻]/;
const SPACE = /[\s\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]/;
const MD_MARKS = new Set(["*", "_", "#", ">", "|", "`", "~", "[", "]", "=", "^"]);

/**
 * Folds text for matching. With `markdown`, Markdown marks are dropped too, and so are link URLs
 * ("[text](url)" folds to "text") and the platform's page markers ("[[page 12]]").
 */
export function fold(source: string, options: { markdown?: boolean } = {}): Folded {
  const out: string[] = [];
  const map: number[] = [];
  let space = true;
  const push = (ch: string, at: number) => {
    if (ch === " ") {
      if (space) return;
      space = true;
    } else space = false;
    out.push(ch);
    map.push(at);
  };
  for (let i = 0; i < source.length; i++) {
    let ch = source[i];
    if (options.markdown) {
      // [[page 12]] / [[block 3]] markers and ](url) parts carry no text
      if (ch === "[" && source.startsWith("[[", i)) {
        const m = /^\[\[(?:page|block) \d+\]\]/.exec(source.slice(i, i + 24));
        if (m) {
          i += m[0].length - 1;
          push(" ", i);
          continue;
        }
      }
      if (ch === "]" && source[i + 1] === "(") {
        const close = source.indexOf(")", i + 2);
        if (close > 0 && close - i < 400 && !/\s/.test(source.slice(i + 2, close))) {
          i = close;
          continue;
        }
      }
      if (MD_MARKS.has(ch)) continue;
    }
    // a word broken across lines: "repli-\ncation"
    if (ch === "-" || ch === "\u00ad") {
      const m = /^[-\u00ad][ \t]*\r?\n[ \t]*(?=\p{Ll})/u.exec(source.slice(i, i + 8));
      if (m) {
        i += m[0].length - 1;
        continue;
      }
      if (ch === "\u00ad") continue;
    }
    if (SPACE.test(ch)) {
      push(" ", i);
      continue;
    }
    if (QUOTES[ch]) ch = QUOTES[ch];
    else if (DASHES.test(ch)) ch = "-";
    else if (ch === "…") {
      push(".", i);
      push(".", i);
      ch = ".";
    }
    const norm = ch.normalize("NFKC").toLowerCase();
    for (const c of norm) push(c, i);
  }
  while (out.length && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

export interface QuoteMatch {
  /** Offsets in the original text. */
  start: number;
  end: number;
  /** 1 for an exact match, lower the more it had to give. */
  score: number;
}

/** How well the text around a match agrees with the expected prefix and suffix (0–1). */
function contextScore(text: string, start: number, end: number, prefix: string, suffix: string) {
  let s = 0;
  let n = 0;
  if (prefix) {
    n++;
    const before = text.slice(Math.max(0, start - prefix.length - 4), start);
    s += overlap(before, prefix, true);
  }
  if (suffix) {
    n++;
    const after = text.slice(end, end + suffix.length + 4);
    s += overlap(after, suffix, false);
  }
  return n ? s / n : 0;
}
function overlap(actual: string, expected: string, fromEnd: boolean) {
  const a = fromEnd ? [...actual].reverse().join("") : actual;
  const e = fromEnd ? [...expected].reverse().join("") : expected;
  let k = 0;
  while (k < a.length && k < e.length && a[k] === e[k]) k++;
  return e.length ? Math.min(1, k / Math.min(e.length, 24)) : 0;
}

/**
 * Finds `quote` in `text`. `prefix`/`suffix` (the text just before and after it where it was
 * selected) pick among repeats; `hint` (an offset in `text`) prefers the nearest one.
 */
export function findQuote(
  text: string,
  quote: string,
  ctx: { prefix?: string; suffix?: string; hint?: number; markdown?: boolean } = {},
): QuoteMatch | null {
  const T = fold(text, { markdown: ctx.markdown });
  const q = fold(quote, { markdown: ctx.markdown }).text;
  if (!q || !T.text) return null;
  const prefix = ctx.prefix ? fold(ctx.prefix, { markdown: ctx.markdown }).text : "";
  const suffix = ctx.suffix ? fold(ctx.suffix, { markdown: ctx.markdown }).text : "";
  const hint = ctx.hint !== undefined ? T.map.findIndex((o) => o >= ctx.hint!) : -1;
  const rank = (start: number, end: number, errors: number) => {
    const exact = 1 - errors / Math.max(1, q.length);
    const near = hint >= 0 ? 1 - Math.min(1, Math.abs(start - hint) / Math.max(2000, T.text.length)) : 0;
    return exact * 50 + contextScore(T.text, start, end, prefix, suffix) * 20 + near * 2;
  };
  const back = (start: number, end: number, errors: number): QuoteMatch => ({
    start: T.map[start],
    end: T.map[Math.max(start, end - 1)] + 1,
    score: Math.max(0, 1 - errors / Math.max(1, q.length)),
  });

  // exact
  const exact: number[] = [];
  for (let at = T.text.indexOf(q); at >= 0 && exact.length < 50; at = T.text.indexOf(q, at + 1)) exact.push(at);
  if (exact.length) {
    const best = exact.reduce((a, b) => (rank(b, b + q.length, 0) > rank(a, a + q.length, 0) ? b : a));
    return back(best, best + q.length, 0);
  }

  // a long quote: find its two ends and take the span between them
  if (q.length > 160) {
    const head = findQuote(text, quote.slice(0, 80), { ...ctx, suffix: undefined });
    const tail = findQuote(text, quote.slice(-80), { ...ctx, prefix: undefined, hint: head ? head.start : ctx.hint });
    if (head && tail && tail.end > head.start) {
      const len = tail.end - head.start;
      if (len > quote.length * 0.6 && len < quote.length * 1.6)
        return { start: head.start, end: tail.end, score: Math.min(head.score, tail.score) * 0.95 };
    }
    return null;
  }

  // approximate
  const maxErrors = Math.max(1, Math.min(32, Math.floor(q.length * 0.18)));
  const matches = approxSearch(T.text, q, maxErrors);
  if (!matches.length) return null;
  const best = matches.reduce((a, b) => (rank(b.start, b.end, b.errors) > rank(a.start, a.end, a.errors) ? b : a));
  return back(best.start, best.end, best.errors);
}

/** Line number (1-based) of an offset. */
export function lineAt(text: string, offset: number) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
