# Feynman's Classroom

A learning platform for students, professors and professionals: read hard books beside figures you
can play with, test yourself at the right moments, explain ideas back in your own words, and watch
what you know grow as a graph. It runs on your machine, keeps everything in plain files you own, and
does its thinking on **your own Codex or Claude Code subscription** (no API keys).

- **Read with a living margin.** Upload a PDF, EPUB, Markdown or text book. Select any passage and
  choose Explain, Define, Ask or Visualize: the answer appears in the margin **beside the passage**
  (an explanation in about 8 seconds, a figure in 15–30), with a line to it, and you can ask
  follow-ups there. Figures are interactive: a graph you can drag, a protocol you can scrub, a
  network with packets flowing, a 2D physics sketch, a 3D object you can turn and take apart.
- **Notes like Obsidian.** Write while you read; send passages, answers, figures and captured
  formulas or pictures to a note in one keystroke. Notes are Markdown files named by their title,
  with `[[links]]`, embeds, backlinks and unlinked mentions, edited in CodeMirror with a live preview.
- **Learn it for good.** Flashcards scheduled with FSRS-6, pretests before a chapter and quizzes
  after, the Feynman technique (explain it, get your gaps back), a Socratic tutor, and connections
  from the idea to today's world and to your own goals.
- **A second brain.** Books, annotations, notes, concepts, cards and figures live in one folder of
  plain files (a valid Obsidian vault), versioned by git, with indexes kept for people and agents.
  See it as a graph built from your links (and the connections an agent suggests, which you accept
  or reject); ask it questions; have an agent reorganise it, on its own branch, with undo.

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
| Reader → select → **Explain / Define / Ask** | the answer in the margin beside the passage, linked to your own notes where they fit; follow-ups in place | elaboration, elaborative interrogation |
| Reader → select → **Visualize** | an interactive figure of the passage, drawn to your request, in the margin | dual coding; doing beats watching (drag, scrub, predict) |
| every figure | **predict first**: a question before it plays, when intuition is likely wrong | pretesting, generation |
| Reader → select → ⋯ **Make flashcards** | 3–6 flashcards drafted from the passage (minimum information, cloze, "why" cards), edited by you | retrieval practice |
| **Review** | FSRS-6 scheduling (the algorithm Anki uses), decks interleaved, optional "type it first" | spaced and interleaved retrieval |
| Reader → **Study** | **pretest** before a chapter, **quiz** after (misconception-based distractors, explanations, misses become cards in one click) | practice testing, pretesting, feedback |
| Reader → select → ⋯ **Teach it back**, or a concept → **Explain it back** | the Feynman technique: write it plainly, get a score, gaps, unexplained jargon, misconceptions, a "why" follow-up and a 12-year-old's version | self-explanation, elaborative interrogation |
| Reader → select → ⋯ **Connect it to today** | the idea in today's world, in your own work (from your goals), and across fields | elaboration, concrete examples |
| Reader → select → ⋯ **Find resources** | 3–6 videos, explainers, lectures and papers, found with live web search | concrete examples, multiple representations |
| Reader → **Tutor** | ask about the passage or chapter; "Socratic" mode leads you there with questions | tutoring |
| Reader → **Note**, **Notes** | write as you read; passages arrive as quotes linked back to the page | generation, organisation |
| **Review → Mixed quiz** | a quiz across everything you've studied, weakest first | interleaving |
| **Today** | what's due, what's fading (explain it back), what to quiz a few days after reading | spacing |
| **Brain**, **Journey** | the knowledge graph (mastery rings), concepts, notes, figures; study days, recall, the vault's history | metacognition |

Concept mastery is the FSRS-predicted recall of a concept's cards right now (or your best
explanation score when it has no cards), so the graph shows what is actually fading.

### Look and feel

Coal gray and off-white, light or dark (it follows the system until you pick one), with pastel
accents that each mean one thing: **lavender** for the accent and what the models write (margin
answers, AI links), **sage** for known and right, **butter** for what's waiting (cards due) and the
default highlighter, **peach** for figures, **sky** for links and notes, **rose** for wrong, fading
and delete. The app is set in the system sans; what you read and write (books, notes, answers) is in
a serif.

