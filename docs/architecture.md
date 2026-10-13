# Architecture

Feynman's Classroom is one Node process (the API, and in production the built app) and a React app,
working on one folder of plain files: the vault. Models are reached through the learner's own
Codex or Claude Code CLI, never an API key.

```
browser (React, web/)  ──HTTP + server-sent events──▶  server/ (Hono on 127.0.0.1)
                                                          │
                     ┌────────────────────────────────────┼─────────────────────────┐
                     ▼                                    ▼                         ▼
          DATA_DIR/vault (Markdown, JSONL, books)    codex exec / claude -p      Chrome (optional:
          the only source of truth, versioned by jj   (server/llm/)              hand-built demo checks)
```

## The repository

```
server/            the API and everything behind it (Node, TypeScript, run with tsx)
  index.ts         start: prepare the vault, resume interrupted work, listen
  app.ts           the HTTP app: the local-only guard, errors, every route group, the built web app
  http.ts fs.ts    HTTP and file helpers; errors.ts, events.ts (live updates), jobs.ts (queue)
  config.ts        paths, ports and tuning from the environment; settings.ts: the learner's settings
  routes/          one file per API area (books, demos, annotations, notes, cards, study, brain, agents…)
  vault/           the vault as files: collections, file formats, history (jj), logs, watching, indexes, links
  books/           the book store, types, finding quotes (locate.ts), figure placement and numbers
  ingest/          reading uploaded books: PDF, EPUB, Markdown, text, chapter detection
  annotations/     the margin: anchors, files, model-written answers, live updates, sending to notes
  learn/           notes, concepts, cards (FSRS-6), study tools, connections, search, graph, journey
  scene/           drawing figures with a model (one structured call → a validated scene spec)
  handbuilt/       hand-built demos: Codex writes demo.js in a sandboxed workspace, checked in Chrome
  llm/             the one door to models: structured(), text(), agent(); Codex and Claude drivers, sandboxes
  agents/          the agent: where the learner is, the prompt, its jj workspace, checks, landing, undo
shared/            code the server and the browser both run
  scene/           the figure engine: spec types, the expression language, five renderers, validation
  fsrs.ts links.ts textmatch.ts vault-types.ts
web/src/           the React app (Vite)
  app/             the shell (a slim bar along the top): routing, navigation, theme, the ⌘K palette
  agent/           the agent's panel (⌘J), its button, the runs it shows, where the learner is
  pages/           Today, Library (and Figures), Review, Journey, Settings, Welcome, Gallery;
                   brain/: the graph that fills the page, the card beside it, a concept's page
  reader/          the reader: book views, margin, selection menu, figures pane, note, tutor, capture, gutter
  notes/           notes: the file tree (with folders), the note pane, its versions and links sidebar, the editor
  components/      shared pieces: Markdown, dialogs and study tools, quiz, graph, profile form
  scene/           the figure player (the universal frame around every figure)
  api/             typed calls to the server, and the live book hook
  lib/             small helpers: accessibility (focus traps, arrow keys, announcements), loading, time
  styles/          the design system and page styles
runtime/           the runtime hand-built demos run on, in a sandboxed iframe
vendor/anatomy/    the anatomy skill (MIT): the drawing kit hand-built demos use
tests/             unit tests (vitest); tests/browser/: end-to-end, accessibility and screenshot scripts
scripts/           dev server, kit bundling, skill sync, branch protection, figure experiments
.agents/skills/    skills for coding agents (Claude Code reads them through .claude/skills/)
docs/              these pages
```

Every source file starts with a comment saying what it is for; start there when you open one.

## How a request flows

A route in `server/routes/` reads the request and calls a service (`learn/`, `annotations/`,
`scene/`…). Services read and write the vault through `server/vault/` (collections keep an index in
memory and write through to disk atomically) and call models through `server/llm/`. Changes are
announced on `events.ts`, and open pages follow them over server-sent events (`web/src/api/live.ts`
for a book, `/api/events` for everything else). The vault's history is kept by Jujutsu: the change in
progress is named as you work and closed when a sitting ends (see [vault.md](vault.md)).

The agent (⌘J) can work on several requests at once: each works in a jj workspace of the vault and
lands as one change after whatever happened meanwhile (see [agents.md](agents.md)).

Slow work (planning a chapter, drawing figures, building demos) runs in `jobs.ts`, reporting progress
on the book's event stream, and resumes after a restart.

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
