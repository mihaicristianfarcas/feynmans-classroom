/* A book's figures, annotations and jobs, kept live: a snapshot from the API, then the book's event
 * stream applied on top (events that arrive during a snapshot are replayed after it). */
import { useEffect, useState } from "react";
import { api } from "./books";
import { learn } from "./learn";
import type { Annotation, Book, Demo, Job } from "./types";

/** Demos, annotations and jobs for a book, kept live over server-sent events. */
export function useBookLive(bookId: string) {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connected, setConnected] = useState(false);
  const [book, setBook] = useState<Book | null>(null);
  useEffect(() => {
    let alive = true;
    // Events that arrive while a snapshot is being fetched are kept and replayed on top of it,
    // so a slow snapshot can never undo a newer event, and nothing sent while we were away is lost.
    let inflight = 0;
    let buffered: (() => void)[] = [];
    let retry = 0 as unknown as ReturnType<typeof setTimeout>;
    const applyDemo = (demo: Demo) =>
      setDemos((list) => {
        const mine = list.find((d) => d.id === demo.id);
        if (mine && mine.updatedAt > demo.updatedAt) return list;
        return mine ? list.map((d) => (d.id === demo.id ? demo : d)) : [...list, demo];
      });
    const removeDemo = (id: string) => setDemos((list) => list.filter((d) => d.id !== id));
    const applyAnnotation = (a: Annotation) =>
      setAnnotations((list) => {
        const mine = list.find((x) => x.id === a.id);
        if (mine && mine.updated > a.updated) return list;
        return mine ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a];
      });
    const removeAnnotation = (id: string) => setAnnotations((list) => list.filter((x) => x.id !== id));
    const applyJob = (job: Job) => setJobs((list) => [job, ...list.filter((j) => j.id !== job.id)].slice(0, 40));
    const event = (apply: () => void) => {
      apply();
      if (inflight) buffered.push(apply);
    };
    const refresh = async () => {
      clearTimeout(retry);
      inflight++;
      try {
        const [demoList, jobList, annotationList] = await Promise.all([
          api.demos(bookId),
          api.jobs(bookId),
          learn.annotations(bookId),
        ]);
        if (!alive) return;
        setDemos(demoList);
        setJobs(jobList);
        setAnnotations(annotationList);
        for (const apply of buffered) apply();
      } catch {
        if (alive) retry = setTimeout(refresh, 3000);
      } finally {
        inflight--;
        if (!inflight) buffered = [];
      }
    };
    const source = new EventSource(`/api/books/${bookId}/events`);
    refresh();
    let opened = false;
    source.onopen = () => {
      setConnected(true);
      // the first open follows the snapshot above; every later one is a reconnect that may have missed events
      if (opened) refresh();
      opened = true;
    };
    source.onerror = () => setConnected(false);
    source.addEventListener("demo", (e) => {
      const demo = JSON.parse((e as MessageEvent).data) as Demo;
      event(() => applyDemo(demo));
    });
    source.addEventListener("demo-removed", (e) => {
      const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
      event(() => removeDemo(id));
    });
    source.addEventListener("annotation", (e) => {
      const a = JSON.parse((e as MessageEvent).data) as Annotation;
      event(() => applyAnnotation(a));
    });
    source.addEventListener("annotation-removed", (e) => {
      const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
      event(() => removeAnnotation(id));
    });
    source.addEventListener("book", (e) => setBook(JSON.parse((e as MessageEvent).data) as Book));
    source.addEventListener("job", (e) => {
      const job = JSON.parse((e as MessageEvent).data) as Job;
      event(() => applyJob(job));
    });
    return () => {
      alive = false;
      clearTimeout(retry);
      source.close();
    };
  }, [bookId]);
  return { demos, setDemos, annotations, setAnnotations, jobs, connected, book };
}