Motion is quick and quiet: popovers and menus grow from where they open, presses scale slightly,
tab and nav indicators slide, new content rises a few pixels, and the theme switch crossfades.
What you do from the keyboard (the ⌘K palette, revealing a card, the reader's shortcuts) doesn't
animate, and reduced motion keeps only fades. The tokens, controls and motion rules live in
`web/src/styles.css`.

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

Figures share the app's palette (below): coal lines on white, the one lit element in the lavender
accent, pastel inks for red, green and blue, in both themes. The drawing technique comes from the
**anatomy** skill (`vendor/anatomy/`): thin precise lines, paper-coloured solids with four-tone
shading and crisp outlines, calm motion. The 3D renderer (`shared/scene/object3d.ts`) is a small
mesh-to-SVG engine in that style. The reference figures in `shared/scene/examples.ts` (see them at `#/gallery`) are the
quality bar and the few-shot examples the model sees.

Two qualities per figure: **Quick** (the fast model; ~10–20 s) and **Careful** (your default model;
about a minute). "Improve → Redraw" applies your notes to the current figure, keeping what works.
For the rare figure the kinds can't express, **Hand-build** has Codex write a custom `demo.js` in
its sandbox (the original pipeline, minutes), checked in real Chrome.

## Reading with a margin

The reader puts the book on the right and a **margin** on the left, as in the nutlope reading demo:
select text and a dark menu offers **Highlight · Explain · Visualize · Ask · Define · + Note** (and,
under ⋯, the passage or a reference to your note, resources, flashcards, teach it back, connect it to
today, the tutor). Keys work too: <kbd>H</kbd> <kbd>E</kbd> <kbd>V</kbd> <kbd>A</kbd> <kbd>D</kbd>
<kbd>N</kbd>. Each answer becomes a card at the height of its passage, which is underlined in the
page; cards never overlap (the open one sits by its passage and the rest make room, as comments do
in a shared document), and a thin line joins the open card to its passage. Click a marked passage to
open its card. <kbd>C</kbd> captures a region of the page (a figure, a formula, a table) as a
picture for your note, with a transcription if you want one (LaTeX for formulas).

Every card is a Markdown file beside the book, `library/<book>/annotations/p152-explain-….md`:

```markdown
---
id: a8c1f0e2
kind: explain                     # highlight · comment · explain · define · ask · resources · visualize
book: designing-data-intensive-applications
book_id: b15c347ba44
pdf: { file: source.pdf, sha256: 9c1e…, pages: 613 }
chapter: c5
page: 152
anchor:
  quote: Replication means keeping a copy of the same data on multiple machines
  prefix: "…in this chapter we discuss "
  suffix: " that are connected via a network"
  start: 1834                     # character offsets in the page's text
  end: 1906
  rects:                          # the selection's boxes, as fractions of the page
    - [0.118, 0.431, 0.762, 0.018]
  md: { file: library/designing-data-intensive-applications/text/05-replication.md, line: 41 }
request: what does "copy" mean here, physically?
model: { provider: codex, name: gpt-6-luna, ms: 8421 }
created: 2026-10-13T07:42:10.000Z
---

> [!quote] p. 152
> Replication means keeping a copy of the same data on multiple machines

…the explanation…

## Follow-up: why not just back up?

…
```

**Finding a passage again.** Anchors follow the W3C Web Annotation model (as Hypothesis does): the
boxes make it instant to draw, the quote with its context makes it robust, and `md` gives agents the
same passage in the book's Markdown. `shared/textmatch.ts` folds both texts (whitespace, hyphenation
at line ends, ligatures, curly quotes, Markdown marks) and matches exactly, then approximately
(Myers' algorithm); pdf-inspector's positioned lines give the height of a quote on its page, which
is how an annotation an agent wrote with only a page and a quote still lands beside its passage.

## Notes

Notes are files in `notes/` (folders allowed), **named by their title** as in Obsidian, with
optional frontmatter. The editor is CodeMirror 6 (what Obsidian is built on): it edits the Markdown
itself, byte for byte, with a live preview (marks hidden away from the cursor, `[[target|text]]`
shown as its text), `[[` completion over notes, concepts and books, and pictures pasted or dropped
into `attachments/`. ⌘-click follows a link. Rendering is react-markdown (remark/rehype) with GFM,
KaTeX, and Obsidian's syntax: `[[links]]`, `![[embeds]]` (notes, annotations, pictures,
`figure:<id>`), `> [!callouts]`, `==highlights==`, `#tags`; a ```` ```figure ```` block is a live
figure. Beside each note: what links here (with the line), unlinked mentions (one click links them),
links out, and **connections**: an agent reads your vault and suggests notes and concepts this one
should link to, each with a reason. Accepting writes `related: ["[[…]]"]` into the note's
frontmatter (so Obsidian and agents see it too); rejected and removed ones are remembered in
`brain/connections.jsonl` and never suggested again (Settings can make it add them directly).
Renaming a note moves the file and rewrites every link to it; deleting moves it to `.trash/`.

## Your vault: plain files, indexed for agents, versioned

```
data/vault/
  AGENTS.md                 the layout and rules, for AI agents (CLAUDE.md imports it)
  INDEX.md                  generated: counts, recent changes, where to look
  profile.md                who you are and how you learn
  notes/**.md               your notes (notes/INDEX.md: generated table of them)
  concepts/<Name>.md        one page per concept (concepts/INDEX.md: with mastery)
  cards/*.md                flashcards (## Front / ## Back)
  figures/*.json            saved figures
  attachments/              pictures
  library/INDEX.md          generated: every book
  library/<book>/           book.json · the file · text/NN-chapter.md (with [[page N]] markers)
                            annotations/*.md · demos/ · README.md (generated: chapters, annotations)
  brain/links.tsv           generated: every link (backlinks are one rg away)
  brain/connections.jsonl   suggested connections and your decisions
  log/*.jsonl               reviews, the journey, agent runs
```

**Files, not a database.** Markdown with frontmatter (and JSONL for logs) is the only source of truth:
you, Obsidian, git and any agent with `rg`, `sed` or `cat` can read and change it, and there's no
second copy to keep in sync. The bookkeeping a database would do is kept as **generated files**,
rewritten a moment after any change: the vault map, the library, each book's chapters and
annotations, the note and concept tables, every link. An agent reads a 2 KB index instead of opening
a hundred files, which is where the savings in tokens and calls come from. At this scale an index in
memory builds in a second and ripgrep searches a library in milliseconds; if search ever gets slow,
a SQLite full-text index can sit in `.cache/` as a disposable copy rebuilt from the files. Books,
annotations, notes and logs are versioned; the PDFs, the extracted text and the generated indexes
are not (`.gitignore` keeps a managed block). Vaults and books from earlier versions are migrated at
startup.

## Agents with a real shell, and the guardrails

Agents get no custom tools and no MCP: they work on the files with the shell they already have
(`rg`, `sed`, `ls`, `jq`, `sqlite3`…), confined by the CLI's own OS sandbox (Seatbelt on macOS,
bubblewrap/Landlock on Linux). Codex runs with a custom permission profile, Claude Code with
`--restricted` and its sandbox settings; both verified (`tests/agent-sandbox.test.ts` runs real shell
commands under the Codex sandbox):

| the agent tries to | allowed? |
|---|---|
| read and search the vault (or its working copy) | yes |
| write its working copy (agents that change things) | yes |
| write the live vault, anything else, or `.git` | no |
| look around your home folder | no |
| reach the network | no |

- **Ask** (and connection suggestions) run read-only, directly in the vault.
- **Do** (Ask → Do) gives an agent work: "turn my chapter 5 highlights into a summary note". It works in
  a **git worktree of the vault** (its own branch, outside the vault), with the books' text and the
  indexes linked in read-only, so it never edits a note you have open. When it's done the server
  checks the diff: every file must still parse, app-owned files (logs, profile, `book.json`,
  `AGENTS.md`…) must be untouched, and **deleting files or taking lines out of your notes waits for
  your OK** (you see the diff). Then it merges, as one commit with an **Undo** button. Every run is
  recorded in `log/agents.jsonl` (task, model, files, commit).
- Book text is material, never instructions, in every prompt; a passage that tries to give orders
  can't get past the sandbox and the checks anyway.

## Your subscription

Everything model-driven goes through one door (`server/llm.ts`): `structured()` for JSON matching a
schema, `text()` for prose (both can look at pictures and search the web), `agent()` for an agent
with a shell in a folder, read-only or writing. Behind it:

- **Codex**: `codex exec` with your ChatGPT login (`--output-schema` for structure, `-i` for pictures,
  live web search for resources, a permission profile for agents, ephemeral sessions).
- **Claude Code**: `claude -p` with your Claude login (`--json-schema`; agents get Bash, Read, Grep,
  Glob (and Edit, Write when they may write) under `--restricted` and the sandbox; no MCP servers, no
  session files).

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
shared/links.ts    Obsidian links: parse, rewrite, file names
shared/textmatch.ts finding a quote again across differently extracted texts
shared/fsrs.ts     FSRS-6
server/            Hono API: ingest, jobs, SSE, settings, the provider layer (llm.ts), agents (agents.ts)
  annotations/     the margin: anchors (anchor.ts), annotation files and their answers, routes
  scene/           figure generation (guide, kinds, generate.ts) and figures in books (figures.ts)
  learn/           notes, connections, cards, concepts, study tools, brain (graph, search, ask, journey, today)
  vault/           the vault (collections, git, watching), links, indexes, connections, the books' text
  generate/        chapter planning and the hand-built demo pipeline (Codex)
runtime/           the hand-built demo runtime (iframe pages)
web/src/           React: Today, Library, Reader (margin, figures, note, tutor, study), Notes, Review,
                   Brain, Ask (and Do), Journey, Settings
  Margin.tsx, SelectionMenu.tsx, anchoring.ts, Capture.tsx     the reader's margin and menu
  Notes.tsx, NoteEditor.tsx, Markdown.tsx                      notes, the editor, rendering
  styles.css, ui.ts   the design system: tokens, controls, motion; sliding indicators
  app.css, reader.css, notes.css                               pages, the reader, notes and Markdown
  scene/           the player: the universal frame, loop, controls, dragging, zoom
tests/             vitest units; screenshot and browser-flow scripts
vendor/anatomy/    the anatomy skill (MIT)
```

## Tests

```bash
npm test                    # 100 unit tests: expressions, every reference figure, FSRS, the vault and its
                            # migration, links and renames, indexes, annotations and anchoring, ingest,
                            # Codex args, and the agents' sandbox (real shell commands under Codex's sandbox)
npm run typecheck
npm run test:e2e            # browser checks of the running app (add --generate to draw a figure with the model)
npx tsx tests/margin-flow.ts <bookId> <page> out/                            # select → Explain → follow-up → note
npx tsx tests/scene-shots.ts out/ [--theme dark] [--only tangent,engine]   # screenshot the gallery
npx tsx tests/reader-flow.ts <bookId> <block> out/ "a request"               # select → Visualize → figure
npx tsx scripts/try-scene.ts lag lamport wick                                # generate sample figures, timed
```

## Limits

- Scanned PDFs need OCR first (text-based PDFs only).
- Figures are as true as the model's reading of the passage; every number they show comes from
  their own expressions, so check the readout against the text when it matters.
- Hand-built demos need Codex (they run in its sandbox).
- Agents that write need git (their changes are checked, merged and undone through the vault's history).
- Capture works on PDF pages; in EPUBs, pictures are already in the text.
- Speed and how much you can generate follow your plan's limits.
