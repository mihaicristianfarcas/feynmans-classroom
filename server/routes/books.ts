/* Routes for books: the library, uploading (any PDF, EPUB, Markdown or text file; one another vault
 * has already is brought in as it is), the books of the other vaults and bringing one in, a book's
 * file, text blocks and pictures, finding its chapters, its live event stream, and reading sessions. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { formatOf, MAX_BOOK_BYTES } from "../../shared/book-files.ts";
import { findInBook } from "../books/find.ts";
import { booksElsewhere, bookWithFile, bringBook, elsewhereById } from "../books/shared.ts";
import { bookDir, bookFolder, deleteBook, getBlocks, getBook, listBooks, listDemos } from "../books/store.ts";
import { safeJoin } from "../fs.ts";
import { CONTENT_ONLY, eventStream, readBody, sendFile } from "../http.ts";
import { detectChapters } from "../ingest/chapters.ts";
import { fileHash, ingestBook } from "../ingest/index.ts";
import { queue } from "../jobs.ts";
import { bookNote } from "../learn/notes.ts";
import { bookProgress, lastTouched } from "../learn/progress.ts";
import { type ReadingPing, recordReading } from "../learn/reading.ts";
import { activity, docs, logActivity } from "../vault/index.ts";
import { exportBook } from "../vault/library.ts";

export function bookRoutes(app: Hono) {
  /** Every book, with how many of its figures are ready (the chapter's and those drawn in the margin) and
   * how many are being made, how far through it the learner is, and when they last did anything with it. */
  app.get("/api/books", (c) => {
    const acts = activity();
    const drawn = docs.list("annotation").filter((a) => a.type === "visualize" && a.status === "ready");
    const elsewhere = elsewhereById();
    return c.json(
      listBooks().map((book) => {
        const demos = listDemos(book.id);
        return {
          ...book,
          alsoIn: elsewhere.get(book.id) || [],
          demoCount:
            demos.filter((d) => d.status === "ready").length + drawn.filter((a) => a.source.bookId === book.id).length,
          building: demos.filter((d) => !["ready", "failed"].includes(d.status)).length,
          progress: bookProgress(book.id),
          lastOpened: lastTouched(book.id, acts),
        };
      }),
    );
  });

  /** Titles and chapters only, for pickers. */
  app.get("/api/books-lite", (c) =>
    c.json(
      listBooks().map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        toc: b.toc.map((t) => ({ id: t.id, title: t.title })),
      })),
    ),
  );

  app.post(
    "/api/books",
    bodyLimit({
      maxSize: MAX_BOOK_BYTES + 1024 * 1024,
      onError: (c) => c.json({ error: "file too large (200 MB max)" }, 413),
    }),
    async (c) => {
      const file = (await c.req.parseBody()).file;
      if (!(file instanceof File)) return c.json({ error: "send the book as multipart field 'file'" }, 400);
      if (file.size > MAX_BOOK_BYTES) return c.json({ error: "file too large (200 MB max)" }, 413);
      if (!formatOf(file.name)) return c.json({ error: "Upload a PDF, EPUB, Markdown or plain-text book." }, 415);
      const data = Buffer.from(await file.arrayBuffer());
      // a file this vault has already opens as it is; one another vault has comes in as the same book
      const known = bookWithFile(fileHash(data));
      if (known?.here) return c.json(known.book);
      if (known) return c.json(bringIn(known.book.id));
      const book = await ingestBook({ name: file.name, data });
      if (book.status === "error") return c.json({ error: book.error, book }, 422);
      try {
        exportBook(book);
      } catch (error) {
        console.warn("[vault] export failed:", (error as Error).message);
      }
      logActivity({ type: "book", bookId: book.id, text: `Added ${book.title}` });
      return c.json(book);
    },
  );

  /** The books other vaults have and this one doesn't, with the vaults that have them. */
  app.get("/api/books/elsewhere", (c) =>
    c.json(
      booksElsewhere().map(({ book, vaults }) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        format: book.format,
        pageCount: book.pageCount,
        chapters: book.toc.length,
        vaults,
      })),
    ),
  );
  /** Brings a book another vault has into this one (the same book, kept once). */
  app.post("/api/books/elsewhere/:id", (c) => c.json(bringIn(c.req.param("id"))));

  app.get("/api/books/:id", (c) => {
    const book = getBook(c.req.param("id"));
    return book ? c.json({ ...book, folder: bookFolder(book.id) }) : c.json({ error: "not found" }, 404);
  });

  app.delete("/api/books/:id", (c) => {
    const id = c.req.param("id");
    queue.cancelBook(id);
    deleteBook(id);
    return c.json({ ok: true });
  });

  app.get("/api/books/:id/file", (c) => {
    const book = getBook(c.req.param("id"));
    if (!book) return c.json({ error: "not found" }, 404);
    return sendFile(join(bookDir(book.id), book.file), { "cache-control": "private, max-age=3600" });
  });

  app.get("/api/books/:id/blocks", (c) => c.json(getBlocks(c.req.param("id"))));
  /** Every place a phrase occurs in the book, for the reader's find bar. */
  app.get("/api/books/:id/find", (c) => c.json(findInBook(c.req.param("id"), c.req.query("q") || "")));

  /** Pictures inside a reflowable book. */
  app.get("/api/books/:id/assets/*", (c) => {
    const id = c.req.param("id");
    const rel = decodeURIComponent(c.req.path.split(`/api/books/${id}/assets/`)[1] || "");
    const path = safeJoin(join(bookDir(id), "assets"), rel);
    if (!path || !existsSync(path)) return c.json({ error: "not found" }, 404);
    return sendFile(path, { "cache-control": "private, max-age=86400", ...CONTENT_ONLY });
  });

  /** Asks a model where the chapters are, for books without a usable outline. */
  app.post("/api/books/:id/detect-chapters", (c) => c.json(detectChapters(c.req.param("id"))));

  /** The note a book's reading session writes into ("<title> — notes", made on first use). */
  app.post("/api/books/:id/note", (c) => c.json(bookNote(c.req.param("id"))));

  app.get("/api/books/:id/events", (c) => eventStream(c, c.req.param("id")));

  /** The reader's pings while a book is open (they become reading sessions in the journey). */
  app.post("/api/activity", async (c) => {
    const ping = await readBody<ReadingPing & { type: string }>(c);
    if (ping.type !== "read" || !ping.bookId) return c.json({ ok: false }, 400);
    return c.json({ ok: true, minutes: recordReading(ping) });
  });
}

/** Brings a book another vault has into the open one, and records it in the journey. */
function bringIn(bookId: string) {
  const book = bringBook(bookId);
  logActivity({ type: "book", bookId: book.id, text: `Added ${book.title}` });
  return book;
}
