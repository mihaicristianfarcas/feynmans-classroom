# Design: look, motion and accessibility

The design system lives in `web/src/styles/styles.css` (tokens, controls, motion) with
`web/src/components/ui.ts` (sliding indicators) and `web/src/lib/a11y.ts` (keyboard and
screen-reader behaviour). Use its tokens and component classes (`.button`, `.segmented`, `.tabs`,
`.well`, `.tag-pill`, `data-tone`) rather than new colours or one-off controls. For motion and
polish, the [emil-design-eng](../.agents/skills/emil-design-eng/SKILL.md) skill applies; where it and
this page differ, this page wins.

## Look and feel

Coal gray and off-white, light or dark (it follows the system until you pick one), with pastel
accents that each mean one thing: **lavender** for the accent and what the models write (margin
answers, AI links), **sage** for known and right, **butter** for what's waiting (cards due) and the
default highlighter, **peach** for figures, **sky** for links and notes, **rose** for wrong, fading
and delete. The app is set in the system sans; what you read and write (books, notes, answers) is in
a serif.

Every page shows only what it is for. A slim bar along the top holds the pages (with the cards due
on Review), search, the theme and settings; the reader keeps its own bar of the same height. The
Brain is the graph alone, filling the window, with the item you pick in a card at its side; Today is
a greeting, the ask field and what's next; Review is the card. Secondary controls stay quiet
(subtle buttons, a disclosure for advanced settings) and explanations are one line.

Motion is quick and quiet: popovers and menus grow from where they open, presses scale slightly,
tab and nav indicators slide, new content rises a few pixels, and the theme switch crossfades.
What you do from the keyboard (the ⌘K palette, revealing a card, the reader's shortcuts) doesn't
animate, and reduced motion keeps only fades. The tokens, controls and motion rules live in
`web/src/styles/styles.css`.

## Accessibility

Everyone should be able to learn with this app: with a keyboard alone, with a screen reader, zoomed
in, with reduced motion. The bar is WCAG 2.2 AA, checked by `npm run test:a11y` (axe-core on every
page in both themes, plus keyboard checks) on every pull request.

- **Text contrast.** `--ink`, `--ink-2` and `--ink-3` (the lightest text) are at least 4.5:1 on
  every surface in both themes; `--ink-4` is for disabled controls, icons and rules only. Each
  pastel's `-ink` shade reads on its `-soft` fill. Links are underlined, never told apart by colour
  alone.
- **Focus.** Everything you can click can be reached with Tab and shows a solid focus ring
  (`:focus-visible`). Targets are at least 24 px.
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
  with the up and down arrows, and Shift + arrows drag the picked one (or pan, or turn the view).
- **Motion.** Keyboard actions don't animate; `prefers-reduced-motion` keeps only fades.
