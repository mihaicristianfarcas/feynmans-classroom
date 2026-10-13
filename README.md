# Feynman's Classroom

A learning platform for students, professors and professionals: read hard books beside figures you
can play with, test yourself at the right moments, explain ideas back in your own words, and watch
what you know grow as a graph. It runs on your machine, keeps everything in plain files you own, and
does its thinking on **your own Codex or Claude Code subscription** (no API keys).

- **Read with figures.** Upload a PDF, EPUB, Markdown or text book. Select any passage, say what you
  want to see ("what happens if a message is lost?"), and an interactive figure appears beside the
  text in about **10–20 seconds**: a graph you can drag, a protocol you can scrub, a network with
  packets flowing, a 2D physics sketch, a 3D object you can turn and take apart.
- **Learn it for good.** Flashcards scheduled with FSRS-6, pretests before a chapter and quizzes
  after, the Feynman technique (explain it, get your gaps back), a Socratic tutor, and connections
  from the idea to today's world and to your own goals.
- **A second brain.** Highlights, notes, concepts, cards and figures live in a Markdown vault with
  `[[links]]`, versioned by git, readable by you, Obsidian and AI agents alike. See it as a
  knowledge graph coloured by how well you know each concept; ask it questions.

## Quick start

```bash
npm install
codex login          # Codex with your ChatGPT account (check: codex login status)
#   or: install Claude Code and log in by running `claude` once
npm run dev          # API on :8787, app on http://localhost:5173
```

Open http://localhost:5173. The first run asks who you are and how you like to learn (this is what
the figures, the tutor and the quizzes adapt to). Then add a book in **Library**, open it, and
select a passage.

Production: `npm run build && npm start` serves the app and the API from one port (8787).

Requirements: Node 20+, the Codex CLI or Claude Code, git (for the vault's history), and Chrome or
Chromium only for the optional hand-built demos and the screenshot tests.

## What's in it, and why

The study tools follow the techniques with the strongest evidence behind them. Dunlosky et al.'s
review of ten learning techniques (*Psychological Science in the Public Interest*, 2013) rated two of
them high utility, **practice testing** and **distributed practice**, and three moderate,
**elaborative interrogation**, **self-explanation** and **interleaving**, while the techniques
students use most (highlighting, rereading, summarising) rated low. The Learning Scientists' six
strategies add **concrete examples** and **dual coding** (words with pictures). Each tool below puts
one of them where it's easiest to use.

| Where | Tool | Technique |
|---|---|---|
| Reader → select → **Visualize** | an interactive figure of the passage, drawn to your request | dual coding; doing beats watching (drag, scrub, predict) |
| every figure | **predict first**: a question before it plays, when intuition is likely wrong | pretesting, generation |
| Reader → select → **Cards** | 3–6 flashcards drafted from the passage (minimum information, cloze, "why" cards), edited by you | retrieval practice |
| **Review** | FSRS-6 scheduling (the algorithm Anki uses), decks interleaved, optional "type it first" | spaced and interleaved retrieval |
| Reader → **Study** | **pretest** before a chapter, **quiz** after (misconception-based distractors, explanations, misses become cards in one click) | practice testing, pretesting, feedback |
| Reader → select → **Explain**, or a concept → **Explain it back** | the Feynman technique: write it plainly, get a score, gaps, unexplained jargon, misconceptions, a "why" follow-up and a 12-year-old's version | self-explanation, elaborative interrogation |
| Reader → select → **Connect** | the idea in today's world, in your own work (from your goals), and across fields | elaboration, concrete examples |
| Reader → **Tutor** | ask about the passage or chapter; "Socratic" mode leads you there with questions | tutoring |
| **Review → Mixed quiz** | a quiz across everything you've studied, weakest first | interleaving |
| **Today** | what's due, what's fading (explain it back), what to quiz a few days after reading | spacing |
| **Brain**, **Journey** | the knowledge graph (mastery rings), concepts, notes, figures; study days, recall, the vault's history | metacognition |

Concept mastery is the FSRS-predicted recall of a concept's cards right now (or your best
explanation score when it has no cards), so the graph shows what is actually fading.

## Figures: fast, deterministic, in one house style

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
to read what it is. Numbers that move are expressions in a small safe language
(`shared/scene/expr.ts`: no property access, no globals), so a spec can only compute values.

The finish comes from the **anatomy** skill (`vendor/anatomy/`): monochrome tones that follow the
theme, thin precise lines, one lit accent, paper-coloured solids with four-tone shading and crisp
outlines, calm motion. The 3D renderer (`shared/scene/object3d.ts`) is a small mesh-to-SVG engine in
that finish. The reference figures in `shared/scene/examples.ts` (see them at `#/gallery`) are the
quality bar and the few-shot examples the model sees.

Two qualities per figure: **Quick** (the fast model; ~10–20 s) and **Careful** (your default model;
about a minute). "Improve → Redraw" applies your notes to the current figure, keeping what works.
For the rare figure the kinds can't express, **Hand-build** has Codex write a custom `demo.js` in
its sandbox (the original pipeline, minutes), checked in real Chrome.

