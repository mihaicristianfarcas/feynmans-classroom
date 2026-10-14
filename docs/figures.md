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

## Animations (ManimGX)

When a moving picture explains it better than one you play with (a secant turning into a tangent,
a proof by rearrangement, a sum building up), choose **Animation** under Visualize. A model writes a
short film for [ManimGX](https://manimgx.academa.ai/) (Manim Community Edition's API on a Rust GPU
core): a Python scene in 2 to 5 steps, written to the house guide (`server/manim/GUIDE.md`: one
idea, few words on screen, the palette, the frame, what doesn't run here).

```
passage + your request + who you are
        │   one structured call: title, caption, the scene's Python
        ▼
 tidied (server/manim/source.ts): the palette block in place, read for what can't work here
        │
        ▼
 run in headless Chrome, in the same sandboxed page the reader uses (server/manim/check.ts):
 it must finish without an error, and ManimGX's own layout checks (what `manimgx inspect` reports:
 text cut off by the frame, texts over each other, lines through labels) look at each play's end
        │   errors or layout problems? up to two repair turns with exactly what was reported
        ▼
 a ```manim block in the margin card, played in ManimGX's own player
```

The player is ManimGX's (`runtime/manim/`, from its npm package, MIT, adapted): Pyodide runs the
scene in a Web Worker and the engine, compiled to WebAssembly, draws it with WebGPU (Chrome, Edge,
Safari 26), with its own controls: play and pause, a scrubber, the timeline in the scene's plays,
full screen, and keys (Space, ← →, `?`). It starts when you press play (each player runs its own
Python). The scene states the classroom's palette at its top (`PAPER`, `INK`, `ACCENT`…) and the
player swaps the values for your light or dark theme. Each animation keeps its code: copy it or
download it, and `manimgx render scene.py` makes the video. If one ever stops with an error while it
plays, **Fix it** has it written again with that error.

Python and the packages come from the server's own mirror (`/api/manim/…`, `server/manim/mirror.ts`):
Pyodide from jsDelivr and ManimGX with its few dependencies from PyPI, each file fetched once into
`DATA_DIR/.cache/manimgx` (about 30 MB), so animations play offline afterwards. The scene runs in an
iframe with an opaque origin and a policy that allows nothing but that mirror (see
[SECURITY.md](../SECURITY.md)).

``````markdown
```manim
import manimgx as m
…
class SecantToTangent(m.Scene):
    def construct(self) -> None:
        …
```
``````

A ```` ```manim ```` block plays in any note too, so the agent can write animations into notes.

## Qualities

Two qualities per figure: **Quick** (the fast model; ~10–20 s) and **Careful** (your default model;
about a minute). "Improve → Redraw" applies your notes to the current figure, keeping what works.
For the rare figure the kinds can't express, **Hand-build** has Codex write a custom `demo.js` in
its sandbox (the original pipeline, minutes), checked in real Chrome.
