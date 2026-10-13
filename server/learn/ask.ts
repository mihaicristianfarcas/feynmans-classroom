/* Asking the vault a question: an agent reads the indexes and files with its shell (read-only) and
 * answers with the passages it used; an answer worth keeping becomes a note. */
import { agent } from "../llm/index.ts";
import { logActivity, VAULT } from "../vault/index.ts";
import { learnerSummary } from "./context.ts";
import { createNote } from "./notes.ts";

const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "sources"],
  properties: {
    answer: { type: "string", description: "Markdown answer for the learner; cite sources inline like [1]" },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "quote"],
        properties: {
          path: { type: "string", description: "vault-relative file path" },
          quote: { type: "string", description: "the short passage used" },
        },
      },
    },
  },
};

/** An agent reads the vault (notes, concepts, cards, the books' text) and answers with citations. */
export async function askVault(
  question: string,
  opts: { onActivity?: (t: string) => void; signal?: AbortSignal } = {},
) {
  const prompt = `You are the learner's research assistant, working inside their knowledge vault (this folder). Read AGENTS.md first: it explains the layout. Answer the question from what is in the vault: search with rg or grep across notes/, concepts/, cards/ and library/ (the books' full text), read the relevant files, and synthesise a clear answer in plain words. Cite the files you used. If the vault doesn't cover it, say so and answer briefly from general knowledge, marked as such. Do not modify any file.

The learner:
${learnerSummary()}

Question: ${question}

Return JSON.`;
  const result = await agent({
    cwd: VAULT,
    prompt,
    schema: ASK_SCHEMA,
    tier: "smart",
    effort: "low",
    onActivity: opts.onActivity,
    signal: opts.signal,
  });
  const data = result.data as { answer: string; sources: { path: string; quote: string }[] };
  logActivity({ type: "ask", text: `Asked the vault: ${question.slice(0, 80)}` });
  return { ...data, ms: result.ms };
}

export function saveAnswer(question: string, answer: string, sources: { path: string; quote: string }[]) {
  const cite = (path: string) =>
    path.endsWith(".md") && !path.includes("/text/") ? `[[${path.replace(/\.md$/, "")}]]` : `\`${path}\``;
  return createNote({
    type: "answer",
    title: question.slice(0, 80),
    body: `${answer}\n\n${sources.length ? `**Sources**\n${sources.map((s, i) => `${i + 1}. ${cite(s.path)} — “${s.quote}”`).join("\n")}` : ""}`,
    tags: ["ask"],
  });
}
