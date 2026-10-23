# Reading with a margin, and notes

## The margin

The reader puts the book on the right and a **margin** on the left, as in the nutlope reading demo:
select text and a dark menu offers **Highlight · Explain · Visualize · Ask · Define · + Note** (and,
under ⋯, the passage or a reference to your note, resources, flashcards, teach it back, connect it to
today, the tutor). Keys work too: <kbd>H</kbd> <kbd>E</kbd> <kbd>V</kbd> <kbd>A</kbd> <kbd>D</kbd>
<kbd>N</kbd>. Each answer becomes a card at the height of its passage, which is underlined in the
page. Cards are always shown whole (no folding, nothing scrolls inside a card) and never overlap:
cards whose passages overlap (or share a paragraph of an EPUB) sit **side by side** in one row
(wrapping onto another line when the panel is too narrow for them all), and rows make room for
each other, as comments do in a shared document: the cards for the passage at the reading line sit
right beside it (the ones before slide up out of the way as you read on), and a card you click (or
whose marked passage you click) lines up exactly with its passage while that passage is on screen.
Scrolling over the margin scrolls the book; the cards follow their passages. On a narrow screen,
where the margin sits under the book, it lists the cards for what's on screen, in order. A follow-up question on a card reads as a **conversation**, drawn like the
tutor's: your question on the right, the answer under it, the field to ask the next one below.
<kbd>C</kbd> captures a region of the page (a figure, a formula, a table) as a picture for your
note, with a transcription if you want one (LaTeX for formulas).

The book itself: **find** anything in it with <kbd>⌘F</kbd> or <kbd>/</kbd> (every page, not just
those on screen; case, accents, ligatures and words hyphenated across lines don't get in the way;
<kbd>Enter</kbd> and <kbd>Shift</kbd>+<kbd>Enter</kbd> step through; below the field, every place it
occurs is listed by chapter, with its page and the words around it, to go straight to the one you
want), **zoom** with <kbd>+</kbd> <kbd>−</kbd> (<kbd>0</kbd> or the percentage fits it to the pane
again; the reading line stays on the same words, and each book remembers its zoom), type a **page**
number in the top bar to go there or open the **pages** as a strip of thumbnails (<kbd>P</kbd>), and
follow the PDF's own **links** (its contents, cross-references,
footnotes; links to the web open in a new tab). The PDF view is [Lector](https://github.com/anaralabs/lector)
(pdf.js for React).

The panes beside the book: **Figures** is an index of every figure and animation made in the
section you're in, its chapter or the whole book (a still of each, its number and caption; choose
one to go to its passage, or open it large to redraw it, keep it, make cards from it or delete it).
**Tutor** keeps every conversation as a session of the book (below).

Every card is a Markdown file beside the book, `library/<book>/annotations/p152-explain-….md`, a
document like every other in the vault (see [vault.md](vault.md)): `kind: annotation`, what was asked
for as its `type`, and the passage as its `source`:

```markdown
---
id: a8c1f0e2
kind: annotation
type: explain                     # highlight · comment · explain · define · ask · resources · visualize
source:
  book: b15c347ba44               # the book's id (its book.json)
  chapter: c5
  page: 152
  quote: Replication means keeping a copy of the same data on multiple machines
  prefix: "…in this chapter we discuss "
  suffix: " that are connected via a network"
  start: 1834                     # character offsets in the page's text
  end: 1906
  rects:                          # the selection's boxes, as fractions of the page
    - [0.118, 0.431, 0.762, 0.018]
  md: { file: library/designing-data-intensive-applications/text/05-replication.md, line: 41 }
request: what does "copy" mean here, physically?
model: { provider: codex, name: gpt-6-luna, ms: 8421 }
created: 2026-10-13T07:42:10.000Z
updated: 2026-10-13T07:42:18.000Z
---

> [!quote] p. 152
> Replication means keeping a copy of the same data on multiple machines

…the explanation…

## Tutoring sessions

Every conversation with the tutor is saved, after each reply, as a Markdown file beside the book:
`library/<book>/sessions/2026-10-13 Why does Thompson call dx a little bit of x.md`, named by its
first question (`kind: session`), with the passage it was about (if one was pinned) and the chapter as
its `source`, the tutor's style as its `mode`, and the conversation as `## You` / `## Tutor` sections. The Tutor pane lists a
book's earlier sessions when you start a new one: open one to read it again or carry it on (it keeps
its file). Like everything in the vault, sessions can be linked from notes, read by the agent, and
opened in Obsidian.

Two buttons above a saved conversation keep what it taught you:

- **Save as note** writes what you worked out as a note of your own in `notes/` (`type: session`,
  named after the idea, not the conversation), ending with a link back to the session. The session's
  frontmatter links to the note in turn (in `related`), and the button becomes **Open note**.
- **Make cards** drafts flashcards on the ideas the tutor explained, to review and edit before they
  are saved, as from a passage.

## Notes

Notes are files in `notes/` (folders allowed), **named by their title** as in Obsidian, with
optional frontmatter. The editor is CodeMirror 6 (what Obsidian is built on): it edits the Markdown
itself, byte for byte, with a live preview (marks hidden away from the cursor, `[[target|text]]`
shown as its text), `[[` completion over notes, concepts and books, and pictures pasted or dropped
into `attachments/`. ⌘-click follows a link. Rendering is react-markdown (remark/rehype) with GFM,
KaTeX, and Obsidian's syntax: `[[links]]`, `![[embeds]]` (notes, annotations, pictures,
`figure:<id>`), `> [!callouts]`, `==highlights==`, `#tags`; a ```` ```figure ```` block is a live
figure. Beside each note: what links here (with the line), unlinked mentions (one click links them),
links out, and **connections**: an agent reads your vault and suggests notes and concepts this one
should link to, each with a reason. Accepting writes `related: ["[[…]]"]` into the note's
frontmatter (so Obsidian and agents see it too); rejected and removed ones are remembered in
`brain/connections.jsonl` and never suggested again (Settings can make it add them directly).
Concepts get the same treatment for what they build on: Brain → Suggested links → **Find what builds
on what** has a model read every concept and propose, for each one with no `builds-on` yet (written
by hand, say, or in Obsidian), which of the others it needs first; accepting one writes it into the
concept's `builds-on`.
Renaming a note moves the file and rewrites every link to it; deleting moves it to `.trash/`.
