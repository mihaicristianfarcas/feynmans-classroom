// Calculus Made Easy, ch. II–III: a square of side x grows by dx. The new area is
// x² + 2·x·dx + dx². The corner piece dx² is "small of the second order": as dx shrinks it
// vanishes far faster than the two strips. One simple picture: the square, its two strips and
// the corner, with the corner as the lit accent.
Classroom.demo({
  title: "Growing square",
  hint: "Shrink dx · watch the corner",
  label: "A square of side x with two strips of width dx along two sides and a small square corner dx by dx.",
  width: 560,
  height: 380,
  keys: [
    { mark: "raised", label: "x², the old square" },
    { mark: "flat", label: "two strips, x·dx each" },
    { mark: "lit", label: "corner, dx²" },
  ],
  controls: [
    { id: "dx", label: "Growth dx", min: 0.02, max: 2.5, step: 0.02, value: 1.5 },
    { id: "x", label: "Side x", min: 3, max: 7, step: 0.1, value: 5 },
  ],
  stats: [
    { id: "strips", label: "2x·dx =" },
    { id: "corner", label: "dx² =" },
    { id: "share", label: "corner share of growth =" },
  ],
  predict: {
    question: "Make dx ten times smaller. What happens to the corner's share of the new area?",
    choices: ["Stays the same", "About ten times smaller", "A hundred times smaller"],
    answer: 1,
    explain: "The share is dx² ÷ (2x·dx + dx²) ≈ dx/2x, so it shrinks in step with dx, while the corner's own area falls a hundredfold.",
  },

  setup(ctx) {
    const { d2 } = ctx;
    const U = 34; // px per unit
    const O = [190, 330]; // bottom-left corner of the square on screen
    const shown = { x: ctx.params.x, dx: ctx.params.dx };
    let clock = 0;

    ctx.draw(`<g data-part="fig"></g>`);
    const fig = ctx.part("fig");

    function picture(x, dx) {
      const s = x * U, d = dx * U;
      const [ox, oy] = O;
      const out = [];
      // the old square
      out.push(d2.rect(ox, oy - s, s, s, { tone: "hi", fill: "tone" }));
      // the two strips
      out.push(d2.rect(ox + s, oy - s, d, s, { tone: "mid", fill: "paper" }));
      out.push(d2.rect(ox, oy - s - d, s, d, { tone: "mid", fill: "paper" }));
      // the corner: the lit part
      out.push(d2.rect(ox + s, oy - s - d, d, d, { tone: "hi", fill: "solid", lit: true }));
      // labels: x under and beside the square, dx beside the strips
      out.push(d2.line([[ox, oy + 12], [ox + s, oy + 12]], { tone: "lo" }));
      out.push(d2.line([[ox, oy + 8], [ox, oy + 16]], { tone: "lo" }), d2.line([[ox + s, oy + 8], [ox + s, oy + 16]], { tone: "lo" }));
      out.push(d2.text(ox + s / 2, oy + 28, "x", { italic: true, tone: "hi", size: 14, anchor: "middle" }));
      out.push(d2.line([[ox - 12, oy], [ox - 12, oy - s]], { tone: "lo" }));
      out.push(d2.line([[ox - 16, oy], [ox - 8, oy]], { tone: "lo" }), d2.line([[ox - 16, oy - s], [ox - 8, oy - s]], { tone: "lo" }));
      out.push(d2.text(ox - 22, oy - s / 2 + 5, "x", { italic: true, tone: "hi", size: 14, anchor: "end" }));
      if (d > 9) {
        out.push(d2.text(ox + s + d / 2, oy + 28, "dx", { italic: true, tone: "mid", size: 13, anchor: "middle" }));
        out.push(d2.text(ox - 22, oy - s - d / 2 + 5, "dx", { italic: true, tone: "mid", size: 13, anchor: "end" }));
      }
      out.push(d2.text(ox + s / 2, oy - s / 2 + 6, "x²", { italic: true, tone: "hi", size: 18, anchor: "middle" }));
      if (d > 14) {
        out.push(d2.text(ox + s + d / 2, oy - s / 2 + 5, "x·dx", { italic: true, tone: "mid", size: 12, anchor: "middle" }));
      }
      return out.join("");
    }

    return {
      frame(dt) {
        // When nobody touches it, let dx breathe down to almost nothing and back.
        const touring = ctx.idle() > 3.6 && !ctx.calm;
        let target = ctx.params.dx;
        if (touring) {
          clock += dt;
          target = 0.05 + (ctx.params.dx - 0.05) * (0.5 + 0.5 * Math.cos((clock * 2 * Math.PI) / 8));
        } else clock = 0;
        shown.x = ctx.follow(shown.x, ctx.params.x, dt, 0.25);
        shown.dx = ctx.follow(shown.dx, target, dt, touring ? 0.5 : 0.2);

        fig.innerHTML = picture(shown.x, shown.dx);

        const x = shown.x, dx = shown.dx;
        const strips = 2 * x * dx, corner = dx * dx;
        const share = corner / (strips + corner);
        ctx.stat("strips", strips);
        ctx.stat("corner", corner, 4);
        ctx.stat("share", `${(share * 100).toFixed(1)} %`);
        ctx.readout(`dx = ${dx.toFixed(2)} · corner ${(share * 100).toFixed(1)} %`);
        return touring || shown.x !== ctx.params.x || shown.dx !== target;
      },
    };
  },
});
