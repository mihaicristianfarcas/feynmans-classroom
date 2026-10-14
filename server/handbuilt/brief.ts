/* A hand-built demo's brief as Markdown, for the workspace Codex builds it in: what the demo shows,
 * how it moves, what the reader controls, and the passage it belongs to. */
import type { Brief } from "../books/types.ts";

export function briefMarkdown(brief: Brief, chapterTitle: string): string {
  return `# Brief: ${brief.title}

- Chapter: ${chapterTitle}
- Topic label (shown above the demo): ${brief.eyebrow}
- Caption (shown above the demo): ${brief.caption}
- Card title: ${brief.title}

## The idea
${brief.idea}

## Picture
${brief.picture}

## Motion
${brief.motion}

## Controls
${brief.controls}

## Readouts
${brief.readouts}

## Truth (must hold)
${brief.truth}

## Predict first
${brief.predict ? `${brief.predict.question}\nChoices: ${brief.predict.choices.map((c, i) => `${i === brief.predict!.answer ? "**" : ""}${c}${i === brief.predict!.answer ? "** (answer)" : ""}`).join(" · ")}\nExplanation: ${brief.predict.explain}` : "None."}

## Where it sits in the text
> ${brief.anchorQuote}

\`\`\`json
${JSON.stringify(brief, null, 2)}
\`\`\`
`;
}
