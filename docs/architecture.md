# Architecture

Feynman's Classroom is one Node process (the API, and in production the built app) and a React app,
working on one folder of plain files: the vault. There can be several vaults; one is open at a time. Models are reached through the learner's own
Codex, Claude Code or OpenCode CLI, never an API key.

```
browser (React, web/)  ──HTTP + server-sent events──▶  server/ (Hono on 127.0.0.1)
                                                          │
                     ┌────────────────────────────────────┼─────────────────────────┐
                     ▼                                    ▼                         ▼
          DATA_DIR/vault (Markdown, JSONL, books)    codex exec / claude -p /    Chrome (optional:
          the only source of truth, versioned by jj   opencode run (server/llm/)  hand-built demo checks)
```

## The repository

```
server/            the API and everything behind it (Node, TypeScript, run with tsx)
  index.ts         start: open the vault that was open last, listen
  vaults.ts        the vaults from the app's side: what each holds, making, opening (closing the one open)
                   and deleting one
  app.ts           the HTTP app: the local-only guard, the open vault around each request, errors, every
                   route group, the built web app
  http.ts fs.ts    HTTP and file helpers; errors.ts, events.ts (live updates), jobs.ts (queue)
  config.ts        paths, ports and tuning from the environment; settings.ts: the learner's settings
  routes/          one file per API area (documents, books, demos, annotations, notes, cards, study, brain,
                   agents…)
  vault/           the vault as files: the list of vaults (vaults.ts), the one open and the work that
                   belongs to it (current.ts), the document store, each kind's file format (kinds.ts),
                   history (jj), logs, watching, indexes, links
  books/           the book store, books shared between vaults (shared.ts), changing a book's details
                   (edit.ts), types, finding quotes (locate.ts), find in a book (find.ts), figure placement
                   and numbers
  ingest/          reading uploaded books: PDF, EPUB, Markdown, text, chapter detection
  annotations/     the margin: anchors, files, model-written answers, live updates, sending to notes
  learn/           documents of any kind (docs.ts: make, change, rename, delete, versions), then what
                   each kind does beyond that: notes, concepts, cards (FSRS-6), the tutor's sessions;
                   study tools, connections, search, graph, journey
  scene/           drawing figures with a model (one structured call → a validated scene spec)
  manim/           animations (ManimGX): the guide, writing and checking a scene in headless Chrome,
                   the sandboxed page it plays in, the local mirror of Pyodide and PyPI it runs on
  handbuilt/       hand-built demos: Codex writes demo.js in a sandboxed workspace, checked in Chrome
  llm/             the one door to models: structured(), text(), agent(); Codex, Claude and OpenCode drivers, sandboxes
  agents/          the agent: where the learner is, the prompt, its jj workspace, checks, landing, undo
shared/            code the server and the browser both run
  scene/           the figure engine: spec types, the expression language, five renderers, validation
  fsrs.ts links.ts textmatch.ts thread.ts chapters.ts vault-types.ts
web/src/           the React app (Vite)
  vaults/          the vault switch in the top bar, the vaults in Settings, making one, the books of the
                   other vaults, and starting the page again when another vault opens
  app/             the shell (a slim bar along the top): routing (each page its own chunk, loaded on
                   first visit), navigation, theme, the ⌘K palette, what a page shows when it fails
  agent/           the agent's panel (⌘J), its button, the runs it shows, where the learner is
  pages/           Today, Library (and Figures), Review, Journey, Settings, Welcome, Gallery;
                   brain/: the graph that fills the page, the card beside it, its legend, a concept's page
  reader/          the reader: book views (zoom, links), margin, selection menu, find bar, the figures
                   index and a figure opened large, note, tutor (with its sessions), capture, gutter
  notes/           notes: the file tree (with folders), the note pane, its versions and links sidebar, the editor
  components/      shared pieces: Markdown, dialogs and study tools, quiz, graph, side panels' edges and
                   buttons, profile form
  scene/           the figure player (the universal frame around every figure), and figure stills
  manim/           an animation in the app: ManimGX's player in its sandboxed frame
  api/             typed calls to the server (documents of any kind: docs.ts), and the live book hook
  lib/             small helpers: accessibility (focus traps, arrow keys, announcements), loading, time,
                   side panels' widths, adding books from files and folders
  styles/          the design system and page styles
runtime/           the runtime hand-built demos run on, in a sandboxed iframe; runtime/manim: ManimGX's
                   browser player (MIT, adapted), bundled into the page animations play in
vendor/anatomy/    the anatomy skill (MIT): the drawing kit hand-built demos use
tests/             unit tests (vitest); tests/browser/: end-to-end, accessibility and screenshot scripts
scripts/           dev server, kit bundling, skill sync, branch protection, figure experiments
docker/            the development container's entrypoint and seccomp profile (with Dockerfile, compose.yaml)
.agents/skills/    skills for coding agents (Claude Code reads them through .claude/skills/)
docs/              these pages
```

Every source file starts with a comment saying what it is for; start there when you open one.

## How a request flows

A route in `server/routes/` reads the request and calls a service (`learn/`, `annotations/`,
`scene/`…). Services read and write the vault through `server/vault/` (one store keeps every document,
whatever its kind, in memory and writes through to disk atomically) and call models through `server/llm/`. Changes are
announced on `events.ts`, and open pages follow them over server-sent events (`web/src/api/live.ts`
for a book, `/api/events` for everything else). The vault's history is kept by Jujutsu: the change in
progress is named as you work and closed when a sitting ends (see [vault.md](vault.md)).

The agent (⌘J) can work on several requests at once: each works in a jj workspace of the vault and
lands as one change after whatever happened meanwhile (see [agents.md](agents.md)).

Slow work (finding chapters, drawing figures, building demos, writing animations) runs in `jobs.ts`, reporting progress
on the book's event stream, and resumes after a restart.

## Opening another vault

The server opens another vault without restarting (`server/vaults.ts`). Each opening is a *visit*
(`server/vault/current.ts`): every request runs in the visit that was current when it came in
(AsyncLocalStorage), and so does everything it starts. Two rules keep vaults apart:

- **Paths into the vault come from `vaultDir()`.** Work of a visit that has ended (an answer arriving
  after the learner switched) gets `VaultClosed` there instead of the new vault's folder, and its model
  calls are stopped with the visit. What it was doing is still marked pending in its own vault's
  files, so it starts again when that vault is next opened.
- **What a module keeps about the vault lives in `vaultState()`**: an index, a cache, a timer is made
  afresh for each visit, so a vault opened again starts from its files and late work only sees its own.

Pages say which vault they show (the `x-vault` header); one still showing a closed vault gets 409,
and every tab starts again at Today when it hears `vault-open` on the event stream.

## Security model

The server binds to 127.0.0.1 and answers only requests that name a local host and don't come from
another website (`localOnly()` in `server/http.ts`). Book content is never trusted: EPUB and HTML are
sanitized at ingest, book pictures are served with a script-blocking CSP, hand-built demos run in a
sandboxed iframe with no network, model prompts treat book text as material, and agents run inside
the CLI's OS sandbox. See [SECURITY.md](../SECURITY.md).

## More

[learning.md](learning.md) (the study tools) · [reading.md](reading.md) (the margin, notes) ·
[figures.md](figures.md) · [vault.md](vault.md) · [agents.md](agents.md) (models and agents) ·
[design.md](design.md) (look, motion, accessibility) · [configuration.md](configuration.md)
