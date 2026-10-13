/* What the models write in the margin: explanations, definitions and answers (prose), resources
 * (found with live web search), and figures (scene specs drawn by the platform). Also follow-up
 * questions on an answer, redrawing a figure with the reader's notes, and writing again what a
 * restart interrupted. Book text is always given as material, never as instructions. */
import type { Scene } from "../../shared/scene/types.ts";
import type { Annotation } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import type { Book } from "../books/types.ts";
import { passageAround } from "../ingest/index.ts";
import { learnerSummary, relatedInVault, sourceLine } from "../learn/context.ts";
import { type CallResult, structured, text } from "../llm/index.ts";
import { generateScene } from "../scene/generate.ts";
import { annotations, changed, now } from "../vault/index.ts";

import { announce } from "./live.ts";

function passageContext(book: Book, a: Annotation) {
  const around = passageAround(
    book,
    a.anchor.page !== undefined ? { page: a.anchor.page } : { block: a.anchor.block ?? 0 },
    1,
  );
  const chapter = a.chapterId ? book.toc.find((c) => c.id === a.chapterId) : undefined;
  const where = a.anchor.page !== undefined ? `page ${a.anchor.page}` : `block ${a.anchor.block}`;
  return {
    around: around.slice(0, 7000),
    source: {
      title: book.title,
      author: book.author,
      chapter: chapter ? `${chapter.title}${chapter.subtitle ? ` — ${chapter.subtitle}` : ""}` : undefined,
    },
    where,
  };
}

function relatedLine(a: Annotation) {
  const related = relatedInVault(`${a.anchor.quote} ${a.request || ""}`, 8);
  return related.length
    ? `\nAlready in the learner's notes (link one as [[exact title]] only where it truly helps them connect ideas; never invent links):\n${related.map((r) => `- [[${r.title}]] (${r.kind})${r.summary ? `: ${r.summary}` : ""}`).join("\n")}\n`
    : "";
}

const INSTRUCTIONS: Record<"explain" | "define" | "ask", string> = {
  explain: `Explain the selected passage to this learner, in the margin beside it, the way a great teacher would lean over and tell them.
- Open with the core idea in plain words, in one or two sentences. No preamble: don't restate the question or say "This passage…".
- Then what they need to really get it: unpack terms, give a concrete example or analogy fitted to them, and why it matters here.
- 80–180 words unless they asked for more. Short paragraphs or a short list. Bold the one key idea. LaTeX in $…$ for math.
- Stay true to the book. If you add something the book doesn't say, say so in a few words.`,
  define: `Define what the learner selected (a term or phrase), as this book uses it.
- First a one-sentence definition in plain words (bold the term).
- Then what it means in this passage, in one or two sentences; add a contrast or synonym if it helps.
- At most 70 words. LaTeX in $…$ for math.`,
  ask: `Answer the learner's question about the selected passage.
- Answer first, directly, in plain words; then the reasoning or an example if it helps.
- At most 200 words. LaTeX in $…$ for math.
- If the book doesn't answer it, say so briefly and answer from general knowledge, marked as such.`,
};

function writtenPrompt(kind: "explain" | "define" | "ask", book: Book, a: Annotation) {
  const ctx = passageContext(book, a);
  return `${INSTRUCTIONS[kind]}

The learner:
${learnerSummary()}

Book: ${sourceLine(ctx.source)}

The selected passage (${ctx.where}):
"""
${a.anchor.quote}
"""
${a.request ? `\nTheir ${kind === "ask" ? "question" : "request"}: ${a.request}\n` : ""}${relatedLine(a)}
The text around it, for context:
"""
${ctx.around}
"""

Reply with the Markdown only.`;
}

const RESOURCES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resources"],
  properties: {
    resources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "kind", "why"],
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          kind: { type: "string", enum: ["video", "article", "interactive", "course", "book", "paper", "reference"] },
          why: { type: "string", description: "one sentence: what this gives the learner that the book doesn't" },
        },
      },
    },
  },
};

