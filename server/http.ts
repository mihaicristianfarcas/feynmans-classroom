/* HTTP helpers shared by the routes: reading JSON bodies, sending files with the right type and
 * headers, joining untrusted paths safely, streaming live events, and the guard that keeps the API
 * to the learner's own machine. */
import { createReadStream, statSync } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";
import type { Context, MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import { type Channel, subscribe } from "./events.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

/** Headers for files that are content, never code (book images, pictures): no scripts even when opened directly. */
export const CONTENT_ONLY = {
  "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
};

/** The request's JSON body, or an empty object when there is none (or it doesn't parse). */
export async function readBody<T>(c: Context): Promise<T> {
  return ((await c.req.json().catch(() => ({}))) || {}) as T;
}

/** Streams a file with its content type and length. */
export function sendFile(path: string, headers: Record<string, string> = {}) {
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-type": TYPES[extname(path).toLowerCase()] || "application/octet-stream",
      "content-length": String(statSync(path).size),
      ...headers,
    },
  });
}

/** Server-sent events from one channel (a book's id, or "global"), with a hello and a ping every 20 s. */
export function eventStream(c: Context, channel: Channel) {
  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribe(channel, (event) => {
      stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) }).catch(() => {});
    });
    // say hello at once, so proxies flush the headers and the client knows it is connected
    await stream.writeSSE({ event: "hello", data: "{}" });
    const ping = setInterval(() => stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {}), 20000);
    await new Promise<void>((done) => stream.onAbort(() => done()));
    clearInterval(ping);
    unsubscribe();
  });
}

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const EXTRA_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
const hostAllowed = (host: string) => LOCAL.has(host) || EXTRA_HOSTS.has(host);
const hostnameOf = (hostHeader: string) => hostHeader.toLowerCase().replace(/:\d+$/, "");

/**
 * The API has no accounts: it trusts whoever can reach it, so it only answers the learner's own
 * machine. Requests must name a local host (which defeats DNS rebinding), and requests that change
 * something must not come from another website (cross-site form posts and fetches). Hosts in
 * ALLOWED_HOSTS (comma-separated) count as local, for those who serve it on a network on purpose.
 */
export function localOnly(): MiddlewareHandler {
  return async (c, next) => {
    if (!hostAllowed(hostnameOf(c.req.header("host") || ""))) return c.json({ error: "unknown host" }, 403);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin) {
        let host = "";
        try {
          host = new URL(origin).hostname.toLowerCase();
        } catch {}
        if (!hostAllowed(host) && !hostAllowed(`[${host}]`))
          return c.json({ error: "requests from other sites are not allowed" }, 403);
      }
      if (c.req.header("sec-fetch-site") === "cross-site")
        return c.json({ error: "requests from other sites are not allowed" }, 403);
    }
    await next();
  };
}
