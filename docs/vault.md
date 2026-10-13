# Your vault: plain files, indexed for agents, versioned

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
you, Obsidian, git and any agent with `rg`, `sed` or `cat` can read and change it, and there's no
second copy to keep in sync. The bookkeeping a database would do is kept as **generated files**,
rewritten a moment after any change: the vault map, the library, each book's chapters and
annotations, the note and concept tables, every link. An agent reads a 2 KB index instead of opening
a hundred files, which is where the savings in tokens and calls come from. At this scale an index in
memory builds in a second and ripgrep searches a library in milliseconds; if search ever gets slow,
a SQLite full-text index can sit in `.cache/` as a disposable copy rebuilt from the files. Books,
annotations, notes and logs are versioned; the PDFs, the extracted text and the generated indexes
are not (`.gitignore` keeps a managed block). Vaults and books from earlier versions are migrated at
startup.
