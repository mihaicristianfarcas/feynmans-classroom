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
