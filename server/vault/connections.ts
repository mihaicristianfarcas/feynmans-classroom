/* brain/connections.jsonl: links an agent suggested between notes, and what the learner decided.
 * One JSON object per line, the latest state of each suggestion (rewritten on every decision), so an
 * agent can read what was already suggested, accepted or turned down before suggesting more. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Connection } from "../../shared/vault-types.ts";
import { atomicWrite, changed, onVaultChange, touched, VAULT, wroteItself } from "./index.ts";

const FILE = "brain/connections.jsonl";
let cache: Connection[] | null = null;
onVaultChange((rel) => {
  if (rel === FILE) cache = null;
});

export function listConnections(): Connection[] {
  if (cache) return cache;
  const path = join(VAULT, FILE);
  const out: Connection[] = [];
  if (existsSync(path))
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const c = JSON.parse(line) as Connection;
        if (c && c.id && c.from && c.to) out.push(c);
      } catch {}
    }
  return (cache = out);
}

export function saveConnections(list: Connection[], what = "connections") {
  cache = list;
  wroteItself(FILE);
  atomicWrite(join(VAULT, FILE), list.map((c) => JSON.stringify(c)).join("\n") + (list.length ? "\n" : ""));
  changed(what);
  touched(FILE);
  cache = list;
}
