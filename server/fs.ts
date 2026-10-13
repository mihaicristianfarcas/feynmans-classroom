/* Small file-system helpers the server uses everywhere: writes that never leave half a file behind,
 * JSON in and out, and joining an untrusted relative path without escaping its folder. */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, normalize, resolve, sep } from "node:path";

/** Writes a file in one step (a temp file, then a rename), making its folder if needed. */
export function atomicWrite(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

/** Parses a JSON file, or returns `fallback` when it is missing or unreadable. */
export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Writes a value as JSON, atomically. */
export const writeJson = (path: string, value: unknown) => atomicWrite(path, JSON.stringify(value, null, 1));

/** `rel` resolved inside `base`, or null if it would point outside it (`..`, absolute paths). */
export function safeJoin(base: string, rel: string): string | null {
  const root = resolve(base);
  const full = resolve(root, normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ""));
  return full === root || full.startsWith(root + sep) ? full : null;
}
