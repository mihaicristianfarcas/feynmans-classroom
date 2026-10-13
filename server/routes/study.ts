/* Routes for the study tools: quizzes and pretests (with grading of short answers), explaining an
 * idea back in your own words, connecting it to the world, and the tutor. */
import type { Hono } from "hono";
import type { Note } from "../../shared/vault-types.ts";
import { readBody } from "../http.ts";
import {
  connect,
  gradeExplanation,
  gradeShortAnswers,
  makeQuiz,
  recordQuiz,
  saveExplanation,
  tutor,
} from "../learn/study.ts";

export function studyRoutes(app: Hono) {
  app.post("/api/quiz", async (c) => c.json(await makeQuiz(await readBody(c))));
  app.post("/api/quiz/grade", async (c) => {
    const b = await readBody<{ items: { question: string; ideal: string; answer: string }[] }>(c);
    return c.json(await gradeShortAnswers(b.items || []));
  });
  app.post("/api/quiz/record", async (c) => c.json(recordQuiz(await readBody(c))));

  app.post("/api/explain", async (c) => {
    const b = await readBody<{ concept: string; explanation: string; passage?: string; source?: Note["source"] }>(c);
    if (!b.explanation?.trim() || b.explanation.trim().split(/\s+/).length < 8)
      return c.json({ error: "Write at least a couple of sentences in your own words." }, 400);
    return c.json(await gradeExplanation(b));
  });
  app.post("/api/explain/save", async (c) => c.json(saveExplanation(await readBody(c))));

  app.post("/api/connect", async (c) => c.json(await connect(await readBody(c))));
  app.post("/api/tutor", async (c) => c.json({ reply: await tutor(await readBody(c)) }));
}
