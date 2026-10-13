/* A small semaphore for model calls: at most `settings.concurrency` run at once (3 by default), the
 * rest wait their turn, so a burst of requests never hammers the learner's plan. */
import { getSettings } from "../settings.ts";

let running = 0;
const waiting: (() => void)[] = [];

/** Runs `work` when a slot is free. */
export async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= getSettings().concurrency) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Calls running and waiting right now (shown in Settings). */
export const llmLoad = () => ({ running, waiting: waiting.length });
