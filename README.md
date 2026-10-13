# Feynman's Classroom

Read a book beside small, animated demos of its ideas.

Upload a PDF, EPUB, Markdown or text book. The book opens on the right. Each chapter can be
"visualized": **Codex** reads the chapter, picks the ideas worth seeing move, and builds a simple
interactive demo for each one, anchored to the passage it explains. As you scroll, the reading line
(▸) passes the anchors (◆) in the margin and the matching demo plays on the left, the way a lecture
demonstration sits beside the text.

Everything runs locally and generation uses **your Codex subscription** (`codex exec` with your
ChatGPT login). No API key is needed.

## Quick start

```bash
npm install                 # also bundles the demo kit (runtime/dist/kit.js)
codex login                 # once, with your ChatGPT account (check: codex login status)
npm run dev                 # API on :8787, app on http://localhost:5173
```

Open http://localhost:5173, drop a book on the page, scroll to a chapter and press
**Visualize this chapter**. Planning takes about a minute; each demo takes roughly five minutes, two
at a time, and appears in the margin as soon as it passes its checks. You can also select any passage
and choose **◆ Visualize this**, or ask Codex to rebuild a demo with your notes (**Improve**).

PDFs without bookmarks get chapters from their headings; if those look wrong, **Find chapters with
Codex** (top bar) has Codex read every page's headings and rebuild the chapter list.

Production: `npm run build && npm start` serves the built app and the API from one port (8787).

### Requirements

- Node 20+ (developed on 26)
- [Codex CLI](https://github.com/openai/codex), logged in with ChatGPT
- Chrome or Chromium for the browser check (auto-detected, including Playwright's and Puppeteer's
  downloads; or set `CHROME_PATH`). Without it, demos are gated by the Node check alone.

## How it works

```
upload ─▶ ingest ──────────────▶ reader (Lector PDF view / HTML view) ◀── anchors (page + y, or block)
           │ pdf-inspector: per-page Markdown + positioned lines
           │ pdf.js: outline, page sizes        (EPUB: spine + nav → sanitized blocks)
           ▼
 "Visualize this chapter"
           │
           ▼
 1. plan   codex exec (read-only, --output-schema): chapter text → 2–5 briefs
           (idea, picture, motion, controls, readouts, the truth to obey, an exact anchor quote,
           an optional predict-first question)
           │  quote → exact/fuzzy match → (page, y) in the book
           ▼
 2. build  codex exec (workspace-write sandbox, no network) in a per-demo workspace:
           AGENTS.md, BRIEF.md, EXCERPT.md, RUNTIME.md, STYLE.md, examples/, runtime/, check.mjs
           Codex writes demo.js and runs `node check.mjs` (simulated browser) until it passes
           │
           ▼
 3. check  the server reruns the Node check, then renders the demo in real Chrome
           (errors, frames, label overlaps, size), screenshots light + dark
           │ failures ─▶ `codex exec resume` with the errors and screenshots (fix rounds)
           │ success  ─▶ one critique round: Codex reviews its own screenshots and polishes
           ▼
 4. ready  demo.js is published; the reader gets it over server-sent events
```

Codex can't launch Chrome inside its macOS sandbox, so the browser check runs in the server, outside
the sandbox, and its findings go back into the same Codex thread. The last version that passed every
check is the one that ships. Transient Codex errors ("model at capacity", rate limits) are retried
with backoff; a demo that still fails says why and offers **Try again**.

Codex was also used to test the platform itself: two read-only review passes over this codebase
(findings: a crash when deleting a demo mid-build, stale live state after reconnects, unbounded EPUB
inflation, chapter edges on shared pages, and more), all fixed and covered by tests.

### The demo runtime

A demo is one plain script calling `Classroom.demo({...})`: a title, hint, 1–3 controls, live
stats, an optional predict-first question, and `setup(ctx)` that draws with `ctx.d2` (2D helpers)
and returns a frame function. The runtime (`runtime/classroom.js`) draws the card, the controls and
the stats, runs one calm loop (paused offscreen), handles Restart, Back to text values, themes and
reduced motion. See `server/generate/workspace/RUNTIME.md` (what Codex reads) and the two reference
demos in `runtime/examples/`.

Demos run in a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin) with a CSP that blocks
all network access, and talk to the app only through `postMessage`.

### Look and feel

The finish comes from the **anatomy** skill (vendored in `vendor/anatomy/`, synced by
`npm run sync:kit`): monochrome tones that switch with the theme, thin precise lines, one lit
accent, the Fig/title/hint/readout card, calm eased motion, live readouts from the same model that
moves the picture. The demos themselves stay simple and intuitive (plain 2D side views, plots,
diagrams), in the spirit of the reference video. The anatomy isometric kit is still available to a
demo as `ctx.k`/`ctx.G`/`ctx.T` for genuinely 3D subjects.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | API (and production app) port |
| `DATA_DIR` | `./data` | books, extracted text, demos, Codex logs |
| `CODEX_BIN` | `codex` | Codex CLI binary |
| `CODEX_MODEL` | from `~/.codex/config.toml` | model override |
| `CODEX_PLAN_EFFORT` | `medium` | reasoning effort for planning |
| `CODEX_BUILD_EFFORT` | from config | reasoning effort for building |
| `CODEX_CONCURRENCY` | `2` | parallel demo builds |
| `CODEX_FIX_ROUNDS` | `2` | resumes after a failed check |
| `CODEX_CRITIQUE_ROUNDS` | `1` | screenshot review rounds after a pass |
| `CODEX_TIMEOUT_MS` | `1200000` | hard stop per Codex turn |
| `DEMOS_MIN` / `DEMOS_MAX` | `2` / `5` | demos per chapter when no count is given |
| `CHROME_PATH` | auto | Chrome for the browser check |

## Layout

```
server/            Hono API: ingest, anchors, jobs, SSE, Codex runner, browser check
  generate/        planner, build loop, and the workspace template Codex works in
runtime/           demo runtime (classroom.js, draw2d.js, css), page builder, reference demos
vendor/anatomy/    the anatomy skill: kit, references, examples (MIT)
web/               React app: library, reader (Lector for PDFs), demo panel
tests/             vitest unit tests, UI screenshot and click-through scripts
data/              your books and demos (git-ignored)
```

## Tests

```bash
npm test                                   # 29 unit tests: anchors, ingest, EPUB limits, the demo check, Codex args
npm run test:e2e                           # 10 browser checks of the running reader (add --generate to run Codex)
npm run typecheck
npx tsx tests/ui-shots.ts out.png "#/book/<id>?at=21.5" --theme dark   # screenshot the running app
npx tsx tests/click-generate.ts <bookId> <at> 3                         # click "Visualize this chapter"
```

## Limits

- Scanned PDFs need OCR first (text-based PDFs only; pdf-inspector reports scanned pages).
- Anchors come from quotes the planner copies from the text; when a quote can't be found the demo
  is placed at the start of its page and marked "approximate".
- Generation speed and cost follow your Codex plan's limits.
