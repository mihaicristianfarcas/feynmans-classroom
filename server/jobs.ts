/* A small in-process job queue for work that takes a while (planning a chapter, drawing figures,
 * building demos): jobs report progress on their book's event stream, can be cancelled, and
 * hand-built demo builds share a concurrency limit (CODEX_CONCURRENCY). */
import { newId } from "./books/store.ts";
import type { Job } from "./books/types.ts";
import { CODEX } from "./config.ts";
import { publish } from "./events.ts";

type Work = (job: Job, signal: AbortSignal) => Promise<void>;

interface Entry {
  job: Job;
  work: Work;
  controller: AbortController;
}

/** A small in-process queue: plan jobs run at once, build jobs share a concurrency limit. */
class Queue {
  private waiting: Entry[] = [];
  private running = new Map<string, Entry>();
  private recent: Job[] = [];

  add(partial: Omit<Job, "id" | "status">, work: Work): Job {
    const job: Job = { ...partial, id: newId("j"), status: "queued" };
    const entry = { job, work, controller: new AbortController() };
    if (job.kind !== "build") this.start(entry);
    else {
      this.waiting.push(entry);
      this.pump();
    }
    this.emit(job);
    return job;
  }

  list(bookId?: string): Job[] {
    const all = [...this.running.values(), ...this.waiting].map((e) => e.job).concat(this.recent);
    return bookId ? all.filter((job) => job.bookId === bookId) : all;
  }

  cancelDemo(demoId: string) {
    this.waiting = this.waiting.filter((e) => e.job.demoId !== demoId);
    for (const entry of this.running.values()) if (entry.job.demoId === demoId) entry.controller.abort();
  }

  cancelBook(bookId: string) {
    this.waiting = this.waiting.filter((e) => e.job.bookId !== bookId);
    for (const entry of this.running.values()) if (entry.job.bookId === bookId) entry.controller.abort();
  }

  isBusy(demoId: string) {
    return [...this.running.values(), ...this.waiting].some((e) => e.job.demoId === demoId);
  }

  stats() {
    return { running: this.running.size, waiting: this.waiting.length, concurrency: CODEX.concurrency };
  }

  private pump() {
    const builds = [...this.running.values()].filter((e) => e.job.kind === "build").length;
    let free = CODEX.concurrency - builds;
    while (free > 0 && this.waiting.length) {
      this.start(this.waiting.shift()!);
      free--;
    }
  }

  private start(entry: Entry) {
    entry.job.status = "running";
    this.running.set(entry.job.id, entry);
    this.emit(entry.job);
    entry
      .work(entry.job, entry.controller.signal)
      .then(() => (entry.job.status = "done"))
      .catch((error: Error) => {
        entry.job.status = "failed";
        entry.job.message = error.message;
        console.error(`[jobs] ${entry.job.kind} ${entry.job.id} failed:`, error.message);
      })
      .finally(() => {
        this.running.delete(entry.job.id);
        this.recent.unshift(entry.job);
        this.recent = this.recent.slice(0, 50);
        this.emit(entry.job);
        this.pump();
      });
  }

  private emit(job: Job) {
    publish(job.bookId, { type: "job", data: job });
  }
}

export const queue = new Queue();
