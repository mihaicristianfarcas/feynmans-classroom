/* An animation's source, before it runs: tidied into the classroom's shape (the code alone, ManimGX
 * imported, the palette block exactly as the player expects it, so the reader's theme can recolour the
 * film) and read for what can't work here (other packages, files, sound, the shapes the browser can't
 * make, colours outside the palette). These are checks for quality and compatibility; what keeps a
 * scene from doing harm is where it runs (a sandboxed frame, see server/manim/frame.ts). */

/** The palette, as a scene's file states it (the player swaps the values for the reader's theme). */
export const PALETTE: Record<string, string> = {
  PAPER: "#252529",
  INK: "#edebe6",
  MUTED: "#949398",
  FAINT: "#3e3e44",
  ACCENT: "#c8bff3",
  RED: "#f0a0a8",
  GREEN: "#95d1a9",
  BLUE: "#9ec2ee",
  YELLOW: "#e3cc78",
  ORANGE: "#f2b48a",
};
const PALETTE_BLOCK = `# the classroom's palette: the player sets these to the reader's theme (use only these names)
${Object.entries(PALETTE)
  .map(([name, value]) => `${name} = "${value}"`)
  .join("\n")}
m.config.background_color = PAPER`;

/** Modules a scene may import (the standard library's harmless parts, numpy, ManimGX, networkx). */
const MODULES = new Set([
  "manimgx",
  "numpy",
  "math",
  "cmath",
  "random",
  "itertools",
  "functools",
  "collections",
  "dataclasses",
  "typing",
  "fractions",
  "decimal",
  "statistics",
  "colorsys",
  "enum",
  "string",
  "operator",
  "bisect",
  "heapq",
  "abc",
  "copy",
  "networkx",
  "__future__",
]);

/** What can't work in the classroom's player, with what to say about it. */
const FORBIDDEN: [RegExp, string][] = [
  [/\bopen\s*\(/, "reads or writes a file (`open`): a scene can't use files"],
  [
    /\b(?:__import__|exec|eval|compile|globals|locals|breakpoint|input)\s*\(/,
    "uses a Python built-in a scene can't use here",
  ],
  [/\b(?:add_sound|Sound|self\.say|voices)\b/, "uses sound or a voice: the player here has neither"],
  [/\b(?:ImageMobject|SVGMobject)\b/, "loads a picture from a file: draw it with shapes instead"],
  [
    /\bm\.(?:Union|Intersection|Difference|Exclusion)\b/,
    "uses Union/Intersection/Difference/Exclusion, which don't run in the browser",
  ],
  [
    /\bconfig\.(?:pixel_width|pixel_height|frame_rate|frame_height|frame_width)\s*=/,
    "changes the video's size or frame rate",
  ],
];

/** Colours outside the palette: ManimGX's named colours (WHITE is invisible on the light theme). */
const RAW_COLOUR =
  /\bm\.(?:WHITE|BLACK|GRAY|GREY|LIGHT_GRAY|DARK_GRAY|BLUE|RED|GREEN|YELLOW|ORANGE|PURPLE|PINK|TEAL|GOLD|MAROON)(?:_[A-E])?\b/;

/** The code alone (a model sometimes wraps it in a fence), ManimGX imported, the palette block in place. */
export function normalizeScene(raw: string): string {
  let code = raw.replace(/\r\n/g, "\n").trim();
  const fenced = /```(?:python|py)?\s*\n([\s\S]*?)\n```/.exec(code);
  if (fenced) code = fenced[1];
  const lines = code.split("\n");
  // the palette goes after the imports at the top, exactly as the player expects it
  const isPalette = (l: string) =>
    /^#\s*the classroom's palette/i.test(l) ||
    new RegExp(`^(?:${Object.keys(PALETTE).join("|")})\\s*=\\s*["']#[0-9a-fA-F]{6}["']\\s*(?:#.*)?$`).test(l) ||
    /^m\.config\.background_color\s*=/.test(l);
  const rest = lines.filter((l) => !isPalette(l));
  if (!rest.some((l) => /^import manimgx as m\b/.test(l)))
    rest.splice(rest.findLastIndex((l) => /^from __future__ import/.test(l)) + 1, 0, "import manimgx as m");
  let lastImport = -1;
  for (const [i, l] of rest.entries()) {
    if (/^(?:import|from)\s/.test(l)) lastImport = i;
    else if (l.trim() && !l.startsWith("#") && lastImport >= 0) break;
  }
  rest.splice(lastImport + 1, 0, "", PALETTE_BLOCK);
  return `${rest
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()}\n`;
}

/** What in a scene's source can't work here, or breaks the house style (empty when it reads well). */
export function lintScene(code: string): string[] {
  const problems: string[] = [];
  if (!/^class\s+\w+\s*\(\s*(?:m\.)?\w*Scene\s*\)\s*:/m.test(code))
    problems.push("defines no scene: one class deriving from m.Scene (or m.ThreeDScene)");
  else if (!/def construct\s*\(\s*self/.test(code)) problems.push("the scene has no construct(self) method");
  for (const m of code.matchAll(/^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import)/gm)) {
    const top = (m[1] || m[2]).split(".")[0];
    if (!MODULES.has(top))
      problems.push(`imports ${top}: a scene can use only manimgx, numpy and Python's own maths modules`);
  }
  const body = code.replace(/^#.*$/gm, "");
  for (const [pattern, why] of FORBIDDEN) if (pattern.test(body)) problems.push(why);
  const raw = RAW_COLOUR.exec(body);
  if (raw)
    problems.push(`uses ${raw[0]}: use the palette's names (INK, MUTED, ACCENT, BLUE…) so it reads in both themes`);
  const hex = /["']#[0-9a-fA-F]{6}["']/.exec(
    body
      .split("\n")
      .filter((l) => !new RegExp(`^(?:${Object.keys(PALETTE).join("|")})\\s*=`).test(l))
      .join("\n"),
  );
  if (hex) problems.push(`uses the colour ${hex[0]}: use the palette's names so it reads in both themes`);
  return [...new Set(problems)];
}
