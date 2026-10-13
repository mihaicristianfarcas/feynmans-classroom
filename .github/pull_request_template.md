<!--
Write this description with the visual-pr skill (.agents/skills/visual-pr/SKILL.md): a short summary a
user would understand, then the evidence you made for this PR, then the details. Capture main and your
branch from the same fixture (CONTRIBUTING.md → Pull requests has the recipe for this app), and attach
the media with `gh pr create --attach ./file.png` rather than committing it. Delete the parts that
don't apply, including these comments.
-->

<!-- 1–2 short paragraphs, 120 words at most: what was wrong or missing, as a user feels it, and what is different now. -->

## Before and after

<!-- One figure per question a reviewer would ask. Backend work: a diagram, table or output diff instead. -->

**Title in a few words.** One sentence: the input replayed, what differs, where to look.

| main | this branch |
|---|---|
| ![main: …](./main.png) | ![this branch: …](./branch.png) |

## Edge cases

| Case | How checked | Result |
|---|---|---|
| Keyboard only (Tab, Enter, Escape, arrows) | | |
| Screen reader names and announcements | | |
| Dark theme, reduced motion, 320 px wide | | |

---

## How

<!-- The decisions that aren't obvious, and what you tried and dropped. -->

## Verification

<!-- Commands you ran and what they printed. -->

- [ ] `npm run verify` (formatting, lint, types, unit tests, build)
- [ ] UI changes: `npm run test:a11y`, and checked by hand with the keyboard alone
- [ ] Documentation updated where behavior, commands or configuration changed

## Not in this PR

<!-- The scope you drew, and anything you noticed but left. -->
