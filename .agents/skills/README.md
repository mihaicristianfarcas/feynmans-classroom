# Agent skills

Skills that coding agents working on this repository can load. Each one is a folder with a
`SKILL.md` (instructions, read when a task matches its description) and the references and
scripts it points to. Codex and other agents that follow the [Agent Skills](https://agentskills.io)
layout read them from here. Claude Code reads `.claude/skills/`, which links back to these
folders. People can read them too: they're plain Markdown.

| Skill | Use it when | Source | License |
|---|---|---|---|
| [`visual-pr`](visual-pr/SKILL.md) | opening or describing a pull request: summary, before/after figures, GIFs, edge cases, verification | [cristicretu/pr-skill](https://github.com/cristicretu/pr-skill) `skills/visual-pr` | MIT |
| [`emil-design-eng`](emil-design-eng/SKILL.md) | building or reviewing UI and motion: easing, durations, press feedback, popovers, reduced motion | [emilkowalski/skills](https://github.com/emilkowalski/skills) `skills/emil-design-eng` | MIT |
| [`anatomy`](anatomy/SKILL.md) | drawing figures and hand-built demos in the house style: thin lines, paper solids, calm motion | [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy) | MIT |

`anatomy` is a link to [`vendor/anatomy`](../../vendor/anatomy), because the app uses the same
copy at runtime: hand-built demos draw with its kit. Update it with
`npm run sync:anatomy -- --from <skill dir>`, which leaves out the built example pages and the
skill's own tests. The other two are copied as published. Change them upstream rather than here,
so they can be updated by copying them again.

## How this repository uses them

- Every pull request follows `visual-pr`. The capture recipe for this app (test servers on other
  ports, a throwaway `DATA_DIR`, the screenshot scripts) is in
  [CONTRIBUTING.md](../../CONTRIBUTING.md#pull-requests).
- UI and motion changes follow `emil-design-eng` within the design system in
  [docs/design.md](../../docs/design.md). Where the two differ, the design system wins.
- Changes to figures (`shared/scene/`, `runtime/`) keep to `anatomy`'s drawing rules.

## Adding a skill

Put it in its own folder here with its license. Link it for Claude Code with
`ln -s ../../.agents/skills/<name> .claude/skills/<name>`. Then add a row to the table above.
