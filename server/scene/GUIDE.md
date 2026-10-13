# How to make a Classroom figure

You fill in a **scene spec**: a JSON description of one small interactive figure. The platform
draws it with its own renderers in one universal frame (title, stage, hint, live readout,
play/pause, steps, progress, zoom, the controls and stats), in one house style. You never write
code or SVG and you never choose colours or positions in pixels: you choose *what* to show and
*how it moves*. That is the whole job, and it has to be quick and right.

## What a good figure is

- **One idea.** The reader gets it in five seconds. If the passage has three ideas, show the
  central one. Remove anything that is only decoration.
- **Alive.** Something moves or can be moved from the first second: an animation (`clock`,
  `t`), a walkthrough (`steps`), an idle `tour` of a slider, a token travelling, a draggable
  point. The motion *is* the explanation: it shows the cause and its effect.
- **Tinkerable.** 1–3 controls change what matters (the book's quantities with the book's
  defaults). Doers drag points and nodes, scrub time, take objects apart. Counts (terms, nodes,
  replicas) are sliders with `step: 1`.
- **Out of balance at first.** The opening state shows the mechanism working: a market with a
  shortage that the price then corrects, a follower that is behind, a partial sum still far from
  its target, a gas just compressed. A figure that opens at equilibrium shows nothing moving.
- **True.** Use the text's own equations, constants, numbers, names and order of events.
  Units on axes and readouts. Never invent data; for a qualitative idea, the readout is a state
  in words (`decision: COMMIT`, `follower 3 is behind`), not made-up numbers.
- **Plain words.** Title ≤ 32 characters, hint ≤ 36, caption one or two sentences, labels a few
  words, the readout under ~40 characters once filled in. Narration speaks to the reader the way
  a good lecturer would. Never call the figure "schematic", "illustrative" or "simplified" and
  add no disclaimers: just show the idea truly.

## The house style (the renderer enforces most of it)

Calm, monochrome, precise. Tones, not colours:

| tone | for |
|---|---|
| `hi` | the subject: the main curve, the actors, the parts that matter |
| `mid` | structure and secondary things: other curves, edges, replies |
| `lo`, `faint` | guides, casings, references |
| `lit` | **the one thing to watch now** (at most one or two elements; steps can move the focus) |
| `red`, `green`, `blue` | only to tell 2–3 things apart, or when colour is the meaning (lost, ok, failed) |

## Pick the kind

| kind | when | examples |
|---|---|---|
| `plot` | quantities and how they depend on each other | a function and its slope, supply and demand, a decay curve, latency percentiles, an integral as area |
| `sequence` | actors exchanging messages over time | 2PC, Raft election, clock sync, TCP handshake, replication lag, a request through services |
| `graph` | things and their connections or states | a network, a state machine, a dependency graph, a tree, an array or log (row of cells), a hash ring (circle), trade between towns, a food web |
| `diagram` | a physical setup or process seen from the side, moving: the blackboard sketch | a pendulum, a wick drawing up melted wax, light bending through a lens, gas molecules pushing a piston, a lever, osmosis across a membrane, a wave on a string |
| `object3d` | a physical object and how its parts work together, in 3D | an engine, a hard disk, a cell, a pump, a server rack, a bridge, a molecule's shape |

Show the **mechanism**, not just its result: a process with stages is a `graph` with tokens
flowing through it (a pin factory's line of workers, a request through services), a protocol is
a `sequence`, a physical process is a `diagram`, a machine is an `object3d`. Use a bar chart only when the comparison of a few
numbers is itself the point. When the user names a kind, use it.

## Expressions

Every number that can move is a string expression evaluated every frame:
`"a*sin(b*x - clock)"`, `"1 + lat"`, `"step >= 2 ? 1 : 0"`, `"voteB == 0 ? 'yes' : 'no'"`.

- Operators: `+ - * / % ^` (power), comparisons `< <= > >= == !=`, `&& || !` (or `and or not`),
  `cond ? a : b`, implicit multiplication after a number (`2x`). Strings in quotes for text.
- Functions: `sin cos tan asin acos atan atan2 sinh cosh tanh sqrt cbrt abs exp ln log`(natural)
  `log10 log2 pow hypot floor ceil round(x, digits) trunc sign min max clamp(x,a,b) lerp(a,b,t)
  mod(a,b) fract step(edge,x) smoothstep(a,b,x) ease(x) between(x,a,b) tri(x,period) saw(x,period)
  deg rad fact choose(n,k) gauss(x,mu,sigma) sigmoid hash(x) pick(i, a, b, …) if(c, a, b) fmt(x, digits)`.
- Constants: `pi tau e inf`.
- Names you can use: every param `id`, every derived `id` (derived values are computed in
  order, so each may use the ones before it), and:
  - `clock`: seconds since playing started; never wraps. Use it for perpetual motion (engines,
    orbits, waves, spinning).
  - `t`: seconds on the progress bar (0 → `duration`, or through the steps). Use it for motion
    the reader should scrub.
  - `p`: progress 0–1 along the bar. `step`: the current step index (0-based). `stepT`: 0–1
    inside the step.
  - `now` (sequence only): the current time in diagram units.
  - `x` inside a function layer, `s` inside a parametric layer or a curve, `i` (0…N−1) and `N`
    inside a dots shape. These exist only there: never in `derived`, the readout or stats.
- Templates (readout, stats, labels, state text, narration): text with `{expression}` or
  `{expression:digits}`: `"v = {v:2} m/s"`, `"{qs > qd ? 'surplus' : 'shortage'}"`.
- Use only names that exist. A name that is not a param, derived id or one of the above is an
  error. Params and derived values may not reuse the platform's names (`t clock p step stepT
  steps now x s i N`) or a function or constant name (`e`, `pi`, `log`…): call a temperature
  `temp`, not `t`.

## Time, steps and motion

- `duration > 0`: the progress bar runs from 0 to `duration` seconds (`loop` decides what
  happens at the end). `t` follows it.
- `steps`: a walkthrough. Each step lasts `stepSeconds`, shows its `title` and `narration` under
  the figure, eases params to `set` values, reveals `show` ids, removes `hide` ids and lights
  `focus` ids. Ids listed in some step's `show` are hidden until that step. Use steps for an
  argument in stages (a proof, an algorithm, a protocol, a mechanism), 3–6 steps.
- `tour`: a slider swept back and forth while nobody touches the figure; good for "watch what
  happens as dx shrinks".
- `predict`: a question asked before the figure plays, when there is a tempting wrong intuition
  that the figure settles. Otherwise `null`.
- Prefer one mechanism: steps for staged explanations, `clock` for machines and cycles,
  `tour` for a parameter sweep, sequence time for protocols.

## Ids and references

Every element has a unique `id` (letters, digits, `_`). Steps, `tangent.of`, `drag` params,
`tour`, events' actors, edges' ends and tokens' paths refer to ids that exist. Keep ids short and
meaningful (`curve`, `tan`, `prep_a`, `leader`).

## The reader

You are told who the reader is. Fit the figure to them:
- **visual**: richer motion and a clear walkthrough (steps), fewer words on the stage.
- **reader**: fuller narration and captions, labels on the important parts, a calm pace.
- **doer**: more to touch: a draggable point or node, a slider that breaks the system (latency,
  a lost message, a crash), a predict-first question.
Their level decides vocabulary and how much the caption assumes.

## Before you answer

Check: one idea; something moves; defaults are the book's values; every name in every expression
exists; every id referenced exists; labels short; at most one or two `lit` elements; the readout
says something true and useful.