function resourcesPrompt(book: Book, a: Annotation) {
  const ctx = passageContext(book, a);
  return `Find 3 to 6 excellent resources that help this learner understand the selected passage better: a great video or animation, an interactive explainer, a clear article, a lecture, the original paper. Search the web and only give links you have checked exist; prefer stable, reputable sources (Wikipedia, university courses, well-known explainers such as 3Blue1Brown or Khan Academy, the authors' own pages). Mix kinds; fit them to the learner.

The learner:
${learnerSummary()}

Book: ${sourceLine(ctx.source)}

The selected passage (${ctx.where}):
"""
${a.anchor.quote}
"""
${a.request ? `\nWhat they're after: ${a.request}\n` : ""}
Return JSON.`;
}

const SCENE_KINDS = ["plot", "sequence", "graph", "diagram", "object3d"];

/** Writes an annotation's answer (or draws its figure) with a model, and saves it when it arrives. */
export async function writeAnswer(
  a: Annotation,
  book: Book,
  options: { quality?: "quick" | "careful"; sceneKind?: string } = {},
) {
  const started = Date.now();
  try {
    let body = "";
    let result: CallResult<unknown>;
    if (a.kind === "explain" || a.kind === "define" || a.kind === "ask") {
      result = await text({
        prompt: writtenPrompt(a.kind, book, a),
        tier: options.quality === "careful" ? "smart" : "fast",
      });
      body = clean(String(result.data));
    } else if (a.kind === "resources") {
      result = await structured<{ resources: { title: string; url: string; kind: string; why: string }[] }>({
        prompt: resourcesPrompt(book, a),
        schema: RESOURCES_SCHEMA,
        tier: "fast",
        search: true,
      });
      const list = (
        result.data as { resources: { title: string; url: string; kind: string; why: string }[] }
      ).resources.filter((r) => /^https?:\/\//.test(r.url));
      body =
        list.map((r) => `- [${r.title.replace(/[[\]]/g, "")}](${r.url}) — ${r.why} *(${r.kind})*`).join("\n") ||
        "_Nothing reliable found._";
    } else {
      const ctx = passageContext(book, a);
      const kind = SCENE_KINDS.includes(options.sceneKind || "") ? (options.sceneKind as "plot") : "auto";
      const scene = await generateScene({
        passage: a.anchor.quote,
        context: ctx.around,
        source: ctx.source,
        request: a.request,
        kind,
        learner: learnerSummary(),
        tier: options.quality === "careful" ? "smart" : "fast",
      });
      result = {
        data: scene.scene,
        ms: scene.ms,
        provider: scene.provider as CallResult["provider"],
        model: scene.model,
      };
      body = figureBody(scene.scene);
      a.title = scene.scene.title;
    }
    const fresh = annotations.get(a.id);
    if (!fresh) return; // deleted while it was being written
    Object.assign(fresh, {
      body,
      title: a.title,
      status: "ready",
      error: undefined,
      model: { provider: result.provider, name: result.model, ms: Date.now() - started },
      updated: now(),
    });
    annotations.save(fresh);
    changed(`${fresh.kind} ${fresh.id}`);
    announce(fresh);
  } catch (error) {
    const fresh = annotations.get(a.id);
    if (!fresh) return;
    Object.assign(fresh, { status: "failed", error: (error as Error).message.slice(0, 400), updated: now() });
    annotations.save(fresh);
    announce(fresh);
  }
}

/** A figure inside an annotation: its title, caption, and the spec as a ```figure block. */
export function figureBody(scene: Scene) {
  return `## ${scene.title}\n\n${scene.caption || ""}\n\n\`\`\`figure\n${JSON.stringify(scene, null, 1)}\n\`\`\``.replace(
    /\n{3,}/g,
    "\n\n",
  );
}
/** The figure spec inside an annotation's body, if it has one. */
export function figureOf(a: Annotation): Scene | null {
  const m = /```figure\s*\n([\s\S]*?)\n```/.exec(a.body);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Scene;
  } catch {
    return null;
  }
}

