/* Reading a picture cut from a book's page into Markdown for the learner's notes: LaTeX for a
 * formula, a table as a table, a figure as a short description with its labels. */
import { text } from "../llm/index.ts";

const PROMPT = `This picture is a region cut from a page of a book. Transcribe it into Markdown for the learner's notes:
- a formula or equation: LaTeX, $$…$$ for display math, $…$ inline; keep the book's symbols
- a table: a Markdown table
- a figure, diagram or chart: one short paragraph saying what it shows and what it's for, then any labels, axes or text in it
- running text: the text itself
Reply with the Markdown only, no preamble.`;

/** Transcribes the picture at `path` (absolute) with the quick model. */
export async function transcribePicture(path: string): Promise<{ markdown: string; ms: number }> {
  const result = await text({ prompt: PROMPT, images: [path], tier: "fast" });
  return {
    markdown: result.data.trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/, "$1"),
    ms: result.ms,
  };
}
