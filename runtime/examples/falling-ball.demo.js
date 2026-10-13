// A falling body: kinetic energy T = ½mv² grows exactly as potential energy U = mgh shrinks,
// so T + U stays put. One ball, one floor, three bars. The ball is the lit accent.
Classroom.demo({
  title: "Energy of a falling body",
  hint: "Set the height · press drop",
  label:
    "A ball falls from a height onto the floor. Beside it, three bars show kinetic energy, potential energy and their sum.",
  width: 560,
  height: 380,
  keys: [
    { mark: "lit", label: "the ball" },
    { mark: "raised", label: "T, kinetic" },
    { mark: "flat", label: "U, potential" },
    { mark: "dashed", label: "T + U stays level" },
  ],
  controls: [
    { id: "h", label: "Start height", min: 1, max: 20, step: 0.5, value: 12, unit: "m", restart: true },
    { id: "m", label: "Mass", min: 0.5, max: 4, step: 0.5, value: 1, unit: "kg" },
    { id: "drop", type: "button", label: "Drop" },
  ],
  stats: [
    { id: "t", label: "t =" },
    { id: "v", label: "v =" },
    { id: "T", label: "T =" },
    { id: "U", label: "U =" },
    { id: "E", label: "T + U =" },
  ],
  predict: {
    question: "Drop the ball from twice the height. How fast does it reach the floor?",
    choices: ["Just as fast", "About 1.4 times faster", "Twice as fast"],
    answer: 1,
    explain: "½mv² = mgh, so v = √(2gh): twice the height gives √2 ≈ 1.41 times the speed.",
  },

  setup(ctx) {
    const { d2 } = ctx;
    const g = 9.8;
    const FLOOR = 340,
      TOP = 40,
      HMAX = 20;
    const X = 150; // the drop line
    const py = (h) => FLOOR - (h / HMAX) * (FLOOR - TOP);
    const R = 10;
    const state = { h: ctx.params.h, v: 0, t: 0, falling: false, landed: false, wait: 0.8 };

    const bars = { x: 330, w: 34, gap: 26 };

    ctx.draw([
      d2.ground(40, 520, FLOOR),
      // a ruler post beside the drop line
      d2.line(
        [
          [X - 40, FLOOR],
          [X - 40, TOP - 6],
        ],
        { tone: "lo" },
      ),
      ...Array.from({ length: HMAX + 1 }, (_, i) =>
        d2.line(
          [
            [X - 40, py(i)],
            [X - 40 + (i % 5 ? 4 : 8), py(i)],
          ],
          { tone: i % 5 ? "lo" : "mid" },
        ),
      ),
      ...[0, 5, 10, 15, 20].map((i) =>
        d2.text(X - 46, py(i) + 4, `${i}`, { anchor: "end", mono: true, size: 10, tone: "mid" }),
      ),
      d2.text(X - 46, TOP - 14, "h (m)", { anchor: "end", italic: true, size: 12, tone: "hi" }),
      `<g data-part="trail"></g>`,
      `<g data-part="ball"></g>`,
      // energy bars
      `<g data-part="bars"></g>`,
      d2.text(bars.x + bars.w / 2, FLOOR + 22, "T", { anchor: "middle", italic: true, tone: "hi", size: 13 }),
      d2.text(bars.x + bars.w * 1.5 + bars.gap, FLOOR + 22, "U", {
        anchor: "middle",
        italic: true,
        tone: "hi",
        size: 13,
      }),
      d2.text(bars.x + bars.w * 2.5 + bars.gap * 2, FLOOR + 22, "T + U", {
        anchor: "middle",
        italic: true,
        tone: "hi",
        size: 13,
      }),
    ]);
    const ball = ctx.part("ball"),
      trail = ctx.part("trail"),
      barsEl = ctx.part("bars");
    const marks = [];

    const drop = () => {
      Object.assign(state, { h: ctx.params.h, v: 0, t: 0, falling: true, landed: false });
      marks.length = 0;
    };
    ctx.on("press", (id) => id === "drop" && drop());
    ctx.on("reveal", () => drop());

    return {
      frame(dt) {
        const m = ctx.params.m;
        if (!state.falling && !state.landed) {
          // waiting at the top: drop on its own after a moment, as a demo would
          state.wait -= dt;
          if (state.wait <= 0) drop();
        }
        if (state.falling) {
          const step = ctx.calm ? 1 / 30 : dt;
          state.t += step;
          state.v = g * state.t;
          state.h = Math.max(0, ctx.params.h - 0.5 * g * state.t * state.t);
          if (marks.length === 0 || state.t - marks[marks.length - 1].t >= 0.1) marks.push({ t: state.t, h: state.h });
          if (state.h <= 0) {
            state.falling = false;
            state.landed = true;
            state.v = Math.sqrt(2 * g * ctx.params.h);
          }
        }
        const T = 0.5 * m * state.v * state.v,
          U = m * g * state.h,
          E = T + U;
        const y = py(state.h) - R;
        ball.innerHTML = d2.circle(X, y, R, { lit: true, fill: "paper" }) + d2.dot(X, y, { r: 1.6, tone: "lit" });
        trail.innerHTML =
          marks.map((mk) => d2.dot(X + 22, py(mk.h) - R, { r: 1.6, tone: "mid" })).join("") +
          (marks.length
            ? d2.line(
                [
                  [X + 22, py(ctx.params.h) - R],
                  [X + 22, py(state.h) - R],
                ],
                { tone: "faint" },
              )
            : "");
        // bars in joules, scaled so the total from the start height fills 80% of the room
        const hpx = (j) => (j / (m * g * ctx.params.h)) * (FLOOR - TOP) * 0.8;
        barsEl.innerHTML = [
          d2.bar(bars.x, FLOOR, bars.w, hpx(T), { tone: "hi", fill: "tone" }),
          d2.bar(bars.x + bars.w + bars.gap, FLOOR, bars.w, hpx(U), { tone: "mid", fill: "paper" }),
          d2.bar(bars.x + 2 * (bars.w + bars.gap), FLOOR, bars.w, hpx(E), { tone: "hi", fill: "paper" }),
          d2.line(
            [
              [bars.x - 8, FLOOR - hpx(E)],
              [bars.x + 3 * bars.w + 2 * bars.gap + 8, FLOOR - hpx(E)],
            ],
            { tone: "faint", dashed: true },
          ),
        ].join("");

        ctx.stat("t", `${state.t.toFixed(2)} s`);
        ctx.stat("v", `${state.v.toFixed(2)} m/s`);
        ctx.stat("T", `${T.toFixed(1)} J`);
        ctx.stat("U", `${U.toFixed(1)} J`);
        ctx.stat("E", `${E.toFixed(1)} J`);
        ctx.readout(
          state.landed
            ? `landed at ${state.v.toFixed(1)} m/s`
            : `h = ${state.h.toFixed(2)} m · v = ${state.v.toFixed(2)} m/s`,
        );
        return !state.landed;
      },
    };
  },
});
