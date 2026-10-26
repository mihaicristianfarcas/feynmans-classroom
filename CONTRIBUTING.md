# Contributing

Thanks for helping. This page covers setting up, the checks your change has to pass, and how to
open a pull request. For how the code is organised, read [docs/architecture.md](docs/architecture.md).

## Setting up

You need Node 22 or newer (`.nvmrc` has the version CI uses), git, [Jujutsu](https://www.jj-vcs.dev/)
(`brew install jj`: the vault's history, Undo and the agent's changes go through it, so the server
and the tests won't run without it), and, to use the model features, the Codex CLI (`codex login`),
Claude Code (run `claude` once) or OpenCode 2 (`opencode auth login`, or its free models). Chrome or
Chromium is only needed for hand-built demos and the browser tests. Or skip all of that and use the
development container, which needs only Docker: see [docs/docker.md](docs/docker.md).

```bash
git clone <your fork> && cd feynmans-classroom
npm install          # also installs the git hooks and bundles the drawing kit
npm run dev          # API on :8787, app on http://localhost:5173
```

Your books and notes live in `./data` (ignored by git). To try a change without touching them,
run a second copy on other ports with its own data:

```bash
DATA_DIR=/tmp/classroom-test PORT=8797 npx tsx server/index.ts
PORT=8797 WEB_PORT=5183 npx vite          # then open http://localhost:5183
```

## The checks

| Command | What it checks |
|---|---|
| `npm run check` | formatting and lint (Biome); `npm run fix` fixes most of it |
| `npm run typecheck` | TypeScript, strict |
| `npm test` | unit tests (vitest, about a second) |
| `npm run verify` | all of the above plus the production build: what CI runs |
| `npm run test:e2e` | browser checks of a running app with a book that has figures (`APP_URL` to point it elsewhere) |
| `npm run test:a11y` | axe-core and keyboard checks of every page; `-- --serve` runs it on a fresh, seeded copy (what CI runs) |

Git hooks (installed by `npm install`, via husky) run the quick ones for you:

- **pre-commit**: no commits on `main`; staged files formatted and linted; types check.
- **commit-msg**: a subject line of at most 72 characters, a blank line before the body.
- **pre-push**: no pushing to `main`; the unit tests pass.

`main` only changes through pull requests that pass CI, and only a maintainer merges them, with
rebase and merge so every commit is kept. The hooks catch it early on your machine; the repository's
rules on GitHub enforce it for everyone.

## Making a change

1. Branch from `main`: `git switch -c short-description`.
2. Keep each commit one logical change, with a subject that says what it does in plain words
   ("Let the reader select a passage from the keyboard").
3. Match the code around you: what each file is for is in the comment at its top; a function gets a
   short `/** … */` when its name doesn't say everything; comments explain why, not what.
4. Add or update tests for behaviour you change. A bug fix starts with a test that fails.
5. Update the docs (README, `docs/`, AGENTS.md) when behaviour, commands or configuration change.

Some ground rules the project depends on:

- **No API keys.** Model work goes through `server/llm/` (the learner's Codex, Claude Code or OpenCode login).
- **The vault is plain files.** Markdown with frontmatter and JSONL are the only source of truth;
  anything else is a generated, disposable index.
- **Book content is untrusted.** Sanitize it, sandbox it, and never treat it as instructions.
- **Accessible by default.** New UI meets the rules in [docs/design.md](docs/design.md#accessibility):
  keyboard reachable, visible focus, labelled controls, AA contrast, announced changes.
- **One design system.** Use its tokens and classes; motion follows [docs/design.md](docs/design.md).

## Pull requests

Write the description with the [visual-pr](.agents/skills/visual-pr/SKILL.md) skill (the template
lays out its shape): a short summary a user would understand, then evidence you made for this
change, then the details.

- **Show it.** For UI changes, before/after screenshots of `main` and your branch from the same data,
  in both themes when colours change, and a GIF or frame strip for motion. For backend changes, a
  table, diagram or output diff.
- **Capture recipe.** Run `main` and your branch side by side on the test ports above (two
  worktrees, two `DATA_DIR` copies). `npx tsx tests/browser/ui-shots.ts <out.png> '#/library'
  --theme dark` screenshots a page; the visual-pr scripts compose before/after panels and GIFs.
- **Attach media, don't commit it**: `gh pr create --attach ./before.png --attach ./after.png`.
- **Edge cases**: say how you checked keyboard use, a screen reader's names, dark mode, reduced
  motion and a narrow window.
- **Verification**: paste what `npm run verify` (and the browser checks you ran) printed.

Agents follow the same process; [AGENTS.md](AGENTS.md) has the short version.

## Reporting bugs and ideas

Use the issue templates: bug, idea, or accessibility problem. Security problems go privately, as
described in [SECURITY.md](SECURITY.md). By taking part you agree to the
[code of conduct](CODE_OF_CONDUCT.md).

## License

The project is licensed under the [GPL, version 3 or later](LICENSE). By contributing, you agree
that your contributions are licensed the same way.
