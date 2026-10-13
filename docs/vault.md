# Your vault: plain files, indexed for agents, versioned with Jujutsu

```
data/vault/
  AGENTS.md                 the layout and rules, for AI agents (CLAUDE.md imports it)
  INDEX.md                  generated: counts, recent changes, where to look
  profile.md                who you are and how you learn
  notes/**.md               your notes, in any folders (notes/INDEX.md: generated table of them)
  concepts/<Name>.md        one page per concept (concepts/INDEX.md: with mastery)
  cards/*.md                flashcards (## Front / ## Back)
  figures/*.json            saved figures
  attachments/              pictures
  library/INDEX.md          generated: every book
  library/<book>/           book.json · the file · text/NN-chapter.md (with [[page N]] markers)
                            annotations/*.md · demos/ · README.md (generated: chapters, annotations)
  brain/links.tsv           generated: every link (backlinks are one rg away)
  brain/connections.jsonl   suggested connections and your decisions
  log/*.jsonl               reviews, the journey, agent runs
```

**Files, not a database.** Markdown with frontmatter (and JSONL for logs) is the only source of truth:
you, Obsidian, jj, git and any agent with `rg`, `sed` or `cat` can read and change it, and there's no
second copy to keep in sync. The bookkeeping a database would do is kept as **generated files**,
rewritten a moment after any change: the vault map, the library, each book's chapters and
annotations, the note and concept tables, every link. An agent reads a 2 KB index instead of opening
a hundred files, which is where the savings in tokens and calls come from. At this scale an index in
memory builds in a second and ripgrep searches a library in milliseconds; if search ever gets slow,
a SQLite full-text index can sit in `.cache/` as a disposable copy rebuilt from the files. Books,
annotations, notes and logs are versioned; the PDFs, the extracted text and the generated indexes
are not (`.gitignore` keeps a managed block). Vaults and books from earlier versions are migrated at
startup.

## Notes, folders, and what they're about

Notes go in any folders you like under `notes/` (by subject, by book, by topic) and folders can be
made, renamed, moved (links to the notes in them follow) and deleted (to `.trash/`) from the file
tree, by you or by the agent. A note says what it's **about** in its properties: links to books,
concepts or other notes (`about: ["[[Calculus Made Easy]]", "[[Derivative]]"]`). A book's notes
(in the reader) and a concept's page list the notes about them.

Notes can hold more than prose:

- a fenced `quiz` block (YAML: questions with `choices` and the right `answer`, or open questions
  with a model answer; `shared/quiz.ts` has the format) is played right in the note, and each
  attempt can be added under it as a folded `> [!attempt]-` callout with the corrections;
- a folded callout, `> [!solution]-`, opens with a click: exercises keep their answers hidden;
- `type` says what a note is (summary, explanation, quiz, exercises, session…).

## History, with Jujutsu

The vault is a [Jujutsu](https://www.jj-vcs.dev/) (jj) repository, colocated with git: `.jj/` and
`.git/` sit side by side, so `git log`, Obsidian Git or a GitHub remote keep working (the app keeps
a `main` bookmark on the latest change). A vault that git kept before is adopted with its history.
The app runs jj with its own config (`DATA_DIR/jj.toml`), so yours doesn't matter.

- **Nothing to stage.** jj treats the working copy as a change and snapshots it whenever it runs.
  As you work, the app names the change in progress after what happened in it ("3× note, card");
  when you stop for a few minutes (`VAULT_SITTING_MS`), or before the agent's work comes in, it
  closes it and begins the next. The history reads one entry per sitting, and every snapshot in
  between stays in jj's operation log (`jj op log`, `jj evolog`).
- **Versions of a note.** The clock button on a note lists its saved versions (`jj log` on the
  file): read one as it was, see what it changed, and bring it back (as a new change, so nothing is
  lost).
- **The agent's work** is one change per request, made in a workspace of its own and brought in
  after your edits (see [agents.md](agents.md)); Undo takes it out again.
- **From the command line**: `jj log`, `jj diff -r <change>`, `jj undo` and `jj op log` all work in
  the vault (stop the app first if you rewrite history yourself).
