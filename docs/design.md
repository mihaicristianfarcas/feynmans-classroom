# Design: look, motion and accessibility

The design system lives in `web/src/styles/styles.css` (tokens, controls, motion) with
`web/src/components/ui.ts` (sliding indicators) and `web/src/lib/a11y.ts` (keyboard and
screen-reader behaviour). Use its tokens and component classes (`.button`, `.segmented`, `.tabs`,
`.well`, `.tag-pill`, `data-tone`) rather than new colours or one-off controls. For motion and
polish, the [emil-design-eng](../.agents/skills/emil-design-eng/SKILL.md) skill applies; where it and
this page differ, this page wins.

## Look and feel

Ink on paper, set like a well-made book: coal gray and off-white, light or dark (it follows the
system until you pick one), with six quiet pastels that each mean one thing and show only as small
marks (a badge, an icon's well, a highlight, a state): **lavender** for the accent and what the
models write (margin answers, AI links), **sage** for known and right, **butter** for what's waiting
(cards due) and the default highlighter, **peach** for figures, **sky** for links and notes, **rose**
for wrong, fading and delete. Surfaces are flat paper parted by hairlines; one shadow lifts what
floats (menus, dialogs, the card you review). The one filled button style is ink, for a page's main
action.

Three typefaces ship with the app (so it looks the same offline): **Newsreader** for page titles and
for what you read and write (books, notes, answers), **Hanken Grotesk** for the controls, **JetBrains
Mono** for code. Sizes come from the type tokens in `styles.css` (`--text-2xs` to `--text-4xl`),
spacing from the 4 px scale (`--space-3xs` to `--space-3xl`).

The learner sets how it looks in Settings, under Appearance: the theme (System, Light or Dark), and
for reading the typeface (serif or sans), the text size and the line width. They are kept on the
device and set on the root as `data-read-*`, which turn into the reading tokens (`--read-font`,
`--read-size`, `--read-leading`, `--read-measure`) that the reader, notes and Markdown use; index.html
applies them before the first paint.

Every page shows only what it is for, under its title in the serif, in one container capped at
1120 px. Space, not rules, parts a page's sections; hairlines only part the rows of a list. A slim bar
along the top holds the wordmark (with the open vault's name beside it, a menu of the others, once
there are several), the pages beside it (the current one underlined, with the cards due on Review), search drawn as a field (⌘K), the agent (a sparkle, with a dot while it works), the theme
and settings; the reader keeps its own bar of the same height. On a phone the pages move to a tab bar
along the bottom, each its icon over its name.

Where a page has a main column and things beside it, the side holds panels (`.side-panel`: a small
title with its icon, a number in the serif, a line, an action) that stay in view as the main column
scrolls, and fall under it on a narrow screen. Today is a greeting with the date, the field for the
agent, the book you were reading (its cover, where you were, how far through, a button to carry on)
with the others you've started under it, and what else is next; beside them what's waiting in Review
and the week's study days. A book's cover carries its title and author; under it, how far through
you are (a thin bar, `.meter`) and what it holds. The Library finds books by title or author and
orders them by the last one touched, by title or by author; a cover's corner holds Edit details (its
title, author and chapter names, in a dialog) and Remove; files or folders dropped anywhere on it
(or on Today, before the first book) are added, one at a time, with how far it has got and what
wasn't added (and why) under the title. Review is the card, under the title, the deck and how far
through the session you are. Journey is its numbers on tiles, the study days with the months named and
a key, and what you've made and did lately beside them. Settings are sections one under another,
listed at the left (across the top on a phone) with the one in view marked; `#/settings/<section>`
opens at one. Notes on a phone are the list or the note, with a way back to the list.

The agent is one field over any page (⌘J), never a page or a form of its own: a request, a short
reply, the change shown where it lands. The Brain is the graph alone, filling the window, with Find
at the top (⌘K there), the item you pick in a card at its left and, if you open it, the legend in a
card like it at its right; each item is its kind's icon in a circle, with its name beside it. The item
you pick glides to the middle of the graph the cards leave in view (above the card, on a phone).
Secondary controls stay quiet (subtle buttons, a disclosure for advanced settings) and explanations
are one line.

