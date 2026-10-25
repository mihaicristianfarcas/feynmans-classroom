/* The API for books and their figures, and the reading-order helpers the reader uses to number
 * figures the same way the server does. */
import { figurePrefix } from "../../../shared/chapters.ts";
import { call, post } from "./client";
import type { Block, Book, BookElsewhere, Demo, FindHit, Job, Loc, Status } from "./types";

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
  /** The books other vaults have and this one doesn't. */
  elsewhere: () => call<BookElsewhere[]>("/api/books/elsewhere"),
  /** Adds a book another vault has to this one (the same book, kept once). */
  bringIn: (id: string) => post<Book>(`/api/books/elsewhere/${id}`),
  detectChapters: (id: string) => post<Job>(`/api/books/${id}/detect-chapters`),
  visualize: (
    id: string,
    input: {
      chapterId: string;
      text: string;
      request?: string;
      kind?: string;
      quality?: "quick" | "careful";
      page?: number;
      block?: number;
    },
  ) => post<Demo>(`/api/books/${id}/visualize`, input),
  regenerate: (id: string, demoId: string, feedback?: string, quality?: "quick" | "careful") =>
    post<Job>(`/api/books/${id}/demos/${demoId}/regenerate`, { feedback, quality }),
  craft: (id: string, demoId: string, feedback?: string) =>
    post<Job>(`/api/books/${id}/demos/${demoId}/craft`, { feedback }),
  deleteDemo: (id: string, demoId: string) => call(`/api/books/${id}/demos/${demoId}`, { method: "DELETE" }),
  /** Every place a phrase occurs in the book. */
  find: (id: string, q: string) => call<FindHit[]>(`/api/books/${id}/find?q=${encodeURIComponent(q)}`),
  fileUrl: (id: string) => `/api/books/${id}/file`,
  pageUrl: (id: string, demoId: string, theme: string, version: string, predict = true) =>
    `/api/books/${id}/demos/${demoId}/page?theme=${theme}&v=${encodeURIComponent(version)}${predict ? "" : "&predict=0"}`,
};

/** Position of a location in reading order (page + fraction, or block + fraction). */
export const posOf = (loc: Loc | undefined) =>
  !loc ? 0 : loc.page !== undefined ? loc.page + (loc.y ?? 0) : (loc.block ?? 0) + (loc.y ?? 0);

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
    for (const [i, demo] of list.entries()) demo.fig = `Fig ${figurePrefix(book.toc, index)}.${i + 1}`;
  }
  return out.sort((a, b) => posOf(a.anchor) - posOf(b.anchor) || a.createdAt.localeCompare(b.createdAt));
}
