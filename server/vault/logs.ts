/* Append-only logs in log/*.jsonl, one JSON object per line: flashcard reviews (spaced repetition
 * is replayed from them), the learning journey, agent runs. The two read on every request are cached. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Activity, ReviewLog } from "../../shared/vault-types.ts";
import { wroteItself } from "./changes.ts";
import { vaultDir, vaultState } from "./current.ts";
import { changed } from "./jj.ts";

const cached = vaultState(() => ({ reviews: null as ReviewLog[] | null, activity: null as Activity[] | null }));

/** Every entry of log/<name>; unreadable lines are skipped. */
export function readLog<T>(name: string): T[] {
  const path = join(vaultDir(), "log", name);
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {}
  }
  return out;
}
export function appendLog(name: string, entry: unknown) {
  mkdirSync(join(vaultDir(), "log"), { recursive: true });
  wroteItself(`log/${name}`);
  appendFileSync(join(vaultDir(), "log", name), `${JSON.stringify(entry)}\n`);
}
export function reviews(): ReviewLog[] {
  const c = cached();
  c.reviews ??= readLog<ReviewLog>("reviews.jsonl");
  return c.reviews;
}
export function activity(): Activity[] {
  const c = cached();
  c.activity ??= readLog<Activity>("activity.jsonl");
  return c.activity;
}
export function logReview(entry: ReviewLog) {
  const log = reviews(); // load first: loading after the append would read the new line and then add it twice
  appendLog("reviews.jsonl", entry);
  log.push(entry);
  changed(`review ${entry.card}`);
}
export function logActivity(entry: Omit<Activity, "ts"> & { ts?: number }) {
  const full: Activity = { ts: Date.now(), ...entry };
  const log = activity();
  appendLog("activity.jsonl", full);
  log.push(full);
  changed("activity");
  return full;
}

/** Forgets a cached log after the file changed outside the app. */
export function forgetLog(rel: string) {
  if (rel === "log/reviews.jsonl") cached().reviews = null;
  else if (rel === "log/activity.jsonl") cached().activity = null;
}
