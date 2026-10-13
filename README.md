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
  plain files (a valid Obsidian vault), versioned by Jujutsu (jj), with indexes kept for people and
  agents. See it as a graph built from your links (and the connections an agent suggests, which you
  accept or reject); ask it questions; have an agent reorganise it, in its own copy, with undo.

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

Requirements: Node 22+, the Codex CLI or Claude Code, [Jujutsu](https://www.jj-vcs.dev/) (`brew install
jj`; for the vault's history and the agent's changes), and Chrome or Chromium only for the optional
hand-built demos and the screenshot tests.

## Documentation

| | |
|---|---|
| [The study tools](docs/learning.md) | what each tool does, and the learning research behind it |
| [Reading with a margin](docs/reading.md) | the margin, anchoring passages, notes like Obsidian |
| [Figures](docs/figures.md) | declarative scene specs, the five kinds, hand-built demos |
| [The vault](docs/vault.md) | plain files, indexes for agents, versioning |
| [Models and agents](docs/agents.md) | Codex and Claude Code, the sandbox and the guardrails |
| [Design](docs/design.md) | the look, motion, and accessibility rules |
| [Configuration](docs/configuration.md) | environment variables, running a test copy, limits |
| [Architecture](docs/architecture.md) | how the repository is laid out and how a request flows |

## Accessibility

The app is built to be used with a keyboard alone or a screen reader: every page has a skip link,
headings and landmarks; dialogs, menus and tabs follow the WAI-ARIA patterns; text meets WCAG 2.2 AA
contrast in both themes; and mouse gestures have keyboard equivalents (in the reader, <kbd>S</kbd>
selects the passage at the reading line). `npm run test:a11y` checks every page on every pull request.
If something gets in your way, please [open an accessibility issue](../../issues/new?template=accessibility.yml).

## Contributing

Contributions are welcome, from typo fixes to new figure kinds. [CONTRIBUTING.md](CONTRIBUTING.md)
covers setup, the checks that run before commits and pushes, and how to write a pull request (with
before/after visuals, using the [visual-pr](.agents/skills/visual-pr/SKILL.md) skill). Coding agents
start from [AGENTS.md](AGENTS.md). Please read the [code of conduct](CODE_OF_CONDUCT.md), and report
security problems privately as described in [SECURITY.md](SECURITY.md).

```bash
npm run dev          # API and app, with reload
npm run verify       # formatting, lint, types, unit tests, build: what CI runs
npm run test:e2e     # browser checks of the running app
npm run test:a11y    # accessibility checks of the running app
```

## License

Copyright © 2026 Mihai-Cristian Farcaș. Free software under the
[GNU General Public License, version 3 or later](LICENSE): use it, change it and share it; whatever
you distribute that builds on it is shared under the same terms. The bundled agent skills keep their
own MIT licenses ([.agents/skills](.agents/skills/README.md)).
