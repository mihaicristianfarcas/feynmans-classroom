# Security

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**), with what you found, how to reproduce it, and what an
attacker could do with it. You'll get an answer within a week; fixes are released as soon as they're
ready, and you'll be credited unless you'd rather not be.

Only the latest version on `main` is supported.

## How the app is meant to run

Feynman's Classroom is a local app: one person, one machine. Knowing its assumptions helps judge
what counts as a vulnerability.

- **The server has no accounts.** It listens on 127.0.0.1 and answers only requests that name a
  local host (which defeats DNS rebinding) and that don't come from another website (cross-site
  posts are refused). Serving it on a network (`HOST`, `ALLOWED_HOSTS`) gives everyone who can
  reach it full access to your vault and your model subscription: don't, unless you put your own
  authentication in front of it.
- **Books are untrusted.** EPUB and HTML are sanitized when they're added; pictures from books and
  notes are served with a policy that blocks scripts; book text is given to models as material,
  never as instructions.
- **Model output is untrusted.** Figures are declarative specs drawn by the app (no code runs).
  Hand-built demos are code written by Codex in a sandbox and run in a sandboxed iframe with no
  network and no access to the app. Animations are Python a model wrote: they run only in the
  browser, in Pyodide inside a Web Worker of a sandboxed iframe (an opaque origin: no cookies, no
  storage, no reading the app's API, whose changes also refuse requests from it), under a policy
  that lets it fetch only from the app's own read-only mirror of Pyodide and a short list of PyPI
  packages (`/api/manim/…`). The server never runs them itself; its checks run them the same way, in
  headless Chrome.
- **Agents are confined.** Agents that read or change the vault run in the Codex or Claude Code
  OS sandbox: they can read only their folder, write only their working copy (a jj workspace
  outside the vault), never touch `.jj` or `.git`, and have no network. Their changes are checked
  (the app's own files may not change, every file must still parse) before they land, they never
  overwrite edits you made meanwhile, and every run can be undone. `tests/agent-sandbox.test.ts`
  verifies the sandbox.
- **Your data stays yours.** Nothing is sent anywhere except through the model CLI you logged in
  to. (The first animation fetches Pyodide from jsDelivr and ManimGX from PyPI, once, into
  `DATA_DIR/.cache/manimgx`; nothing of yours goes with those requests.)

Reports about any of these boundaries (escaping the sandbox, the iframe or the local-only guard,
script injection through a book or a model's answer, reading files outside the vault) are exactly
what we want to hear about.
