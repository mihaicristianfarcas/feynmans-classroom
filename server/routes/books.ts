/* Routes for books: the library, uploading (any PDF, EPUB, Markdown or text file), saving a link (an
 * article or a PDF), renaming a book or moving it to another topic, a book's file, cover, text blocks
 * and pictures, finding its chapters, its live event stream, and reading sessions. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isTopic } from "../../shared/topics.ts";
import { findInBook } from "../books/find.ts";
import { announceBook, shelveSoon } from "../books/shelf.ts";
import { bookDir, bookFolder, deleteBook, getBlocks, getBook, listBooks, listDemos, saveBook } from "../books/store.ts";
import type { Book } from "../books/types.ts";
import { safeJoin } from "../fs.ts";
import { CONTENT_ONLY, eventStream, readBody, sendFile } from "../http.ts";
import { detectChapters } from "../ingest/chapters.ts";
import { FetchError } from "../ingest/fetch.ts";
import { formatOf, ingestBook } from "../ingest/index.ts";
import { saveLink } from "../ingest/web.ts";
import { queue } from "../jobs.ts";
import { bookNote } from "../learn/notes.ts";
import { type ReadingPing, recordReading } from "../learn/reading.ts";
import { logActivity } from "../vault/index.ts";
import { exportBook } from "../vault/library.ts";

const MAX_UPLOAD = 200 * 1024 * 1024;

/** A new book is in: its text written out for the vault, the activity logged, and its topic sorted soon. */
function arrived(book: Book) {
  try {
    exportBook(book);
  } catch (error) {
    console.warn("[vault] export failed:", (error as Error).message);
  }
  logActivity({ type: "book", bookId: book.id, text: `Added ${book.title}` });
  shelveSoon(book.id);
  announceBook(book);
}

export function bookRoutes(app: Hono) {
  /** Every book, with how many of its figures are ready and how many are being made. */
  app.get("/api/books", (c) =>
    c.json(
      listBooks().map((book) => {
        const demos = listDemos(book.id);
        return {
          ...book,
          demoCount: demos.filter((d) => d.status === "ready").length,
          building: demos.filter((d) => !["ready", "failed"].includes(d.status)).length,
        };
      }),
    ),
  );

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
      maxSize: MAX_UPLOAD + 1024 * 1024,
      onError: (c) => c.json({ error: "file too large (200 MB max)" }, 413),
    }),
    async (c) => {
      const file = (await c.req.parseBody()).file;
      if (!(file instanceof File)) return c.json({ error: "send the book as multipart field 'file'" }, 400);
      if (file.size > MAX_UPLOAD) return c.json({ error: "file too large (200 MB max)" }, 413);
      if (!formatOf(file.name)) return c.json({ error: "Upload a PDF, EPUB, Markdown or plain-text book." }, 415);
      const book = await ingestBook({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
      if (book.status === "error") return c.json({ error: book.error, book }, 422);
      arrived(book);
      return c.json(book);
    },
  );

  /** Saves what a link points at: a web page as an article (its pictures downloaded), or a PDF. */
  app.post("/api/books/link", async (c) => {
    const { url } = await readBody<{ url?: string }>(c);
    if (!url?.trim()) return c.json({ error: "send the link as { url }" }, 400);
    try {
      const book = await saveLink(url, (pdf) => ingestBook(pdf));
      if (book.status === "error") return c.json({ error: book.error, book }, 422);
      arrived(book);
      return c.json(book);
    } catch (error) {
      if (error instanceof FetchError) return c.json({ error: error.message }, error.status as 400);
      throw error;
    }
  });

  /** Renames a book or moves it to another topic. */
  app.patch("/api/books/:id", async (c) => {
    const book = getBook(c.req.param("id"));
    if (!book) return c.json({ error: "not found" }, 404);
    const patch = await readBody<{ title?: string; topic?: string }>(c);
    if (typeof patch.title === "string") {
      const title = patch.title.replace(/\s+/g, " ").trim().slice(0, 300);
      if (!title) return c.json({ error: "a book needs a title" }, 400);
      book.title = title;
    }
    if (patch.topic !== undefined) {
      if (!isTopic(patch.topic)) return c.json({ error: "unknown topic" }, 400);
      book.topic = patch.topic;
    }
    saveBook(book);
    announceBook(book);
    return c.json(book);
  });

  /** A book's cover picture (an EPUB's own, an article's lead picture). */
  app.get("/api/books/:id/cover", (c) => {
    const book = getBook(c.req.param("id"));
    const path = book?.cover ? safeJoin(bookDir(book.id), book.cover) : null;
    if (!path || !existsSync(path)) return c.json({ error: "no cover" }, 404);
    return sendFile(path, { "cache-control": "private, max-age=86400", ...CONTENT_ONLY });
  });

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
    // a saved article's page is sanitized, and served so that nothing in it could run all the same
    return sendFile(join(bookDir(book.id), book.file), {
      "cache-control": "private, max-age=3600",
      ...(book.format === "web" ? CONTENT_ONLY : {}),
    });
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