Everything a page shows comes from this computer, so nothing pretends to be on its way: no skeletons
or placeholder shapes. A page appears when its data is there (a few milliseconds), fading in; only a
wait long enough to notice (a big book opening) shows a spinner saying what it waits for, after a
moment (`Loading` in `components/feedback.tsx`). Every page's code is fetched once the app is idle,
and pointing at (or focusing) a link to a page fetches its code and first data (`app/pages.ts`);
what a page loaded is kept for the visit (`useLoad`'s key, `lib/cache.ts`), so a page opened again
shows it at once and quietly loads it anew. Moving between items of one page (notes, say) keeps the
one on show until the next is ready, so nothing blanks or jumps; a note pointed at in the list
starts loading before the click (`notes/kept.ts`).

Nothing moves once it is drawn. A reload paints the paper in your theme before anything else
(index.html), and the first frame waits a moment for the typefaces, so the bar and titles never
reflow when they swap in (`main.tsx`). The number on Review is drawn with the bar, from the last
count known. A note (or a concept) counts as loaded once what it shows from elsewhere is in too:
its pictures with their sizes, KaTeX and its faces if it has math, and its embedded notes and
figures (`prepareMarkdown` in `components/markdownReady.ts`), so it is drawn whole, and a picture
always gets a space of its own shape before it arrives.

Side panels (the notes' list and links, the reader's study panel, the Brain's legend and card) are as
wide as you drag their inner edge, within a default, a narrowest and a widest width (`usePanel` and
`PanelEdge`); there is no handle, just a line that lights when you rest on the edge. Dragging well past
the narrowest width closes the panel, and a button (`PanelToggle`) opens it again at its default width.
Each panel's width is kept in localStorage (0 while closed).

Motion is quick and quiet, and moves only `transform` and `opacity` (a segmented control's tile
clips into place): popovers and menus grow from where they open, presses scale slightly, tab and
nav indicators slide, a page arriving fades or rises a few pixels, what you can open lifts a little
under the pointer, and the theme switch crossfades.
What you do from the keyboard (the ⌘K palette, the agent's ⌘J panel, revealing a card, the reader's
shortcuts) doesn't animate, and reduced motion keeps only fades. The tokens, controls and motion rules live in
`web/src/styles/styles.css`.

## Accessibility

Everyone should be able to learn with this app: with a keyboard alone, with a screen reader, zoomed
in, with reduced motion. The bar is WCAG 2.2 AA, checked by `npm run test:a11y` (axe-core on every
page in both themes, plus keyboard checks) on every pull request.

- **Text contrast.** `--ink`, `--ink-2` and `--ink-3` (the lightest text) are at least 4.5:1 on
  every surface in both themes; `--ink-4` is for disabled controls, icons and rules only. Each
  pastel's `-ink` shade reads on its `-soft` fill, and text on a pastel itself is `--on-pastel`.
  A field's edge (`--field-edge`) is at least 3:1 against what it sits on. Links are underlined,
  never told apart by colour alone.
- **Focus.** Everything you can click can be reached with Tab and shows a solid focus ring
  (`:focus-visible`), at once (it never fades in). Targets are at least 24 px. A disabled control
  is faded, shows the not-allowed cursor and carries the `disabled` attribute.
- **Structure.** Every page has one `h1` and headings that don't skip levels, a skip link as the
  first Tab stop, and `main` for its content. Moving to another page sets the title and moves
  focus to the new content.
- **Controls.** Use real buttons and links. A group of options is a `fieldset` with a (visually
  hidden) `legend`. Tabs are `role="tablist"` with arrow keys (`useArrowKeys`); menus are
  `role="menu"` with arrow keys; dialogs are `<Modal>` (or `useFocusTrap`): they take focus,
  keep Tab inside, close on Escape and give focus back. A button that opens a dialog says so with
  `aria-haspopup="dialog"`.
- **Announcements.** Results, saves and feedback that appear without a page change are announced
  (`announce()`, or `role="status"` / `role="alert"`).
- **Mouse-only gestures have a keyboard way.** In the reader, `S` selects the passage at the
  reading line and opens the selection menu with focus in it; capture places its box with the arrow
  keys; the knowledge graph is navigated with the arrow keys, Enter reads an item in the card beside
  it and Escape gives focus back to the item; a figure's parts are picked and read
  with the up and down arrows, and Shift + arrows drag the picked one (or pan, or turn the view); a
  side panel's edge is a separator you can Tab to: the arrow keys resize it, Home and End go to its
  narrowest and widest, Enter closes it (its button opens it again).
- **Motion.** Keyboard actions don't animate; `prefers-reduced-motion` keeps only fades.
