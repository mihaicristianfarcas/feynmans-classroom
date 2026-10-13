/* A quiz written in a note: a ```quiz block of YAML that the app plays one question at a time, and
 * that people and agents can write by hand. The server checks agents' quizzes with it; the browser
 * plays them.
 *
 *   ```quiz
 *   title: Replication, check yourself
 *   questions:
 *     - q: Which setup lets any replica accept writes?
 *       choices: [Single-leader, Multi-leader, Leaderless]
 *       answer: 3            # the right choice, counting from 1 (or its text)
 *       why: Leaderless (Dynamo-style) stores send writes to several replicas directly.
 *     - q: In a sentence or two, what is replication lag?
 *       answer: The delay before a write on the leader shows up on a follower.
 *       why: Reads from a lagging follower can return stale data.
 *   ```
 *
 * A question with choices is multiple choice; one without is answered in the learner's own words
 * and graded against `answer`. Optional per question: `concept`, `quote` (from the book). */

export interface QuizQuestion {
  kind: "mcq" | "short";
  question: string;
  choices: string[];
  /** mcq: the index of the right choice (from 0); short: 0. */
  answer: number;
  /** The model answer (short), or the right choice's text (mcq). */
  ideal: string;
  explanation: string;
  concept: string;
  quote: string;
}

export interface NoteQuiz {
  title: string;
  questions: QuizQuestion[];
}

const str = (value: unknown) =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

/** A quiz from a ```quiz block's parsed YAML; throws with a readable reason when it isn't one. */
export function quizFromData(data: unknown): NoteQuiz {
  if (!data || typeof data !== "object") throw new Error("a quiz needs a title and a list of questions");
  const raw = data as { title?: unknown; questions?: unknown };
  const list = Array.isArray(raw.questions) ? raw.questions : Array.isArray(data) ? (data as unknown[]) : null;
  if (!list?.length) throw new Error("a quiz needs at least one question (questions: - q: …)");
  const questions = list.map((item, i): QuizQuestion => {
    const q = (item || {}) as Record<string, unknown>;
    const question = str(q.q ?? q.question);
    if (!question) throw new Error(`question ${i + 1} has no text (q: …)`);
    const choices = Array.isArray(q.choices) ? q.choices.map(str).filter(Boolean) : [];
    const explanation = str(q.why ?? q.explanation);
    const base = { question, explanation, concept: str(q.concept), quote: str(q.quote) };
    if (!choices.length) {
      const ideal = str(q.answer ?? q.ideal);
      if (!ideal) throw new Error(`question ${i + 1} needs a model answer (answer: …)`);
      return { kind: "short", choices: [], answer: 0, ideal, ...base };
    }
    const given = q.answer;
    const index =
      typeof given === "number"
        ? given - 1
        : choices.findIndex(
            (c) =>
              c.toLowerCase() ===
              str(given)
                .toLowerCase()
                .replace(/^[a-z]\)\s*/, ""),
          );
    if (index < 0 || index >= choices.length)
      throw new Error(
        `question ${i + 1}: answer should be the right choice's number (1 to ${choices.length}) or its text`,
      );
    return { kind: "mcq", choices, answer: index, ideal: choices[index], ...base };
  });
  return { title: str(raw.title) || "Quiz", questions };
}

/** The ```quiz blocks in a Markdown text, as their YAML source. */
export function quizBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/^(`{3,}|~{3,})quiz[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm)].map((m) => m[2]);
}

/** An attempt, as Markdown to add under the quiz: a folded callout with the score, every question
 * marked right or wrong, and for each miss what was answered and the correction. */
export function attemptMarkdown(
  quiz: NoteQuiz,
  answers: ({ choice?: number; text?: string; score: number; feedback?: string } | null)[],
  when = new Date(),
): string {
  const flat = (text: string) => text.replace(/\s*\n+\s*/g, " ").trim();
  const score = Math.round(answers.reduce((s, a) => s + (a?.score || 0), 0) * 10) / 10;
  const lines = [
    `> [!attempt]- ${when.toISOString().slice(0, 10)} · ${score}/${quiz.questions.length} · ${quiz.title}`,
  ];
  quiz.questions.forEach((q, i) => {
    const a = answers[i];
    const right = (a?.score ?? 0) >= 0.7;
    lines.push(`> ${i + 1}. ${right ? "✓" : "✗"} ${flat(q.question)}`);
    if (right) return;
    const mine = q.kind === "mcq" ? (a?.choice !== undefined ? q.choices[a.choice] : "") : a?.text || "";
    lines.push(`>    - Mine: ${flat(mine) || "—"}`);
    const correct = flat(q.ideal).replace(/[.\s]+$/, "");
    lines.push(`>    - Correct: ${correct}${q.explanation ? `. ${flat(q.explanation)}` : ""}`);
    if (a?.feedback) lines.push(`>    - Feedback: ${flat(a.feedback)}`);
  });
  return lines.join("\n");
}
