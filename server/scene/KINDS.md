<!-- kind:plot -->
## plot

One pair of axes, layers drawn in order (put `area` first, `point`s last).

- Axes: `label` with unit (`"t (s)"`, `"price (£)"`), `min`/`max` covering the interesting part
  with a little margin, `ticks: []` for automatic. `log: true` for quantities over decades.
  `equal: true` for geometry (circles stay round).
- `function`: `expr` in `x` ("a*x^2", "exp(-k*x)"). `domain` limits it (`["0", "inf"]`) or `null`.
  Label it with a short name (`"y = x²"`, `"demand"`); `x^2` renders as x².
- `point`: a dot at (`x`, `y`). `drag: {x: "a", y: ""}` lets the reader drag it, writing the
  slider param `a` (the point's own expressions must use `a` so it follows). `trail: true` leaves
  dots behind (orbits, trajectories).
- `tangent` of a function at an x: the slope made visible. `area` between `expr` and `base`
  over [from, to]: integrals, surpluses, work. `vector` from → to: forces, velocities,
  differences (set `arrow: false` for a plain segment). `hline`/`vline`: thresholds, equilibria,
  limits. `series`: data points the text gives. `bars`: a few categories or a histogram.
  `label`: a word at a spot (use sparingly).
- Zoom rescales the axes for real, so "zoom in and it looks straight" works.

<!-- kind:sequence -->
## sequence

Actors left to right (2–6), time running down, messages as arrows that travel while the clock
runs. The reader scrubs time and steps from event to event.

- Times are expressions in diagram units; make them depend on params (`"lat"`, `"2*lat + 0.3"`)
  so a latency or timeout slider changes the story. Keep the whole story within ~3–12 units.
- `message`: `at` (send) → `arrive`; `reply: true` draws it dashed; `lost: true` ends it in a
  red ✕ halfway (a dropped packet). Labels are the message names (`prepare`, `ACK`, `x=5`).
- `state`: a small box on a lifeline (`PREPARED`, `x = 5`, `term 2`, `LEADER`). `span`: a bar
  for something that takes time (a lock held, a write to disk, a GC pause). `crash`/`recover`
  mark a process dying and coming back. `partition`: a group of actors cut off for a while.
- `narration` on the events that matter tells the story as time passes; leave the rest `""`.
- Give every event room: things on the same lifeline at least 0.5 units apart, so their boxes and
  labels don't pile up. Use a handful of events that tell the story, not every detail.
- `clocks: "lamport"` or `"vector"` prints logical clocks at every send, receive and state
  event, computed by the platform.
- `when` can remove events under a param (`"voteB == 1"` for the abort path), and templates can
  change labels (`"{voteB == 0 ? 'yes' : 'no'}"`).

<!-- kind:graph -->
## graph

Nodes and edges, laid out by the platform. Pick the layout that matches the idea:
`layered` (top-down flow, DAGs, pipelines), `tree`, `circle` (nodes evenly round a ring: gossip,
token rings), `row` (arrays, logs, queues: use `shape: "cell"` for touching cells), `grid`,
`force` (general networks), `manual` (you give x, y in 0–100 for a deliberate picture: a state
machine, a map of towns). When positions carry meaning (keys and servers at their hash on a
consistent-hashing ring, points on a map) use a `diagram` instead: a circle for the ring and
dots or circles placed by angle.

- Node shapes: `circle` (things), `box` (components), `pill` (states), `diamond` (decisions),
  `database` (stores), `cell` (array slots). `sublabel` is a template for a value or state
  (`"v{version}"`, `"{load:0}%"`).
- Edges: `arrow: true` for direction, `dashed` for weaker or asynchronous links, `label` of one or
  two words, and only on the edges whose meaning isn't obvious (labels that don't fit are
  dropped). Two edges between the same pair bend apart automatically.
- Keep it to what the idea needs: 3–9 nodes is typical. Sublabels short (≤ 18 characters).
- `tokens` travel along a path of node ids, starting at `at` seconds, `speed` seconds per hop:
  requests, packets, replication, goods, money. Give the figure a `duration` (and `loop`) so they
  replay, or use `clock` in `at`.
- `groups` draw a box around related nodes (a datacenter, a partition, a region).
- Steps can reveal edges one by one and light the active node: ideal for state machines and
  algorithms.

<!-- kind:object3d -->
## object3d

A solid object assembled from simple parts, drawn in the anatomy finish (paper faces, crisp
edges, a soft halo). The reader orbits it by dragging, takes it apart with the explode slider,
and hides the casing with the cutaway toggle.

- World units are free (millimetres are handy); z is up. A part's `position` is its centre.
  Cylinders, cones, tubes, capsules and prisms stand along z: rotate `[90, 0, 0]` to lay one
  along y, `[0, 90, 0]` along x.
- Build it like the real thing, 6–30 parts: base or casing (`lo`), structure (`mid`), the
  mechanism (`hi`), and the one part to watch (`lit`). Parts should touch or nest, not float.
- Motion: positions and rotations are expressions. Drive a mechanism from one derived angle
  (`th = clock * rpm * tau`) and compute every linked part from it (a piston from the crank
  angle, a gear from its partner's ratio).
- When the inside is the point (an engine, a disk, a cell), list the casing in `cutaway` and
  start with it open: add a param `{id: "cutaway", label: "Cutaway", kind: "toggle", value: 1}`.
- Name only the 4–8 parts a reader must know (`label`); give small fittings `label: ""`.
- `explode`: the offset each part moves when taken apart (outward from the centre, along its
  axis). `cutaway`: the casing part or group ids, so the inside shows. `labels: true` names the
  parts beside the object.
- `info` on each part says what it does in one sentence; the reader taps parts to read it.


<!-- kind:diagram -->
## diagram

A side-view sketch of a physical setup, alive: the drawing a lecturer makes on the blackboard,
now moving by the real equations. World units of your choice; x runs 0 → `width`, y runs
0 → `height` and points UP. Keep the aspect close to the stage (about 10 × 6).

- Shapes, drawn back to front: `rect` (centre x, y, w, h, rotate) for bodies, walls, pistons,
  plates; `circle` for balls, bobs, pulleys, atoms; `line` (points, optional `arrow`) for strings,
  rods, rays, forces, walls; `polygon` for wedges, liquids, lenses; `curve` (x(s), y(s)) for waves,
  trajectories, flames, menisci; `dots` (count, x and y in terms of `i`) for particles: molecules,
  droplets, cells, a crowd; `spring`; `arc` for angles and swings; `ground` for a hatched floor;
  `text` for one or two words in the picture.
- Fills: `paper` for solid bodies, `tint` for liquids and regions, `solid` for small dots, `none`
  for outlines.
- Motion comes from the physics: derive the state from `clock` (or `t`) with the real equation
  (θ = θ₀·cos(√(g/L)·t), h = h_max·(1 − e^(−t/τ))), then place every shape from it.
- Particles: give each dot its own phase from `hash(i)` (deterministic noise 0–1) and move it with
  `tri(phase + clock*speed, 1)` to bounce between walls, or `saw(…)` to stream one way.
- `drag: {x: "V", y: ""}` on a rect or circle lets the reader move it, writing the slider param
  (the shape's own position must use that param).
- Label only the few things that matter (`label` on the shape); one lit shape to watch.
