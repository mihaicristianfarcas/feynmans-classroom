# Your vault: plain files, indexed for agents, versioned with Jujutsu

```
data/vault/
  AGENTS.md                 the layout and rules, for AI agents (CLAUDE.md imports it)
  INDEX.md                  generated: counts, recent changes, where to look
  profile.md                who you are and how you learn
  notes/**.md               your notes (notes/INDEX.md: generated table of them)
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
- **An agent's work** is one change per run, made in a workspace of its own and brought in after
  your edits (see [agents.md](agents.md)); Undo takes it out again.
- **From the command line**: `jj log`, `jj diff -r <change>`, `jj undo` and `jj op log` all work in
  the vault (stop the app first if you rewrite history yourself).
