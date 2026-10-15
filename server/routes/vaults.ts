/* Routes for outside vaults (Obsidian's, or any folder of Markdown): the list (add, rename, forget),
 * each vault's files and folders, a note with its links and backlinks, resolving a link (for opening
 * and embedding), saving, making, renaming and deleting, attachments (served as content only, with
 * ranges so sound and video can seek), tags, search and the graph. Changes the app makes are announced
 * like the ones the watcher sees, so every open page follows both. A synced vault also has the routes its
 * browser uses to keep the server's copy and the learner's folder in step (vaults/sync.ts). */
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";
import type { Context, Hono } from "hono";
import { NotFound } from "../errors.ts";
import { CONTENT_ONLY, readBody, sendFile } from "../http.ts";
import { linkTargets } from "../vault/links.ts";
import { appTarget } from "../vaults/app-links.ts";
import { moveConnections } from "../vaults/connections.ts";
import {
  Conflict,
  createFolder,
  createNote,
  move,
  newNoteFolder,
  saveAttachment,
  saveNote,
  trash,
} from "../vaults/edit.ts";
import {
  addSyncedVault,
  addVault,
  announceChanges,
  getVault,
  listVaults,
  removeVault,
  renameVault,
  vaultsWithStatus,
} from "../vaults/index.ts";
import { deleteFile, manifest, readPath, writeFile } from "../vaults/sync.ts";
import { cleanRel, kindOf } from "../vaults/vault.ts";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  flac: "audio/flac",
  webm: "video/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
  ogv: "video/ogg",
  md: "text/plain; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

/** A file of the vault as content: never run (no scripts, sandboxed), ranges for sound and video. */
function serveFile(c: Context, full: string) {
  const ext = extname(full).slice(1).toLowerCase();
  const type = TYPES[ext];
  const size = statSync(full).size;
  const headers: Record<string, string> = {
    "content-type": type || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, no-cache",
    "x-content-type-options": "nosniff",
    // a PDF opens in the browser's viewer, which a sandbox would block; it still may not run anything
    "content-security-policy":
      ext === "pdf"
        ? "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
        : CONTENT_ONLY["content-security-policy"],
  };
  if (!type) headers["content-disposition"] = "attachment";
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") || "");
  let start = 0;
  let end = size - 1;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size)
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["content-length"] = String(end - start + 1);
  const stream = size ? (Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream) : null;
  return new Response(stream, { status: range && (range[1] || range[2]) ? 206 : 200, headers });
}

