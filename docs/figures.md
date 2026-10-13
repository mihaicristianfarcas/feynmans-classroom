# Figures

Fast, deterministic, in one house style.

The old way to get a demo was to have an agent write code, check it in a browser and fix it: five
to twenty minutes each, and every one looked a little different. Figures are now **declarative
scene specs**: a model fills in a JSON description of *what* to show and *how it moves*, and the
platform's own renderers draw it. One structured-output call, validated before anyone sees it:

```
passage + your request + who you are
        │
        ▼
 the guide (server/scene/GUIDE.md, KINDS.md) + reference figures + a strict JSON schema per kind
        │   one quick model call (Codex: gpt-6-luna, low effort; Claude: sonnet)
        ▼
 validate: every expression parses and uses only names that exist, every reference resolves,
 boxes don't collide, then a dry run renders it at several moments with params at their ends
        │   errors? one repair turn with the exact errors
        ▼
 the player draws it in the universal frame
```

Five kinds cover most of what a learner needs to see:

| kind | for | e.g. |
|---|---|---|
| `plot` | quantities and how they depend on each other | a function and its tangent, supply and demand, decay, an integral as area |
| `sequence` | actors exchanging messages over time | two-phase commit, Raft, Lamport clocks (computed by the platform), replication lag |
| `graph` | things and their connections or states | state machines, pipelines with tokens flowing, trees, arrays, hash rings |
| `diagram` | a 2D physical sketch that moves | a pendulum, a wick drawing up fuel, refraction, gas molecules pushing a piston |
| `object3d` | an object and how its parts work, in 3D | an engine with a crank you can watch, a hard disk, a cell |

Every figure gets the same frame: Fig number and title, the stage, a hint and a live readout, the
legend and narration, then play/pause, restart, step back and forward, a progress slider, zoom and
reset (disabled when they don't apply, never hidden), the parameters, "back to text values" and the
live stats. Doers drag points, nodes and pistons, scrub protocols and orbit 3D objects; tap any part
to read what it is. All of it works from the keyboard on the focused stage: Space plays, ← → step,
↑ ↓ pick and read the parts, Shift + arrows drag the picked part (or pan, or turn a 3D object), + −
zoom and 0 resets. Numbers that move are expressions in a small safe language
(`shared/scene/expr.ts`: no property access, no globals), so a spec can only compute values.

Figures share the app's palette ([design.md](design.md)): coal lines on white, the one lit element in the lavender
accent, pastel inks for red, green and blue, in both themes. The drawing technique comes from the
**anatomy** skill (`vendor/anatomy/`): thin precise lines, paper-coloured solids with four-tone
shading and crisp outlines, calm motion. The 3D renderer (`shared/scene/object3d.ts`) is a small
mesh-to-SVG engine in that style. The reference figures in `shared/scene/examples.ts` (see them at `#/gallery`) are the
quality bar and the few-shot examples the model sees.

Two qualities per figure: **Quick** (the fast model; ~10–20 s) and **Careful** (your default model;
about a minute). "Improve → Redraw" applies your notes to the current figure, keeping what works.
For the rare figure the kinds can't express, **Hand-build** has Codex write a custom `demo.js` in
its sandbox (the original pipeline, minutes), checked in real Chrome.
