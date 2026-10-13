/* Pictures in notes, kept in attachments/: pasted or dropped into a note, or captured from a book's
 * page. They are served only from that folder, and only as pictures. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileNameOf } from "../../shared/links.ts";
import { safeJoin } from "../fs.ts";
import { VAULT } from "./files.ts";
import { changed } from "./git.ts";

const PICTURE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
const MAX_BYTES = 12 * 1024 * 1024;

/** The absolute path of an existing attachment (a vault-relative path under attachments/), or null. */
export function attachmentPath(rel: string): string | null {
  const clean = rel.replace(/\\/g, "/");
  if (!clean.startsWith("attachments/")) return null;
  const path = safeJoin(VAULT, clean);
  return path && existsSync(path) ? path : null;
}

/** The content type of a picture file, or undefined if it isn't one. */
export const pictureType = (path: string): string | undefined => PICTURE_TYPES[extname(path).slice(1).toLowerCase()];

/** Saves a picture sent as a data URL under a free name; throws a message for the learner when it can't. */
export function saveAttachment(dataUrl: string, name?: string): { path: string; name: string } {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) throw new Error("send a PNG, JPEG, WebP or GIF data URL");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_BYTES) throw new Error("picture too large (12 MB max)");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, ".");
  const base = fileNameOf((name || `Pasted ${stamp}`).replace(/\.(png|jpe?g|webp|gif)$/i, ""), 90);
  let rel = `attachments/${base}.${ext}`;
  for (let n = 2; existsSync(join(VAULT, rel)); n++) rel = `attachments/${base} ${n}.${ext}`;
  mkdirSync(join(VAULT, "attachments"), { recursive: true });
  writeFileSync(join(VAULT, rel), bytes);
  changed(`attachment ${base}`);
  return { path: rel, name: rel.slice("attachments/".length) };
}
