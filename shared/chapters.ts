/* A chapter's own number, read from its title ("Chapter III", "5. Replication", "Lecture 12"), so
 * figures are numbered as the book numbers its chapters ("Fig 3.2" in Chapter III), not by their place
 * in the table of contents (where a preface and a prologue come first). */

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

function fromRoman(text: string): number | null {
  const s = text.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    total += v < (ROMAN[s[i + 1]] || 0) ? -v : v;
  }
  return total > 0 && total < 400 ? total : null;
}

/** The number a chapter's title gives it, if any. */
export function chapterNumber(title: string): number | null {
  const t = title.trim();
  const named = /^(?:chapter|chap\.|ch\.|lecture|lesson|unit)\s+([0-9]{1,3}|[ivxlcdm]{1,7})\b/i.exec(t);
  if (named) return /^\d/.test(named[1]) ? Number(named[1]) : fromRoman(named[1]);
  const bare = /^(\d{1,3})(?:[.:)\s—–-]|$)/.exec(t);
  return bare ? Number(bare[1]) : null;
}

/** What a chapter's figures are numbered under: its own number, else its place in the book (when no
 * chapter has a number), else its title's first letter (a preface's figures are "Fig P.1"). */
export function figurePrefix(toc: { title: string }[], index: number): string {
  const entry = toc[index];
  if (!entry) return "0";
  const own = chapterNumber(entry.title);
  if (own !== null) return String(own);
  if (!toc.some((c) => chapterNumber(c.title) !== null)) return String(index + 1);
  return (entry.title.trim().match(/\p{L}/u)?.[0] || "0").toUpperCase();
}
