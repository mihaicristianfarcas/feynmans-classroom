/* What a sync does to each file, from the folder on disk, the server's copy, and the base (both sides as
 * they were after the last sync). A side changed if its size or time differs from the base. One changed
 * side wins; when both changed, the contents are compared ("compare": same is fine, different keeps both).
 * An empty copy never deletes anything on disk: that's a copy gone (the vault removed from the app), not
 * every file deleted. */
import type { Base } from "./store";

export type Stat = [size: number, mtime: number];

export type Action =
  | "upload" // disk → copy
  | "download" // copy → disk
  | "delete-copy"
  | "delete-disk"
  | "compare" // both changed and both exist
  | "forget"; // gone on both sides

const same = (a?: Stat, b?: Stat) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

export function plan(disk: Map<string, Stat>, copy: Map<string, Stat>, base: Base): [string, Action][] {
  const out: [string, Action][] = [];
  for (const path of new Set([...disk.keys(), ...copy.keys(), ...Object.keys(base)])) {
    const d = disk.get(path);
    const c = copy.get(path);
    const b = base[path];
    const dChanged = b ? !same(d, b.d) : !!d;
    const cChanged = b ? !same(c, b.c) : !!c;
    if (!dChanged && !cChanged) continue;
    if (!d && !c) out.push([path, "forget"]);
    else if (dChanged && !cChanged) out.push([path, d ? "upload" : "delete-copy"]);
    else if (cChanged && !dChanged) {
      if (c || copy.size) out.push([path, c ? "download" : "delete-disk"]);
    } else if (d && c) out.push([path, "compare"]);
    else out.push([path, d ? "upload" : "download"]);
  }
  return out;
}

/** "Energy.md" → "Energy (app copy).md", for the app's version when both sides changed a file. */
export function conflictName(path: string, taken: (p: string) => boolean): string {
  const slash = path.lastIndexOf("/") + 1;
  const dot = path.lastIndexOf(".");
  const [stem, ext] = dot > slash ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
  let name = `${stem} (app copy)${ext}`;
  for (let n = 2; taken(name); n++) name = `${stem} (app copy ${n})${ext}`;
  return name;
}
