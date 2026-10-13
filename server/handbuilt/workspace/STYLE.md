# How a Classroom demo looks and moves

The target is the demo you'd want beside a great lecture: **simple, intuitive, alive**. Think of a
lecturer's blackboard sketch that moves: a ball on a track, a planet on its orbit, a curve with a point
sliding along it, a square that grows, vectors that add. One idea per demo. A reader gets it in five
seconds.

The *finish* comes from the anatomy figure style (its full guide is in `anatomy/` if you want the reasoning):
calm, monochrome, precise, one lit accent, live readout in a card. Use its finish, not its complexity:
**no elaborate machines, no isometric 3D, no decorative detail** unless the subject is a 3D object.

## Picture
- **Plain 2D**: side views, plots on axes, top-down diagrams. Centre the picture; it should use about
  60–80% of the viewBox with even margins, and nothing may touch the edges.
- **Few parts, all meaningful.** Every mark either is the subject, shows a quantity, or gives scale
  (a ground line, an axis, a ruler). Remove anything that is only decoration.
- **Labels are short and small** (11–13 px; the subject's main symbol may be up to 16): axis names (`h (m)`, `log F`, `t`), a variable on a curve or point (`A`, `1/r²`),
  tick numbers. Variables in italics (`d2.text(…, { italic: true })`), numbers in mono. No sentences, no
  title inside the drawing (the card has title, hint and readout). Never let labels overlap lines or each other.
- **Show the numbers the text uses.** Scales, ticks and defaults match the book's example values.

## Tones (they switch with the light/dark theme automatically; never hard-code a colour)
| what | tone |
|---|---|
| the subject (the curve, the body, the main shape) | `hi` |
| structure (axes, ground, frame, secondary shapes) | `mid` |
| minor ticks, guides, trails | `lo` |
| grid, reference lines | `faint` |
| **the one thing to watch now** (the moving ball, the point on the curve) | `lit`, exactly one |
| colour (`red`, `green`, `blue`) | only when colour is the subject, or to tell 2–3 curves apart when tones can't |

Fills: `"paper"` for solid bodies that hide what's behind, `"tone"` for a soft tint (areas, bars),
`"solid"` sparingly (a small dot, the lit corner). Reference values are `dashed`; paths travelled are `dotted` or trails of `lo` dots.

## Motion
- Something moves from the first second: the demo plays on its own (an idle loop that shows the point),
  and the reader steers it with the controls. When the reader acts, the idle tour stops
  (`ctx.idle() < 3.6`) and resumes after a few quiet seconds.
- Time-based and calm: use `dt`, ease toward targets (`ctx.follow`, `ctx.spring`), never jump. Physical
  motion follows the real equations (real g, real periods), slowed with a visible time-warp factor if needed.
- Readout and stats come from the same model that moves the picture, in true units, every frame.
- **Only numbers that mean something in the book's terms.** Stats are optional: 0–4 of them. For a
  qualitative idea, the readout is a state in words (`flame: points down`, `wick: wetted to the top`)
  and there may be no stats at all. Never report quantities about the drawing or the animation itself
  ("% of the drawing", "animation phase", "front progress"), and never print disclaimers like
  "schematic" in the drawing.
- Under `ctx.calm` (reduced motion), jump to targets and skip the tour; the demo must still respond.
- Return `false` from `frame` when nothing moves, so the loop sleeps.

## Controls and words
- 1–3 controls. Defaults are the book's values (the "Back to text values" button restores them).
  Ranges wide enough to see the effect, steps that print cleanly.
- `hint` says what to do ("Drag dx · watch the corner"). `readout` is the key live value in a few words.
- `predict`: add one when there's a tempting wrong intuition the demo settles (the video's "predict first").
- Legend `keys`: 2–4 entries naming what the tones mean.
