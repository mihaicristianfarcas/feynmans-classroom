# Classroom runtime: the API a demo is written against

A demo is **one plain browser script**, `demo.js`, that calls `Classroom.demo({...})` exactly once.
No `import`, no `fetch`, no external files: the page has a strict CSP and runs in a sandboxed iframe.
The runtime draws the card (Fig number, title, hint, live readout), the legend, the controls, the
stats row, and runs one frame loop. You supply the drawing and the model.

```js
Classroom.demo({
  title: "Energy of a falling body", // card title, top right. ≤ 32 characters.
  hint: "Set the height · press drop",  // card hint, bottom left. What to do. ≤ 36 characters.
  label: "A ball falls from a height…",  // accessible description of the picture (one or two sentences)
  width: 560, height: 380,              // SVG viewBox. 520–640 × 320–420 works well.
  keys: [                               // optional legend under the card (2–4 entries)
    { mark: "lit", label: "the ball" },   // marks: raised, flat, lit, edge, dim, dotted, dashed, red, green, blue
  ],
  controls: [                           // 1–3 controls (a button counts). Defaults = the book's values.
    { id: "h", label: "Start height", min: 1, max: 20, step: 0.5, value: 12, unit: "m" },          // range (default type)
    { id: "trail", type: "toggle", label: "Show trail", value: true },
    { id: "path", type: "select", label: "Path", options: [["a", "Straight"], ["b", "Curved"]], value: "a" },
    { id: "drop", type: "button", label: "Drop" },
    // add  restart: true  to a control to rebuild the whole demo when it changes
    // add  digits: 2  or  format: (v) => …  to control how the value is printed
  ],
  stats: [ { id: "v", label: "v =" }, { id: "E", label: "T + U =" } ], // live numbers under the controls
  predict: {                            // optional "predict first" question, shown before it plays
    question: "Drop it from twice the height. How fast does it land?",
    choices: ["Just as fast", "About 1.4× faster", "Twice as fast"],
    answer: 1,                          // index into choices
    explain: "½mv² = mgh, so v = √(2gh): twice the height gives √2 times the speed.",
  },
  setup(ctx) {
    // build the static picture once, keep refs to what moves, return the frame function
    ctx.draw([ /* markup strings */ ]);
    const ball = ctx.part("ball");      // element with data-part="ball"
    return {
      frame(dt, t) {                    // dt in seconds (≤ 1/30), t = seconds since start
        // update the model, write the DOM, ctx.readout(...), ctx.stat(...)
        return true;                    // return false when settled: the loop sleeps until input
      },
      dispose() {},                     // optional
    };
  },
});
```

## ctx

| member | what it is |
|---|---|
| `ctx.d2` | 2D drawing helpers (below). Use these for almost everything. |
| `ctx.k`, `ctx.G`, `ctx.T` | the anatomy isometric kit (only for genuinely 3D subjects; see `anatomy/`). |
| `ctx.width`, `ctx.height` | the viewBox size. |
| `ctx.params` | live control values `{ h: 12, trail: true, … }` (buttons have none). |
| `ctx.draw(markup \| markup[])` | replace the SVG content. Call once in setup; per frame, write into a `<g data-part>` instead. |
| `ctx.part(name)` | the element with `data-part="name"` (throws if missing). `ctx.parts(name)` → all of them. |
| `ctx.readout(text)` | the card's live readout, bottom right. Short, true, with units: `h = 8.9 m · v = 7.7 m/s`. |
| `ctx.stat(id, value, digits?)` | write one stat. Numbers are formatted with `digits` (default 2); strings as given. |
| `ctx.set(id, value)` | change a control from code (moves the slider too). |
| `ctx.on(event, fn)` | `"change"` (id, value, params), `"press"` (buttonId), `"pointerdown" \| "pointermove" \| "pointerup" \| "pointerleave"` ({ x, y, fx, fy } in viewBox units / fractions), `"key"` (KeyboardEvent), `"reveal"` (after the predict question), `"theme"`. |
| `ctx.idle()` | seconds since the reader last touched anything (Infinity at start). Use it for an idle tour. |
| `ctx.calm` | true under prefers-reduced-motion: jump to targets, no tours. |
| `ctx.follow(x, target, dt, tau)` | exponential easing; returns the new value (snaps exactly to target when close). |
| `ctx.spring(state, target, dt, stiffness, damping)` | sub-stepped spring on `{ x, v }`; returns true while moving. |
| `ctx.smooth(a, b, x)`, `ctx.clamp`, `ctx.lerp`, `ctx.fmt(n, digits)` | helpers. |
| `ctx.wake()` | restart the loop after it slept (input does this for you). |

Lifecycle: **Restart** re-runs `setup` with the current control values. **Back to text values** resets every
control to its default and restarts. **Pause** stops the loop. A control change fires `"change"` and wakes
the loop; your `frame` should read `ctx.params` every frame, so most demos need no change handler at all.
Errors are caught and shown on the card, and the check fails.

## d2: 2D drawing helpers (all return SVG markup strings)

Coordinates are viewBox units, y grows **down**. `tone` is one of `"hi" | "mid" | "lo" | "faint" | "lit"`
(and `"red" | "green" | "blue"` only when colour is the subject). Every shape accepts `part: "name"` to set `data-part`.

| helper | draws |
|---|---|
| `d2.line(points, { tone, width, dashed, dotted, closed })` | polyline through `[[x, y], …]` |
| `d2.path(d, style)` | raw path data |
| `d2.shape(d, { fill, tone, lit })` | filled path. `fill`: `"paper"` (hides what's behind), `"tone"` (soft tint), `"solid"`, `"none"` |
| `d2.circle(cx, cy, r, { fill, tone, lit })`, `d2.rect(x, y, w, h, { fill, tone, r, lit })` | shapes |
| `d2.dot(x, y, { r, tone })` | filled dot (points on a curve, pivots, trail marks) |
| `d2.arrow(from, to, { tone, head })` | vector with an open head (forces, velocities) |
| `d2.text(x, y, str, { tone, size, anchor, italic, mono })` | small label. `italic: true` for variables (x, v, F), `mono: true` for numbers |
| `d2.ground(x1, x2, y)` | textbook floor: a line with hatches under it |
| `d2.spring(from, to, { coils, width })` | zig-zag spring |
| `d2.arc(cx, cy, r, a0, a1, style)` | circular arc (radians, 0 = +x, clockwise on screen) |
| `d2.axes({ x, y, w, h, xRange, yRange, xTicks, yTicks, xLabel, yLabel, grid, logX, logY })` | axes in a box → `{ svg, sx, sy, at(x, y), clip(points), origin }` |
| `d2.sample(fn, a, b, n, map)` | points of `y = fn(x)`; pass `axes.at` as `map` to land them on the axes |
| `d2.bar(x, base, width, height, { tone, fill })` | a vertical bar growing up from `base` |
| `d2.pathOf(points, closed)` | path data string from points |

Pattern for moving parts: draw the static picture once with `ctx.draw`, include empty groups such as
`<g data-part="ball"></g>`, and each frame set `group.innerHTML = d2.circle(...)` or
`el.setAttribute("transform", \`translate(${x} ${y})\`)`. Both are cheap for simple figures.

## Checking your work

`node check.mjs` loads your demo in a simulated browser, runs a few seconds of frames, moves every control
to its ends and presses every button, and reports errors (must be zero) and warnings (read each one).
The platform then renders it in real Chrome and may send you screenshots to review.
