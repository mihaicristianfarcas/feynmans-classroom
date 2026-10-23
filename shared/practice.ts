/* Checking a practice answer without a model: when what the learner wrote is plainly the answer (the
 * same words or symbols once spacing, case, $…$ and the like are set aside, or the same number), it is
 * right at once. Anything else is not called wrong here: it goes to the grader, which reads it. */

/** The answer reduced to what matters when comparing: case, spaces, $…$, "x =", a final full stop. */
export function normalAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^\$+|\$+$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .replace(/[−–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/°/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/^[a-z]\s*=\s*/, "")
    .replace(/\s+/g, "")
    .replace(/\.$/, "");
}

/** The number an answer is, when it is one: 3, -2.5, 3/4, 50%. */
export function numberOf(text: string): number | null {
  const t = normalAnswer(text);
  const percent = t.endsWith("%");
  const body = percent ? t.slice(0, -1) : t;
  let value: number | null = null;
  const fraction = body.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction) value = Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  else if (/^-?(\d+(\.\d*)?|\.\d+)(e-?\d+)?$/.test(body)) value = Number(body);
  if (value === null || !Number.isFinite(value)) return null;
  return percent ? value / 100 : value;
}

/** True when `given` is plainly the answer (or one of the accepted ways of writing it). */
export function sameAnswer(given: string, answer: string, accept: string[] = []): boolean {
  const mine = normalAnswer(given);
  if (!mine) return false;
  const n = numberOf(given);
  return [answer, ...accept].some((a) => {
    if (normalAnswer(a) === mine) return true;
    const m = numberOf(a);
    return n !== null && m !== null && Math.abs(n - m) <= 1e-9 * Math.max(1, Math.abs(m));
  });
}
