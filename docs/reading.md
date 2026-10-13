# Reading with a margin, and notes

## The margin

The reader puts the book on the right and a **margin** on the left, as in the nutlope reading demo:
select text and a dark menu offers **Highlight · Explain · Visualize · Ask · Define · + Note** (and,
under ⋯, the passage or a reference to your note, resources, flashcards, teach it back, connect it to
today, the tutor). Keys work too: <kbd>H</kbd> <kbd>E</kbd> <kbd>V</kbd> <kbd>A</kbd> <kbd>D</kbd>
<kbd>N</kbd>. Each answer becomes a card at the height of its passage, which is underlined in the
page; cards never overlap (the open one sits by its passage and the rest make room, as comments do
in a shared document), and a thin line joins the open card to its passage. Click a marked passage to
open its card. <kbd>C</kbd> captures a region of the page (a figure, a formula, a table) as a
picture for your note, with a transcription if you want one (LaTeX for formulas).

Every card is a Markdown file beside the book, `library/<book>/annotations/p152-explain-….md`:

```markdown
---
id: a8c1f0e2
kind: explain                     # highlight · comment · explain · define · ask · resources · visualize
book: designing-data-intensive-applications
book_id: b15c347ba44
pdf: { file: source.pdf, sha256: 9c1e…, pages: 613 }
chapter: c5
page: 152
anchor:
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
---

> [!quote] p. 152
> Replication means keeping a copy of the same data on multiple machines

…the explanation…

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
Renaming a note moves the file and rewrites every link to it; deleting moves it to `.trash/`.