export function vaultRoutes(app: Hono) {
  app.get("/api/vaults", (c) => c.json(vaultsWithStatus()));
  app.post("/api/vaults", async (c) => {
    const b = await readBody<{ path?: string; name?: string; synced?: boolean }>(c);
    return c.json(b.synced ? addSyncedVault(b.name || "") : addVault(b.path || "", b.name));
  });

  /** A synced vault's copy, file by file, for the browser that keeps it in step with the folder. */
  const synced = (c: Context) => {
    const id = c.req.param("id") || "";
    if (!listVaults().some((v) => v.id === id && v.synced)) throw new NotFound("no such synced vault");
    return getVault(id);
  };
  app.get("/api/vaults/:id/sync", (c) => c.json(manifest(synced(c))));
  app.get("/api/vaults/:id/sync/file", (c) => {
    const path = readPath(synced(c), c.req.query("path") || "");
    if (!existsSync(path)) throw new NotFound("no such file");
    return sendFile(path, { ...CONTENT_ONLY, "content-type": "application/octet-stream", "cache-control": "no-store" });
  });
  app.put("/api/vaults/:id/sync/file", async (c) => {
    const vault = synced(c);
    return c.json(writeFile(vault, c.req.query("path") || "", new Uint8Array(await c.req.arrayBuffer())));
  });
  app.delete("/api/vaults/:id/sync/file", (c) => {
    deleteFile(synced(c), c.req.query("path") || "");
    return c.json({ ok: true });
  });
  app.patch("/api/vaults/:id", async (c) => {
    const b = await readBody<{ name: string }>(c);
    return c.json(renameVault(c.req.param("id"), b.name || ""));
  });
  app.delete("/api/vaults/:id", (c) => {
    removeVault(c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/vaults/:id/rescan", (c) => {
    const vault = getVault(c.req.param("id"));
    const changes = vault.reconcile();
    announceChanges(vault.id, changes);
    return c.json({ changes: changes.length });
  });

  /** Every folder and file, for the file tree. */
  app.get("/api/vaults/:id/tree", (c) => {
    const vault = getVault(c.req.param("id"));
    return c.json({
      folders: [...vault.folders].sort(),
      files: [...vault.files.values()].map((e) => ({ path: e.path, name: e.name, kind: e.kind, mtime: e.mtime })),
    });
  });

  /** A note: its text, properties, outline, and every link in and out of it. */
  app.get("/api/vaults/:id/note", (c) => {
    const vault = getVault(c.req.param("id"));
    const path = cleanRel(c.req.query("path") || "");
    const entry = path ? vault.files.get(path) : undefined;
    if (!path || !entry) throw new NotFound("no such note in this vault");
    if (entry.kind !== "note")
      return c.json({ path, name: entry.name, kind: entry.kind, backlinks: vault.backlinks(path) });
    return c.json({
      path,
      name: entry.name,
      kind: entry.kind,
      text: entry.text,
      bodyStart: entry.bodyStart,
      properties: entry.data,
      tags: entry.tags,
      aliases: entry.aliases,
      headings: entry.headings,
      mtime: entry.mtime,
      outgoing: vault.outgoing(path).map((o) => {
        const app = o.path || o.md ? null : appTarget(o.target, o.sub);
        return app ? { ...o, app: { kind: app.kind, title: app.title } } : o;
      }),
      backlinks: vault.backlinks(path),
      mentions: vault.mentions(path),
    });
  });

  /** Where a link goes from a note (path null: nowhere yet); for a note, with the part of its text an embed shows. */
  app.get("/api/vaults/:id/resolve", (c) => {
    const vault = getVault(c.req.param("id"));
    const from = cleanRel(c.req.query("from") || "") || "";
    const path = vault.resolve(c.req.query("target") || "", from, c.req.query("md") === "1");
    // a link to a note not made yet is an ordinary answer (it shows as such, and opening it makes the note)
    if (!path) return c.json({ path: null });
    const entry = vault.files.get(path)!;
    const sub = c.req.query("sub") || undefined;
    return c.json({
      path,
      name: entry.name,
      kind: entry.kind,
      ...(entry.kind === "note" && c.req.query("body") === "1" ? { body: vault.section(path, sub) } : {}),
    });
  });

  /** Names links can use, for completing [[ in the editor: the vault's, and the app's concepts and books. */
  app.get("/api/vaults/:id/targets", (c) => {
    const vault = getVault(c.req.param("id"));
    const own = new Set([...vault.files.values()].map((e) => e.name.toLowerCase()));
    return c.json([
      ...[...vault.files.values()].flatMap((e) => [
        { title: e.name, kind: e.kind, detail: e.path },
        ...e.aliases.map((a) => ({ title: a, kind: "alias", detail: e.path })),
      ]),
      // the app's concepts and books (a note of the vault by the same name wins)
      ...linkTargets()
        .filter((t) => (t.kind === "concept" || t.kind === "book") && !own.has(t.title.toLowerCase()))
        .map((t) => ({
          title: t.title,
          kind: t.kind,
          detail: t.kind === "book" ? "a book in the Library" : "a concept",
        })),
    ]);
  });

  app.get("/api/vaults/:id/file", (c) => {
    const vault = getVault(c.req.param("id"));
    const path = cleanRel(c.req.query("path") || "");
    const full = path && vault.files.has(path) ? vault.abs(path) : null;
    if (!full) throw new NotFound("no such file in this vault");
    return serveFile(c, full);
  });

  app.put("/api/vaults/:id/note", async (c) => {
    const vault = getVault(c.req.param("id"));
    const b = await readBody<{ path: string; text: string; base?: string }>(c);
    try {
      const change = saveNote(vault, b.path, String(b.text ?? ""), b.base);
      announceChanges(vault.id, [change]);
      return c.json({ ...change, mtime: vault.files.get(change.path)?.mtime });
    } catch (error) {
      if (error instanceof Conflict) return c.json({ error: error.message, text: error.text }, 409);
      throw error;
    }
  });

  app.post("/api/vaults/:id/notes", async (c) => {
    const vault = getVault(c.req.param("id"));
    const b = await readBody<{ title?: string; folder?: string; from?: string }>(c);
    const change = createNote(vault, b);
    announceChanges(vault.id, [change]);
    return c.json(change);
  });

  app.get("/api/vaults/:id/new-note-folder", (c) =>
    c.json({ folder: newNoteFolder(getVault(c.req.param("id")), c.req.query("from") || undefined) }),
  );

  app.post("/api/vaults/:id/folders", async (c) => {
    const vault = getVault(c.req.param("id"));
    const change = createFolder(vault, (await readBody<{ path: string }>(c)).path || "");
    announceChanges(vault.id, [change]);
    return c.json(change);
  });

  app.post("/api/vaults/:id/move", async (c) => {
    const vault = getVault(c.req.param("id"));
    const b = await readBody<{ from: string; to: string }>(c);
    const changes = move(vault, b.from, b.to);
    announceChanges(vault.id, changes);
    const to = cleanRel(b.to) || "";
    const path = vault.files.has(`${to}.md`) && !vault.files.has(to) ? `${to}.md` : to;
    moveConnections(vault, cleanRel(b.from) || "", path);
    return c.json({ path, changes: changes.length });
  });

  app.post("/api/vaults/:id/trash", async (c) => {
    const vault = getVault(c.req.param("id"));
    const changes = trash(vault, (await readBody<{ path: string }>(c)).path || "");
    announceChanges(vault.id, changes);
    return c.json({ changes: changes.length });
  });

  app.post("/api/vaults/:id/attachments", async (c) => {
    const vault = getVault(c.req.param("id"));
    const b = await readBody<{ data: string; name?: string; note?: string }>(c);
    try {
      const saved = saveAttachment(vault, b.data, b.name, cleanRel(b.note || "") || undefined);
      announceChanges(vault.id, [saved.change]);
      return c.json({ path: saved.path, link: saved.link, embed: saved.embed, kind: kindOf(saved.path) });
    } catch (error) {
      const message = (error as Error).message;
      return c.json({ error: message }, message.includes("too large") ? 413 : 400);
    }
  });

  app.get("/api/vaults/:id/tags", (c) => c.json(getVault(c.req.param("id")).tags()));
  app.get("/api/vaults/:id/search", (c) => c.json(getVault(c.req.param("id")).search(c.req.query("q") || "")));
  app.get("/api/vaults/:id/graph", (c) => c.json(getVault(c.req.param("id")).graph(c.req.query("files") === "1")));
}
