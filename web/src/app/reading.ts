/* How the learner likes to read: the typeface, size and line width of the books, notes and answers
 * they read, kept in localStorage and set on the root as data-read-* (styles.css turns those into the
 * reading tokens). index.html applies them before the first paint. */

export interface Reading {
  font: "serif" | "sans";
  size: "small" | "medium" | "large" | "larger";
  width: "narrow" | "medium" | "wide";
}

const KEY = "classroom-reading";
export const DEFAULT_READING: Reading = { font: "serif", size: "medium", width: "medium" };

/** The reading settings saved on this device, or the defaults. */
export function savedReading(): Reading {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Reading>;
    return {
      font: saved.font === "sans" ? "sans" : "serif",
      size: saved.size === "small" || saved.size === "large" || saved.size === "larger" ? saved.size : "medium",
      width: saved.width === "narrow" || saved.width === "wide" ? saved.width : "medium",
    };
  } catch {
    return DEFAULT_READING;
  }
}

/** Keeps the reading settings and applies them at once (the defaults leave no attribute). */
export function saveReading(reading: Reading) {
  try {
    localStorage.setItem(KEY, JSON.stringify(reading));
  } catch {}
  const root = document.documentElement;
  for (const [key, value] of Object.entries(reading) as [keyof Reading, string][]) {
    const attr = `data-read-${key}`;
    if (value === DEFAULT_READING[key]) root.removeAttribute(attr);
    else root.setAttribute(attr, value);
  }
}
