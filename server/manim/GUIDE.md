# Writing an animation for the classroom (ManimGX)

You write one short animation, a Python scene for **ManimGX** (Manim Community Edition's API, `import
manimgx as m`), that makes one idea of the passage click for this learner. It plays beside the book in
the reader's margin, in a 16:9 player with play/pause, a scrubber and a timeline of its plays, so the
learner can stop and replay any moment.

## What makes a good one

- **One idea, shown moving.** Pick the single idea in the passage that motion explains best (a quantity
  changing, a process unfolding, a shape transforming, a proof by rearrangement) and build it up step by
  step. Motion carries the idea; words on screen are few (a title, labels, one formula at a time).
- **Steps.** Split it into 2–5 steps with `self.next_section("what this step shows")` between them; the
  player's timeline shows them. Each step: something appears or changes, then `self.wait(0.6–1.5)` so it
  sinks in. 15–50 seconds in all.
- **Concrete first.** Real numbers before symbols, a picture before the formula, the formula last and
  tied to the picture (same colour for a quantity in both).
- **True to the book.** Use the book's notation and example when it has one.

## The file

Exactly this shape: the imports, the palette block **unchanged** (the player swaps its values for the
reader's light or dark theme), helpers if you need them, then one `Scene` subclass with `construct`.

```python
import manimgx as m
import numpy as np

# the classroom's palette: the player sets these to the reader's theme (use only these names)
PAPER = "#252529"
INK = "#edebe6"
MUTED = "#949398"
FAINT = "#3e3e44"
ACCENT = "#c8bff3"
RED = "#f0a0a8"
GREEN = "#95d1a9"
BLUE = "#9ec2ee"
YELLOW = "#e3cc78"
ORANGE = "#f2b48a"
m.config.background_color = PAPER


class SomethingClear(m.Scene):
    def construct(self) -> None:
        ...
```

- **Colours: only the palette names**, never `m.WHITE`, `m.BLUE`, hex codes or `BLUE_E`. `INK` for text and
  main lines, `MUTED` for axes and secondary text, `FAINT` for grids and guides, `ACCENT` for the one thing
  to watch, `RED`/`GREEN`/`BLUE`/`YELLOW`/`ORANGE` for distinct quantities. **Pass `color=` to every text,
  formula and shape** (the default is white, invisible on the light theme). Fills: the same colour with
  `fill_opacity=0.2–0.35`.
- Imports: only `manimgx`, `numpy`, and Python's standard library (`math`, `random`, `itertools`…).
  `random.seed(…)` if you use randomness.
- Don't set `config.pixel_width`, `pixel_height` or `frame_rate`.

## The frame and layout

- The frame is 14.2 × 8 units, centred on the origin. Keep everything inside x ∈ [−6.6, 6.6], y ∈ [−3.6, 3.6].
- A title, if any: `m.Text("…", color=INK, font_size=36).to_edge(m.UP, buff=0.4)`. Labels and body text
  `font_size` 26–34; formulas 32–44; never below 22.
- Place with `next_to(other, direction, buff=0.25+)`, `arrange(m.DOWN, buff=…)`, `to_edge`, `move_to`,
  `shift`; group with `m.VGroup(...)`. A label sits next to what it names, never on top of a line or
  another text. Put a readout or formula in free space (often the right third, beside a plot on the left).
- When text changes, `Transform`/`TransformMatchingTex` the old into the new, or `FadeOut` the old first.
  Don't stack texts in one place.

## Making things move

- Appear: `m.Create(shape)`, `m.Write(text_or_formula)`, `m.FadeIn(mob, shift=0.3 * m.UP)`,
  `m.GrowFromCenter`. Leave: `m.FadeOut`. Emphasis: `m.Indicate(mob, color=ACCENT)`,
  `m.Circumscribe(mob, color=ACCENT)`, `m.SurroundingRectangle(mob, color=ACCENT, buff=0.15)`.
- Change: `m.Transform(a, b)`, `m.ReplacementTransform(a, b)`, `m.TransformMatchingTex(f1, f2)`,
  `mob.animate.shift(…).scale(…).set_color(…)`. Several at once: `self.play(a, b)`; in turn:
  `m.LaggedStart(*anims, lag_ratio=0.2)`, `m.Succession(…)`.
- Continuous change: a `m.ValueTracker(v)`, animated with `tracker.animate.set_value(w)`, and the shapes
  that depend on it rebuilt each frame with `m.always_redraw(lambda: …)` (derive everything from tracker
  values, never from counting frames). A changing number: `m.always_redraw(lambda: m.MathTex(f"…{v:.2f}",
  color=INK).move_to(…))` or `m.DecimalNumber(…)` with an updater.
- Timing: `run_time=1–3` for most plays, longer (3–6) for a slow sweep; `rate_func=m.smooth` (default),
  `m.linear` for steady motion, `m.there_and_back` to return.

## Pictures of quantities

- Plots: `axes = m.Axes(x_range=[a, b, step], y_range=[c, d, step], x_length=6.5, y_length=4.5, tips=False,
  axis_config={"color": MUTED, "stroke_width": 2})`, then `axes.plot(lambda x: …, x_range=[…], color=BLUE)`,
  points with `axes.c2p(x, y)`, the area under a graph `axes.get_area(graph, x_range=[…], color=BLUE,
  opacity=0.3)`, Riemann rectangles `axes.get_riemann_rectangles(graph, x_range=[…], dx=…)`. Label axes with
  small `MathTex` placed `next_to` the axis ends.
- Number lines: `m.NumberLine(x_range=[…], length=10, color=MUTED, include_numbers=True)`.
- Shapes: `Circle`, `Square`, `Rectangle`, `Polygon`, `Line`, `DashedLine`, `Arrow`, `Dot`, `Arc`,
  `Brace(mob, m.DOWN)` with `brace.get_text("…")`/`get_tex(…)`, `Angle(l1, l2)`.
- Text and maths: `m.Text("plain words", color=INK)`, `m.MathTex(r"a^2 + b^2 = c^2", color=INK)` (raw
  strings; standard LaTeX maths: no packages, no `\def`/`\newcommand`), `m.Tex(r"words and $x^2$")`.
  Colour parts of a formula: `formula.get_parts_by_tex("dx").set_color(YELLOW)`.
- 3D only when the idea is 3D: `class X(m.ThreeDScene)`, `self.set_camera_orientation(phi=65 * m.DEGREES,
  theta=-45 * m.DEGREES)`, `m.ThreeDAxes`, `m.Surface`, `m.Sphere`, `self.begin_ambient_camera_rotation(rate=0.15)`.

## Not available here

No sound or voice (`add_sound`, `Sound`, `self.say`), no files (images, SVGs, fonts, reading or writing
anything), no network, no `Union`/`Intersection`/`Difference`/`Exclusion` (they don't run in the browser),
no Chinese, Japanese or Korean text, no other packages (except `networkx` for `m.Graph`).

## A reference

```python
class SecantToTangent(m.Scene):
    def construct(self) -> None:
        title = m.Text("The slope at a point", color=INK, font_size=36).to_edge(m.UP, buff=0.4)
        axes = m.Axes(
            x_range=[0, 4, 1], y_range=[0, 9, 3], x_length=6.4, y_length=4.6, tips=False,
            axis_config={"color": MUTED, "stroke_width": 2},
        ).to_edge(m.LEFT, buff=0.8).shift(0.4 * m.DOWN)
        curve = axes.plot(lambda x: x**2 / 2, x_range=[0, 4], color=BLUE, stroke_width=4)
        label = m.MathTex(r"y = \tfrac{1}{2}x^2", color=BLUE, font_size=34).next_to(curve.get_end(), m.LEFT, buff=0.3)
        self.play(m.Write(title))
        self.play(m.Create(axes), m.Create(curve), m.FadeIn(label))

        self.next_section("a secant through two points")
        x0 = 1.5
        dx = m.ValueTracker(1.8)

        def secant() -> m.Line:
            h = dx.get_value()
            p, q = axes.c2p(x0, x0**2 / 2), axes.c2p(x0 + h, (x0 + h) ** 2 / 2)
            d = (q - p) / np.linalg.norm(q - p)
            return m.Line(p - 1.2 * d, q + 1.2 * d, color=ACCENT, stroke_width=4)

        line = m.always_redraw(secant)
        dot = m.Dot(axes.c2p(x0, x0**2 / 2), color=INK)
        moving = m.always_redraw(lambda: m.Dot(axes.c2p(x0 + dx.get_value(), (x0 + dx.get_value()) ** 2 / 2), color=ACCENT))
        slope = m.always_redraw(
            lambda: m.MathTex(
                rf"\frac{{\Delta y}}{{\Delta x}} = {((x0 + dx.get_value()) ** 2 / 2 - x0**2 / 2) / dx.get_value():.2f}",
                color=INK, font_size=34,
            ).to_edge(m.RIGHT, buff=0.8).shift(1.0 * m.UP)
        )
        self.play(m.FadeIn(dot), m.FadeIn(moving), m.Create(line), m.Write(slope))
        self.wait(0.5)

        self.next_section("the gap shrinks to nothing")
        self.play(dx.animate.set_value(0.05), run_time=4)
        result = m.MathTex(r"\text{slope} = x_0 = 1.5", color=ACCENT, font_size=34).next_to(slope, m.DOWN, buff=0.4)
        self.play(m.Write(result), m.Create(m.SurroundingRectangle(result, color=ACCENT, buff=0.15)))
        self.play(m.Indicate(dot, color=ACCENT))
        self.wait(1)
```