## Your vault: agent-native, plain files, versioned

```
data/vault/
  AGENTS.md            the layout, for AI agents (and you)
  profile.md           who you are and how you learn; the tutor reads it
  notes/*.md           notes, highlights, explanations, connections, saved answers
  concepts/*.md        one page per concept: summary, related concepts, source passages
  cards/*.md           flashcards (## Front / ## Back) with their source
  figures/*.json       figures you kept (embed one in any note with ![[figure:id]])
  sources/*.md         one page per book: chapters, its concepts and notes
  library/<book>/*.md  each book's text by chapter (derived, not versioned)
  log/reviews.jsonl    every review; card memory is replayed from it with FSRS
  log/activity.jsonl   your learning journey
```

Markdown with YAML frontmatter is what language models read best and what people can open
anywhere (it's a valid Obsidian vault). The server keeps an index in memory, writes through, picks
up edits you make in another editor, and commits to git a few seconds after changes, so the vault's
history is your learning history. **Ask** runs a read-only agent inside the vault: it reads
`AGENTS.md`, searches notes, concepts, cards and the full text of your books, and answers with
sources. A database would be faster to query, but nothing at this scale needs it, and plain files
are what both people and agents can work with directly.

## Your subscription

Everything model-driven goes through one door (`server/llm.ts`): `structured()` for JSON matching a
schema, `text()` for prose, `agent()` for read-only work in a folder. Behind it:

- **Codex**: `codex exec` with your ChatGPT login (`--output-schema` for structure, a read-only
  sandbox, ephemeral sessions).
- **Claude Code**: `claude -p` with your Claude login (`--json-schema`, no tools except Read/Grep/Glob
  for the vault agent, no MCP servers, no session files).

**Settings** picks the provider (automatic: Codex when it's logged in, else Claude Code), the quick
and careful model and effort for each, and how many calls may run at once (3 by default, so a burst
never hammers your plan).

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | API (and production app) port |
| `DATA_DIR` | `./data` | books, figures, the vault, settings |
| `LLM_PROVIDER` | `auto` | `codex`, `claude` or `auto` (Settings overrides) |
| `CODEX_BIN` / `CLAUDE_BIN` | `codex` / `claude` | the CLIs |
| `CODEX_FAST_MODEL` | Codex's "fast and affordable" model | quick tier on Codex |
| `CODEX_FAST_EFFORT` | `low` | quick tier effort |
| `CODEX_MODEL` | from `~/.codex/config.toml` | careful tier, and hand-built demos |
| `CLAUDE_FAST_MODEL` / `CLAUDE_SMART_MODEL` | `sonnet` / `opus` | Claude Code tiers |
| `LLM_CONCURRENCY` | `3` | model calls at once |
| `CODEX_CONCURRENCY`, `CODEX_FIX_ROUNDS`, `CODEX_TIMEOUT_MS`, `CHROME_PATH` | | hand-built demos (see `server/config.ts`) |

## Layout

```
shared/scene/      the figure engine: spec types, expressions, five renderers, validation, schemas,
                   reference figures (runs in the browser and in Node)
shared/fsrs.ts     FSRS-6
server/            Hono API: ingest, anchors, jobs, SSE, settings, the provider layer
  scene/           figure generation (guide, kinds, generate.ts) and figures in books (figures.ts)
  learn/           cards, concepts, study tools (quiz, explain, connect, tutor), brain (graph, search, ask, journey, today)
  vault/           the Markdown vault, git, the books' text export
  generate/        chapter planning and the hand-built demo pipeline (Codex)
runtime/           the hand-built demo runtime (iframe pages)
web/src/           React: Today, Library, Reader (figures, tutor, notes, study), Review, Brain, Ask, Journey, Settings
  scene/           the player: the universal frame, loop, controls, dragging, zoom
tests/             vitest units; screenshot and browser-flow scripts
vendor/anatomy/    the anatomy skill (MIT)
```

## Tests

```bash
npm test                    # 74 unit tests: expressions, every reference figure (validate + render + schema),
                            # validation catching model mistakes, FSRS, the vault, ingest, anchors, Codex args
npm run typecheck
npm run test:e2e            # browser checks of the running app (add --generate to draw a figure with the model)
npx tsx tests/scene-shots.ts out/ [--theme dark] [--only tangent,engine]   # screenshot the gallery
npx tsx tests/reader-flow.ts <bookId> <block> out/ "a request"               # select → Visualize → figure
npx tsx scripts/try-scene.ts lag lamport wick                                # generate sample figures, timed
```

## Limits

- Scanned PDFs need OCR first (text-based PDFs only).
- Figures are as true as the model's reading of the passage; every number they show comes from
  their own expressions, so check the readout against the text when it matters.
- Hand-built demos need Codex (they run in its sandbox).
- Speed and how much you can generate follow your plan's limits.
