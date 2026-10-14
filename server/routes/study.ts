/* Routes for the study tools: quizzes and pretests (with grading of short answers), explaining an
 * idea back in your own words, connecting it to the world, and the tutor, whose sessions are kept
 * beside the book (and can be written up as a note). */
import type { Hono } from "hono";
import type { Note } from "../../shared/vault-types.ts";
import { readBody } from "../http.ts";
import {
  deleteSession,
  getSession,
  listSessions,
  noteFromSession,
  recordExchange,
  renameSession,
} from "../learn/sessions.ts";
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
  /** The tutor's reply; the conversation is saved as a session of the book it's about. */
  app.post("/api/tutor", async (c) => {
    const body = await readBody<Parameters<typeof tutor>[0] & { sessionId?: string }>(c);
    const reply = await tutor(body);
    const session = recordExchange({
      ...body,
      messages: [...(body.messages || []), { role: "tutor", text: reply }],
    });
    return c.json({ reply, session });
  });
  app.get("/api/books/:id/sessions", (c) => c.json(listSessions(c.req.param("id"))));
  app.get("/api/sessions/:id", (c) => c.json(getSession(c.req.param("id"))));
  app.patch("/api/sessions/:id", async (c) =>
    c.json(renameSession(c.req.param("id"), (await readBody<{ title?: string }>(c)).title || "")),
  );
  app.delete("/api/sessions/:id", (c) => c.json({ ok: deleteSession(c.req.param("id")) }));
  app.post("/api/sessions/:id/note", async (c) => c.json(await noteFromSession(c.req.param("id"))));
}
