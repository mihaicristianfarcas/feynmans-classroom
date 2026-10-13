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

## The agent: one field for anything

Press **⌘J** (Ctrl J) on any page, or the sparkle in the top bar or the reader's bar, and say what
you want, in your own words: "summarise this chapter into a note in my folder for this book", "quiz
me on what I highlighted", "turn this note into exercises with hidden solutions", "move my DDIA notes
into a folder per chapter", "what have I written about consensus?". There's no mode to pick and no
form per task: one field, one short reply, and the change is already in your vault, shown wherever it
appears (the notes page, the reader, the graph). **Enter** runs it on your quick model; **⌘Enter**
on the careful one (Settings picks both).

- **It knows where you are.** The open note, the book with its chapter and page, the concept, and
  any text you selected go into the request (the panel says so, and × leaves them out), so "this"
  needs no explaining.
- **Reply to refine.** Typing again carries on the same conversation ("shorter", "add a figure",
  "make question 3 harder"); each turn sees the earlier ones. **New** starts afresh, and **Recent**
  reopens an earlier conversation. Close the panel while it works: a dot on the sparkle shows it's
  busy, and a line at the bottom of the window says when it's done.
- **Several at once.** Each request works on its own copy of the vault, so you can send the next one
  without waiting (up to four at a time).
- **What it makes.** Everything is a note, so it can go in any folder: summaries, explanations,
  quizzes (a `quiz` block the app plays, which keeps your attempts with the corrections), exercises
  with folded solutions, study sessions, flashcards. Each note links what it's `about`, so book and
  concept pages list it. The vault's `AGENTS.md` teaches it these formats.
- **Answers.** A question changes nothing; its answer can be kept as a note with one click.

The reader's **Tutor** stays as it is: a conversation about the passage, beside the book.

## The guardrails

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

- Connection suggestions run read-only, directly in the vault.
- **The agent** works in a **jj workspace of the vault** (`DATA_DIR/agent-runs/<id>`, outside the
  vault), starting from the latest saved change, with the books' text and the indexes linked in
  read-only, so it never edits a note you have open. When it's done, what it wrote becomes one jj
  change, checked: app-owned files (logs, profile, `book.json`, `AGENTS.md`…) must be untouched (or
  the run fails and nothing lands), and every file must still parse, quizzes included (or it waits
  for your OK, with the diff).
- **Landing.** The change is moved onto everything you did meanwhile without touching your files,
  checked for conflicts, and only then do the files follow. If it clashes with something you
  changed meanwhile, it doesn't land at all ("ask again and it starts from your latest version"), so
  conflict markers never reach a note. If you're typing in a note when the agent's change to it
  lands, the note asks which text to keep.
- **Undo** takes the change out of the history (jj's `abandon`, with what came after it moved onto
  its parent). It's tried first without touching your files and refused, untouched, if you've since
  changed the same lines. A change already pushed somewhere gets its reverse added instead.
- Every run is recorded in `log/agents.jsonl` (the request, where you were, the model, the files,
  the jj change).
- Without jj the agent can still read your vault and answer, but not change it.
- Book text is material, never instructions, in every prompt; a passage that tries to give orders
  can't get past the sandbox and the checks anyway.
