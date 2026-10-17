# Your vault: plain files, indexed for agents, versioned with Jujutsu

```
data/vault/
  AGENTS.md                 the layout and rules, for AI agents (CLAUDE.md imports it)
  INDEX.md                  generated: counts, recent changes, where to look
  profile.md                who you are and how you learn
  notes/                    empty: your notes are in your vaults (below); anything left here moves
                            into a vault kept in the app when the server starts
  concepts/<Name>.md        one page per concept (concepts/INDEX.md: with mastery)
  cards/*.md                flashcards (## Front / ## Back)
  figures/*.md              kept figures (the spec in a ```figure block)
  attachments/              pictures
  library/INDEX.md          generated: every book
  library/<book>/           book.json · the file · text/NN-chapter.md (with [[page N]] markers)
                            annotations/*.md · sessions/*.md (the tutor) · demos/
                            README.md (generated: chapters, annotations)
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
are not (`.gitignore` keeps a managed block).

## One kind of record: the document

Notes, concepts, flashcards, annotations, sessions with the tutor and kept figures are all
**documents**: a Markdown file with the same frontmatter (`id`, `kind`, `type`, `title`, `tags`,
`aliases`, `about`, `related`, `concepts`, `source`, `created`, `updated`), plus a few fields of the
kind's own (a concept's `summary`, a card's `deck`, an annotation's `request`…). The vault's
`AGENTS.md` lists them all. Because they share one shape, they share everything built on it:
links and backlinks, renames that carry links along, search, the generated indexes, version history,
and one API (`/api/docs`) to list, read, make, change and delete them. What a kind does beyond that
(an annotation's answer, a card's review, a concept's page) has its own service and routes, and the
pages show each kind their own way.

`kind` says what a document is (left out, the folder says: a file in `cards/` is a card), and `type`
what sort of it (a note's summary or quiz, an annotation's highlight or explanation, a cloze card).
`source` is where it comes from in a book: the book's id, the chapter, a page or block, and for a
passage the quote and the ways to find it again. A card's file never changes when you review it: its
schedule is replayed from `log/reviews.jsonl`.

## Notes, folders, and what they're about

Notes live in your vaults (below), in any folders you like (by subject, by book, by topic), and
folders can be made, renamed, moved (links to the notes in them follow) and deleted (to the vault's
`.trash/`) from the file tree, by you or by the agent. A note says what it's **about** in its properties: links to books,
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
a `main` bookmark on the latest change). The app runs jj with its own config (`DATA_DIR/jj.toml`), so
yours doesn't matter.

- **Nothing to stage.** jj treats the working copy as a change and snapshots it whenever it runs.
  As you work, the app names the change in progress after what happened in it ("3× note, card");
  when you stop for a few minutes (`VAULT_SITTING_MS`), or before the agent's work comes in, it
  closes it and begins the next. The history reads one entry per sitting, and every snapshot in
  between stays in jj's operation log (`jj op log`, `jj evolog`).
- **Versions of a document.** The clock button on a note lists its saved versions (`jj log` on the
  file; every kind has them, through `/api/docs/<id>/versions`): read one as it was, see what it changed, and bring it back (as a new change, so nothing is
  lost).
- **The agent's work** is one change per request, made in a workspace of its own and brought in
  after your edits (see [agents.md](agents.md)); Undo takes it out again.
- **From the command line**: `jj log`, `jj diff -r <change>`, `jj undo` and `jj op log` all work in
  the vault (stop the app first if you rewrite history yourself).

## Your vaults (kept in the app, or Obsidian, or any folder of Markdown)

Every note is in a vault, and the **Notes** page holds them all. A vault is either **kept in the app**
(its files only in `DATA_DIR/vaults/<id>/`, nowhere else on your computer) or a folder of Markdown
from your computer: an Obsidian vault or any notes folder. There's always one: a new app starts with
an empty vault kept in the app, "Notes", and notes from before (when the app's own `notes/` showed as
a vault called Classroom) move into it once, folders, attachments and all. Switch between vaults at
the top of the file list, or with the active-vault picker beside the brand in the top bar: it picks
the vault the Notes page opens, the Brain draws and the reader writes into. Make as many as you like:
the + beside the vault's name, then a name and **Make vault**, or **Choose folder…**, which opens
Finder, File Explorer or your desktop's folder window. The server needn't be on your computer: the
browser reads the folder and keeps the server's copy (`DATA_DIR/vaults/<id>/`) in step with it.
The list is kept in `DATA_DIR/vaults.json`. Removing a folder's vault from the app (its ⋯ menu)
deletes the server's copy and leaves your folder as it is; deleting a vault kept in the app puts its
files aside in `DATA_DIR/vaults/.removed/`, its only copy. Removing the last vault makes a fresh,
empty "Notes". Vaults are never put in jj (their history is kept apart, below).

- **Chrome, Edge, Brave, Opera** keep the folder in sync both ways while the app is open: changes
  in the folder (Obsidian, a sync service) reach the app within a few seconds, and edits made in the
  app are written to the folder. After the browser restarts it asks once to allow the folder again.
- **Firefox, Safari** can read a folder only when it's chosen: choosing it again brings in what
  changed, and edits made in the app stay in the app's copy.
- If a file changed on both sides between syncs, the folder's version wins and the app's is kept
  beside it as "name (app copy)". A browser that hasn't chosen a vault's folder shows the server's
  copy and offers to choose it.

The server can also open a folder on its own disk where it is, without a copy (`POST /api/vaults`
with its `path`); the rest of this section holds for both.

- **Read and edit as in Obsidian.** Read a note (its properties as a table, callouts, math, embeds,
  task boxes that tick) or edit the file itself, properties included. [[Wiki links]], [text](path.md)
  links and links in properties all resolve as Obsidian resolves them (by name, then path, then
  alias); a link to nothing yet is marked, and opening it makes the note. `![[note]]`,
  `![[note#Heading]]` and `![[note#^block]]` embed a note or a part of it; pictures (`|300` sets the
  width), PDFs (`#page=3`), sound and video embed too.
- **Attachments.** A picture, PDF, sound or video pasted or dropped into a note is saved where
  Obsidian's settings put attachments (`.obsidian/app.json`), and the embed is written as Obsidian
  would (a Markdown link if you chose those). New notes go where its settings say, too.
- **Links follow renames.** Renaming or moving a note, a file or a folder (the name above the note,
  or a row's menu in the tree) rewrites every link to it. Deleting moves things to the vault's
  `.trash/`, as Obsidian does.
- **Connections.** Beside a note: what links here, where it's mentioned without a link (Link turns
  the mention into one), what it links to, its tags and its outline. Search finds text, and `#tag`
  finds tags (nested ones too); the graph shows every note and its links.

**Keeping in step with Obsidian is automatic.** The server watches each vault's folder (for a
synced vault, its copy): a note you
change, add, rename or delete in Obsidian (or sync from another device) is read again within a
moment, and every open page shows the change. Every `VAULTS_POLL_MS` (a minute) it also compares
each folder with what it knows, in case the system missed an event, and when the app starts it
rescans everything changed while it was closed. Edits made here are written straight to the file,
so Obsidian sees them at once. If a note changes on disk while you're typing in it here, the app
asks whether to show the new text or keep yours, and never overwrites either without asking.

**The rest of the app works in them too.** What a note of the app's own vault has, a vault's notes
have, kept where Obsidian won't trip over it (`DATA_DIR/vault-meta/<id>/`), never in your folder:

- **Versions.** Every Markdown file's history is kept in a git repository of its own
  (`vault-meta/<id>/history.git`, with your folder as its work tree, so your folder gets no `.git`).
  A snapshot is taken when the vault opens, a few minutes after a run of edits (in the app or in
  Obsidian) and before anything the app changes for you. **History** above a note shows its versions
  and brings one back (the text it had stays in the history).
- **Suggested connections.** Beside a note, **Suggest** has a model read the vault (read-only) and
  propose links worth following, each with a reason; accepting one adds it to the note's `related`
  property. Decisions are kept in `vault-meta/<id>/connections.jsonl`, so nothing turned down comes
  back. With the "auto" setting they're added at once.
- **The agent (⌘J)** knows which vault and note you have open. Asked from a vault, it works on a
  copy of that vault's notes (a git worktree in `DATA_DIR/agent-runs/<id>`, your pictures and PDFs
  readable beside it), and its change lands in your folder as one commit after whatever you did
  meanwhile, only if it applies cleanly; **Undo** takes it out the same way, and **Keep** saves an
  answer as a note in that vault.
- **Links to the app.** A [[link]] (or a property such as `about`) that names nothing in the vault
  but names one of the app's concepts, books or notes leads there. Those notes are listed on the
  concept's page and drawn in the Brain's graph (the app's books and concepts, with the active vault's
  notes), and `[[` completes to the app's concepts and books.
- **Reading.** The reader's Note tab can write in a vault note (or make one, its `source` property
  linking the book): passages and captured pictures land at its end, quoted under
  `[[Book title#page=12|Book title, p. 12]]`, and the vault notes that link to a book are listed with
  its notes. The book's own note ("<Book title> — notes") is made in the active vault, and so are a
  tutor session's note, a connection saved as a note and a scored explanation (Explain it back),
  linking the book in `source` and their concepts in `about`. An explanation's grade is kept in
  `log/activity.jsonl`, where it counts toward the concept's mastery.
- **Quizzes and search.** A quiz in a vault note adds each attempt under it, and ⌘K finds vault
  notes along with everything else.
