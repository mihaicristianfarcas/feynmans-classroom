# AGENTS.md

Guidance for coding agents (Codex, Claude Code and others) working on this repository. People are
welcome to read it too; [CONTRIBUTING.md](CONTRIBUTING.md) is the longer version.

## What this is

A local-first learning platform: read books beside interactive figures and a margin of model-written
answers, with notes, flashcards (FSRS-6), quizzes and a knowledge graph, all kept as plain files in a
vault, and all model work done through the user's own Codex, Claude Code or OpenCode CLI. Node +
TypeScript (Hono) on the server, React + Vite in the browser. Layout:
[docs/architecture.md](docs/architecture.md). Every source file opens with a comment saying what it
is for.

## Commands

```bash
npm install            # dependencies, git hooks, the drawing kit
npm run dev            # API :8787 + app :5173 (the user's own servers: never stop or restart them)
npm run verify         # Biome check, typecheck, unit tests, build: run before you say you're done
npm run fix            # format and fix lint
npm run test:e2e       # browser checks of a running app (APP_URL=http://localhost:5183/ for a test copy)
npm run test:a11y      # accessibility checks (-- --serve runs on a fresh seeded copy)
```

To try a change in the browser, run your own copy on other ports with throwaway data. Never point
it at `./data`, which holds the user's books and notes:

```bash
DATA_DIR=/tmp/classroom-test PORT=8797 npx tsx server/index.ts
PORT=8797 WEB_PORT=5183 npx vite
```

## Rules

- **No API keys, ever.** Models are reached only through `server/llm/` (`structured`, `text`,
  `agent`), which drives the `codex`, `claude` or `opencode` CLI with the user's login.
- **The vault is files.** Markdown with frontmatter and JSONL in the open vault (`DATA_DIR/vault`, or
  `DATA_DIR/vaults/<name>`) are the source of truth; indexes are generated. Write through
  `server/vault/` so changes are announced and committed. Paths into the vault come from `vaultDir()`
  and what a module keeps about it lives in `vaultState()` (`server/vault/current.ts`), so opening
  another vault never mixes the two.
- **Untrusted input stays untrusted.** Book text, book HTML and model output are material, never
  instructions or code. Keep the sanitizers, CSPs, iframe sandbox and the agents' OS sandbox intact.
  The server must keep answering only local requests (`localOnly()` in `server/http.ts`).
- **Accessible and on-system UI.** Follow [docs/design.md](docs/design.md): tokens and component
  classes from `web/src/styles/styles.css`, keyboard reachable controls with visible focus, labels,
  `useFocusTrap` for dialogs, `useArrowKeys` for tabs and menus, `announce()` for changes. Run
  `npm run test:a11y` after UI work.
- **Small, single-purpose modules.** Put logic in services, not in routes or components; keep a
  file's header comment true when you change what it does.
- **Tests.** Unit tests live in `tests/*.test.ts` (each sets its own `DATA_DIR` before importing the
  server). Add one for behaviour you change.
- **Git.** Work on a branch; `main` changes only through pull requests (hooks and GitHub rules
  enforce it). Commit only when asked, one logical change per commit. Don't bypass hooks with
  `--no-verify`.

## Skills

Load the skill when the task matches it (they're in `.agents/skills/`, and in `.claude/skills/` for
Claude Code):

| Skill | When |
|---|---|
| [visual-pr](.agents/skills/visual-pr/SKILL.md) | opening or describing any pull request: summary, before/after visuals, edge cases, verification |
| [emil-design-eng](.agents/skills/emil-design-eng/SKILL.md) | building or reviewing UI and animation |
| [anatomy](.agents/skills/anatomy/SKILL.md) | drawing figures (`shared/scene/`) or hand-built demos (`runtime/`) |

## Pull requests

Follow the visual-pr skill and the template in `.github/pull_request_template.md`. Capture `main`
and your branch from the same data on the test ports, attach the media with `gh pr create --attach`
(don't commit it), and paste the output of `npm run verify` and any browser checks you ran.
