/* Fetching from the web, for saving a link: only http and https, never a private, loopback or
 * link-local address (checked on the address actually connected to, so a name that resolves somewhere
 * else the second time can't get round it, and again on every redirect), within a time and size limit,
 * decompressed. The pages fetched are material, never trusted. */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

/** A failure the learner can act on: the message is shown as it is. */
export class FetchError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

export interface Fetched {
  /** Where the content finally came from (after redirects). */
  url: string;
  type: string;
  body: Buffer;
}

export interface FetchOptions {
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
  /** Tests only: let a server on this machine answer. */
  allowPrivate?: boolean;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

/** Addresses on this machine or its networks: loopback, private ranges, link-local, carrier NAT, multicast, reserved. */
export function isPrivateAddress(ip: string): boolean {
  const address = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(address) === 6) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) || address.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (address === "::" || address === "::1") return true;
    const first = Number.parseInt(address.split(":")[0] || "0", 16);
    return (
      (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
      (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
      (first & 0xff00) === 0xff00 || // multicast
      address.startsWith("::ffff:") // mapped, in hex form
    );
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return (
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 0 && p[2] === 0) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19)) ||
    p[0] >= 224
  );
}

const LOCAL_NAME = /(^|\.)(localhost|local|internal|lan|home\.arpa|intranet)$/i;

/** The link as a URL we are willing to fetch, or a FetchError saying why not. */
export function checkUrl(raw: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new FetchError("That doesn’t look like a link.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new FetchError("Only http and https links can be saved.", 400);
  if (url.username || url.password) throw new FetchError("Links with a user name or password can’t be saved.", 400);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !allowPrivate &&
    (LOCAL_NAME.test(host) || (!isIP(host) && !host.includes(".")) || (isIP(host) && isPrivateAddress(host)))
  )
    throw new FetchError("That address is on your own network, so it can’t be saved from here.", 400);
  return url;
}

/** DNS lookup that refuses names resolving to a private address (the connection uses what it returns). */
function guardedLookup(allowPrivate: boolean) {
  return (
    hostname: string,
    options: LookupOptions,
    callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "");
      const list = addresses as LookupAddress[];
      if (!list.length || (!allowPrivate && list.some((a) => isPrivateAddress(a.address)))) {
        const refused = Object.assign(new Error("private address"), { code: "EPRIVATE" });
        return callback(refused, "");
      }
      if (options.all) callback(null, list);
      else callback(null, list[0].address, list[0].family);
    });
  };
}

function decoded(res: http.IncomingMessage): Readable {
  const encoding = String(res.headers["content-encoding"] || "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return res.pipe(zlib.createGunzip());
  if (encoding === "deflate") return res.pipe(zlib.createInflate());
  if (encoding === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/** One request, no redirects followed: the response's status, headers and (for a 2xx) its body. */
function once(url: URL, options: Required<Omit<FetchOptions, "allowPrivate">> & { allowPrivate: boolean }) {
  return new Promise<{ status: number; location?: string; type: string; body: Buffer }>((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup(options.allowPrivate) as unknown as typeof dnsLookup,
        headers: {
          "user-agent": UA,
          accept: options.accept,
          "accept-language": "en,*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        const type = String(res.headers["content-type"] || "").toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, type, body: Buffer.alloc(0) });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return resolve({ status, type, body: Buffer.alloc(0) });
        }
        const length = Number(res.headers["content-length"] || 0);
        if (length > options.maxBytes) {
          req.destroy();
          return reject(new FetchError("That is too large to save.", 413));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const stream = decoded(res);
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            req.destroy();
            stream.destroy();
            reject(new FetchError("That is too large to save.", 413));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("error", () => reject(new FetchError("The site’s answer couldn’t be read.")));
        stream.on("end", () => resolve({ status, type, body: Buffer.concat(chunks) }));
      },
    );
    req.setTimeout(options.timeoutMs, () => req.destroy(new FetchError("The site didn’t answer in time.")));
    req.on("error", (error: NodeJS.ErrnoException) => {
      if (error instanceof FetchError) return reject(error);
      if (error.code === "EPRIVATE")
        return reject(new FetchError("That address is on your own network, so it can’t be saved from here.", 400));
      if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN")
        return reject(new FetchError("Couldn’t find that site. Check the link.", 400));
      reject(new FetchError("Couldn’t reach that site."));
    });
    req.end();
  });
}

/** Fetches a link, following up to five redirects, each checked like the first. */
export async function fetchUrl(raw: string, opts: FetchOptions = {}): Promise<Fetched> {
  const options = {
    accept: opts.accept || "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5",
    maxBytes: opts.maxBytes ?? 8 * 1024 * 1024,
    timeoutMs: opts.timeoutMs ?? 15_000,
    allowPrivate: !!opts.allowPrivate,
  };
  let url = checkUrl(raw, options.allowPrivate);
  for (let hop = 0; hop <= 5; hop++) {
    const res = await once(url, options);
    if (res.location) {
      url = checkUrl(new URL(res.location, url).toString(), options.allowPrivate);
      continue;
    }
    if (res.status >= 200 && res.status < 300) return { url: url.toString(), type: res.type, body: res.body };
    throw new FetchError(
      res.status === 401 || res.status === 403 || res.status === 429
        ? "That site doesn’t let readers like this one in. Copy the text into a Markdown file and add that instead."
        : res.status === 404 || res.status === 410
          ? "That page wasn’t found. Check the link."
          : `The site answered ${res.status}. Try again in a moment.`,
    );
  }
  throw new FetchError("That link redirects too many times.");
}
