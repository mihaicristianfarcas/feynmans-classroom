import { useEffect, useState } from "react";

export interface Loc {
  page?: number;
  y?: number;
  block?: number;
}
export interface TocEntry {
  id: string;
  title: string;
  subtitle?: string;
  start: Loc;
  end: Loc;
  sections: { id: string; title: string; start: Loc }[];
}
export interface Book {
  id: string;
  title: string;
  author?: string;
  format: "pdf" | "epub" | "text";
  pageCount?: number;
  blockCount?: number;
  toc: TocEntry[];
  createdAt: string;
  status: "ingesting" | "ready" | "error";
  error?: string;
  tocSource?: "outline" | "nav" | "headings" | "chunks" | "codex";
  demoCount?: number;
  building?: number;
}
export interface Brief {
  slug: string;
  eyebrow: string;
  title: string;
  caption: string;
  anchorQuote: string;
  page: number;
  idea: string;
  predict: unknown;
}
export type DemoStatus = "queued" | "planning" | "building" | "checking" | "ready" | "failed";
export interface Demo {
  id: string;
  bookId: string;
  chapterId: string;
  status: DemoStatus;
  brief: Brief;
  anchor: Loc & { quote: string; matched: boolean };
  fig: string;
  createdAt: string;
  updatedAt: string;
  activity?: string;
  error?: string;
  attempts: number;
  source?: "chapter" | "selection";
}
export interface Job {
  id: string;
  bookId: string;
  kind: "plan" | "build";
  chapterId?: string;
  demoId?: string;
  status: "queued" | "running" | "done" | "failed";
  message?: string;
}
export interface Block {
  id: number;
  chapter: number;
  tag: string;
  html: string;
  text: string;
}
export interface Status {
  codex: { installed: boolean; version?: string; loggedIn: boolean; detail?: string };
  chrome: boolean;
  queue: { running: number; waiting: number; concurrency: number };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || `${response.status} ${response.statusText}`);
  return data as T;
}
const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

export const api = {
  status: () => call<Status>("/api/status"),
  books: () => call<Book[]>("/api/books"),
  book: (id: string) => call<Book>(`/api/books/${id}`),
  blocks: (id: string) => call<Block[]>(`/api/books/${id}/blocks`),
  demos: (id: string) => call<Demo[]>(`/api/books/${id}/demos`),
  jobs: (id: string) => call<Job[]>(`/api/books/${id}/jobs`),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<Book>("/api/books", { method: "POST", body: form });
  },
  deleteBook: (id: string) => call(`/api/books/${id}`, { method: "DELETE" }),
  generate: (id: string, chapterId: string, count?: number) => post<Job>(`/api/books/${id}/chapters/${chapterId}/generate`, { count }),
  detectChapters: (id: string) => post<Job>(`/api/books/${id}/detect-chapters`),
  visualize: (id: string, chapterId: string, text: string) => post<Job>(`/api/books/${id}/visualize`, { chapterId, text }),
  regenerate: (id: string, demoId: string, feedback?: string) => post<Job>(`/api/books/${id}/demos/${demoId}/regenerate`, { feedback }),
  deleteDemo: (id: string, demoId: string) => call(`/api/books/${id}/demos/${demoId}`, { method: "DELETE" }),
  fileUrl: (id: string) => `/api/books/${id}/file`,
  pageUrl: (id: string, demoId: string, theme: string, version: string, predict = true) => `/api/books/${id}/demos/${demoId}/page?theme=${theme}&v=${encodeURIComponent(version)}${predict ? "" : "&predict=0"}`,
};

/** Position of a location in reading order (page + fraction, or block + fraction). */
export const posOf = (loc: Loc | undefined) => (!loc ? 0 : loc.page !== undefined ? loc.page + (loc.y ?? 0) : (loc.block ?? 0) + (loc.y ?? 0));

/** Fig numbers in reading order inside each chapter, same rule as the server. */
export function withFigs(book: Book, demos: Demo[]): Demo[] {
  const out = demos.map((d) => ({ ...d }));
  const groups = new Map<string, Demo[]>();
  for (const demo of out) {
    // a demo belongs to the chapter its anchor sits in
    if (demo.anchor.matched) {
      const at = posOf(demo.anchor);
      demo.chapterId = [...book.toc].reverse().find((entry) => posOf(entry.start) <= at + 1e-6)?.id || demo.chapterId;
    }
    if (!groups.has(demo.chapterId)) groups.set(demo.chapterId, []);
    groups.get(demo.chapterId)!.push(demo);
  }
  for (const [chapterId, list] of groups) {
    const index = book.toc.findIndex((entry) => entry.id === chapterId);
    list.sort((a, b) => posOf(a.anchor) - posOf(b.anchor) || a.createdAt.localeCompare(b.createdAt));
    list.forEach((demo, i) => (demo.fig = `Fig ${index + 1}.${i + 1}`));
  }
  return out.sort((a, b) => posOf(a.anchor) - posOf(b.anchor) || a.createdAt.localeCompare(b.createdAt));
}

/** Demos and jobs for a book, kept live over server-sent events. */
export function useBookLive(bookId: string) {
  const [demos, setDemos] = useState<Demo[]>([]);
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
    const applyJob = (job: Job) => setJobs((list) => [job, ...list.filter((j) => j.id !== job.id)].slice(0, 40));
    const event = (apply: () => void) => {
      apply();
      if (inflight) buffered.push(apply);
    };
    const refresh = async () => {
      clearTimeout(retry);
      inflight++;
      try {
        const [demoList, jobList] = await Promise.all([api.demos(bookId), api.jobs(bookId)]);
        if (!alive) return;
        setDemos(demoList);
        setJobs(jobList);
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
  return { demos, setDemos, jobs, connected, book };
}

export function useTheme(): ["light" | "dark", (t: "light" | "dark") => void] {
  const initial = (() => {
    try {
      const saved = localStorage.getItem("classroom-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "light";
  })();
  const [theme, setTheme] = useState<"light" | "dark">(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("classroom-theme", theme);
    } catch {}
  }, [theme]);
  return [theme, setTheme];
}