/** Models sometimes wrap Markdown in a fence or open with a heading that repeats the task. */
function clean(md: string) {
  let out = md.trim();
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(out);
  if (fenced) out = fenced[1].trim();
  return out.replace(/^#{1,3} *(explanation|definition|answer)\s*\n+/i, "").trim();
}

/** A question about an annotation: the answer goes in as a "## Follow-up: …" section. */
export async function followUp(id: string, question: string): Promise<Annotation> {
  const a = annotations.get(id);
  if (!a) throw new Error("annotation not found");
  const book = getBook(a.bookId);
  if (!book) throw new Error("book not found");
  const ctx = passageContext(book, a);
  const q = question.trim().replace(/\s+/g, " ").slice(0, 600);
  const prompt = `The learner is reading ${sourceLine(ctx.source)} and asked about a passage; here is what they've been told so far, then their follow-up question. Answer it directly in plain words, at most 160 words, Markdown (LaTeX in $…$). Stay consistent with what was said before unless it was wrong (then say so).

The learner:
${learnerSummary()}

The passage (${ctx.where}):
"""
${a.anchor.quote}
"""

So far:
"""
${a.request ? `They asked: ${a.request}\n\n` : ""}${a.body.replace(/```figure[\s\S]*?```/g, "[an interactive figure]").slice(0, 5000)}
"""
${relatedLine({ ...a, request: q })}
Their follow-up: ${q}

The text around the passage:
"""
${ctx.around.slice(0, 4000)}
"""

Reply with the Markdown only.`;
  const result = await text({ prompt, tier: "fast" });
  const fresh = annotations.get(id);
  if (!fresh) throw new Error("annotation was deleted");
  fresh.body = `${fresh.body.trim()}\n\n## Follow-up: ${q}\n\n${clean(result.data)}`;
  fresh.updated = now();
  annotations.save(fresh);
  changed(`follow-up ${fresh.id}`);
  announce(fresh);
  return fresh;
}

/** Draws a figure annotation again, with the reader's notes on the current one. */
export function redraw(id: string, input: { notes?: string; quality?: "quick" | "careful" }) {
  const a = annotations.get(id);
  if (a?.kind !== "visualize") throw new Error("figure not found");
  const book = getBook(a.bookId);
  if (!book) throw new Error("book not found");
  const previous = figureOf(a);
  a.status = "pending";
  a.error = undefined;
  annotations.save(a);
  announce(a);
  void (async () => {
    const started = Date.now();
    try {
      const ctx = passageContext(book, a);
      const request = input.notes?.trim()
        ? `${a.request ? `${a.request}\n` : ""}The reader's notes on the current version: ${input.notes.trim()}`
        : a.request;
      const scene = await generateScene({
        passage: a.anchor.quote,
        context: ctx.around,
        source: ctx.source,
        request,
        kind: "auto",
        learner: learnerSummary(),
        previous: input.notes?.trim() && previous ? previous : undefined,
        tier: input.quality === "careful" ? "smart" : "fast",
      });
      const fresh = annotations.get(id);
      if (!fresh) return;
      Object.assign(fresh, {
        body: figureBody(scene.scene),
        title: scene.scene.title,
        status: "ready",
        model: { provider: scene.provider, name: scene.model, ms: Date.now() - started },
        updated: now(),
      });
      annotations.save(fresh);
      changed(`figure ${fresh.id}`);
      announce(fresh);
    } catch (error) {
      const fresh = annotations.get(id);
      if (!fresh) return;
      Object.assign(fresh, { status: "failed", error: (error as Error).message.slice(0, 400) });
      annotations.save(fresh);
      announce(fresh);
    }
  })();
  return a;
}

/** Explanations and figures that were being written when the server stopped are written again. */
export function resumeAnnotations() {
  for (const a of annotations.list()) {
    if (a.status !== "pending") continue;
    const book = getBook(a.bookId);
    if (book) void writeAnswer(a, book);
  }
}
