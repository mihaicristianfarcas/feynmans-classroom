/* Hand-built demos: for what the declarative figure kinds can't show, Codex writes a custom demo.js
 * in a sandboxed workspace, checks it in Node and in Chrome, and fixes what fails (minutes per demo,
 * Codex only). This module makes a hand-built demo from a scene figure, queues its build, rebuilds,
 * and resumes builds that a restart interrupted; build.ts runs one build. */
import { getDemo, listBooks, listDemos, newId, saveDemo } from "../books/store.ts";
import type { Demo } from "../books/types.ts";
import { publish } from "../events.ts";
import { queue } from "../jobs.ts";
import { activeProvider } from "../settings.ts";
import { buildDemo, resetWorkspace } from "./build.ts";

export function enqueueBuild(demo: Demo) {
  return queue.add({ bookId: demo.bookId, kind: "build", demoId: demo.id, chapterId: demo.chapterId }, (_job, signal) =>
    buildDemo(demo.id, demo.bookId, signal),
  );
}

export function regenerate(bookId: string, demoId: string, feedback?: string) {
  const demo = getDemo(bookId, demoId);
  if (!demo) throw new Error("demo not found");
  if (queue.isBusy(demoId)) throw new Error("this demo is already being built");
  resetWorkspace(demo);
  Object.assign(demo, {
    status: "queued",
    feedback: feedback?.trim() || undefined,
    threadId: undefined,
    error: undefined,
    activity: "waiting for a Codex slot",
  });
  saveDemo(demo);
  publish(bookId, { type: "demo", data: demo });
  return enqueueBuild(demo);
}

/** After a restart, demos that were mid-build go back in the queue. */
export function resumeInterrupted() {
  for (const book of listBooks()) {
    for (const demo of listDemos(book.id)) {
      if (demo.type !== "scene" && ["queued", "building", "checking", "planning"].includes(demo.status)) {
        resetWorkspace(demo);
        demo.status = "queued";
        demo.activity = "resuming after a restart";
        saveDemo(demo);
        enqueueBuild(demo);
      }
    }
  }
}

/** Hand-builds a demo.js version of a scene figure, as a new demo beside it (for what the scene kinds can't show). */
export function craftFromFigure(demo: Demo, feedback?: string) {
  if (activeProvider() !== "codex")
    throw new Error("Hand-built demos need Codex (they run in its sandbox). Switch the provider in Settings.");
  const scene = demo.scene as { hint?: string } | undefined;
  const brief = {
    ...demo.brief,
    picture:
      demo.brief.picture ||
      `As in this figure spec, but hand-crafted: ${JSON.stringify(demo.scene || {}).slice(0, 4000)}`,
    motion: demo.brief.motion || scene?.hint || "",
    controls: demo.brief.controls || "",
    readouts: demo.brief.readouts || "",
    truth: demo.brief.truth || "",
  };
  const copy: Demo = {
    ...demo,
    id: newId("d"),
    type: "code",
    scene: undefined,
    status: "queued",
    brief,
    attempts: 0,
    threadId: undefined,
    checks: undefined,
    feedback,
    createdAt: new Date().toISOString(),
    activity: "waiting for a Codex slot",
  };
  saveDemo(copy, { create: true });
  publish(copy.bookId, { type: "demo", data: copy });
  return enqueueBuild(copy);
}
