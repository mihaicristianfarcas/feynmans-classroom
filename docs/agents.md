# Models and agents

## Your subscription

Everything model-driven goes through one door (`server/llm/index.ts`): `structured()` for JSON matching a
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
| write the live vault, anything else, `.jj` or `.git` | no |
| look around your home folder | no |
| reach the network | no |

- **Ask** (and connection suggestions) run read-only, directly in the vault.
- **Do** (Ask → Do) gives an agent work: "turn my chapter 5 highlights into a summary note". It works
  in a **jj workspace of the vault** (`DATA_DIR/agent-runs/<id>`, outside the
  vault), starting from the latest saved change, with the books' text and the indexes linked in
  read-only, so it never edits a note you have open. When it's done, what it wrote becomes one jj
  change, checked: app-owned files (logs, profile, `book.json`, `AGENTS.md`…) must be untouched (or
  the run fails and nothing lands), and every file must still parse (or it waits for your OK, with
  the diff). Everything else lands at once: every run can be undone.
- **Landing.** The change is moved onto everything you did meanwhile without touching your files,
  checked for conflicts, and only then do the files follow. If it clashes with something you
  changed meanwhile, it doesn't land at all ("ask again and it starts from your latest version"), so
  conflict markers never reach a note. Several agents can work at once (up to four).
- **Undo** takes the change out of the history (jj's `abandon`, with what came after it moved onto
  its parent). It's tried first without touching your files and refused, untouched, if you've since
  changed the same lines. A change already pushed somewhere gets its reverse added instead.
- Every run is recorded in `log/agents.jsonl` (the task, the model, the files, the jj change).
- Without jj an agent can still read your vault and answer, but not change it.
- Book text is material, never instructions, in every prompt; a passage that tries to give orders
  can't get past the sandbox and the checks anyway.
