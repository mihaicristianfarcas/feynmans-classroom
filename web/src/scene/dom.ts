/* Small DOM helpers for the scene player: an element builder, the transport's icons, and the legend's
 * line swatches. */

export const ICONS = {
  play: '<svg viewBox="0 0 12 12"><path class="fill" d="M3 1.8v8.4L10 6z"/></svg>',
  pause: '<svg viewBox="0 0 12 12"><path class="fill" d="M2.6 1.8h2.4v8.4H2.6zM7 1.8h2.4v8.4H7z"/></svg>',
  restart: '<svg viewBox="0 0 12 12"><path d="M2.2 6.2a3.8 3.8 0 1 0 1.2-2.8"/><path d="M2.2 1.8v2.4h2.4"/></svg>',
  prev: '<svg viewBox="0 0 12 12"><path d="M7.6 2.4 4 6l3.6 3.6"/></svg>',
  next: '<svg viewBox="0 0 12 12"><path d="M4.4 2.4 8 6 4.4 9.6"/></svg>',
  minus: '<svg viewBox="0 0 12 12"><path d="M2.5 6h7"/></svg>',
  plus: '<svg viewBox="0 0 12 12"><path d="M2.5 6h7M6 2.5v7"/></svg>',
  fit: '<svg viewBox="0 0 12 12"><path d="M1.8 4.4V1.8h2.6M10.2 4.4V1.8H7.6M1.8 7.6v2.6h2.6M10.2 7.6v2.6H7.6"/></svg>',
};

/** Makes an element: `text` and `html` set its content, other attributes are set as given. */
export const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  children: (Node | string | null | undefined)[] = [],
) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "html") node.innerHTML = String(v);
    else if (k === "text") node.textContent = String(v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
};

/** A legend key: a dot, a filled box or a (dashed) line in a figure tone. */
export function swatch(tone: string, style: string) {
  const color = `var(--sc-${tone === "lit" ? "lit" : tone})`;
  if (style === "dot") return `<svg viewBox="0 0 18 10"><circle cx="9" cy="5" r="3.4" fill="${color}"/></svg>`;
  if (style === "fill")
    return `<svg viewBox="0 0 18 10"><rect x="2" y="1.5" width="14" height="7" rx="1" fill="color-mix(in srgb, ${color} 18%, var(--sc-card))" stroke="${color}" stroke-width="1"/></svg>`;
  return `<svg viewBox="0 0 18 10"><path d="M1 5h16" stroke="${color}" stroke-width="${tone === "lit" ? 2 : 1.5}" ${style === "dashed" ? 'stroke-dasharray="3 3"' : ""} fill="none"/></svg>`;
}
