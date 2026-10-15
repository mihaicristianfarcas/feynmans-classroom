/* Live updates: a tiny in-process publish/subscribe. Work in progress (a figure being drawn, an
 * answer arriving, a job's progress, a file an agent changed) is published to a channel, and the
 * open pages subscribed to it over server-sent events (see eventStream in http.ts) follow along. */

/** A book's id (events about that book) or "global" (the vault, agents, anything app-wide). */
export type Channel = string;

export interface BookEvent {
  type: "demo" | "demo-removed" | "job" | "book" | "annotation" | "annotation-removed" | "vault" | "vaults" | "agent";
  data: unknown;
}
type Listener = (event: BookEvent) => void;

const listeners = new Map<Channel, Set<Listener>>();

/** Calls `listener` with every event on `channel`. Returns an unsubscribe function. */
export function subscribe(channel: Channel, listener: Listener) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(listener);
  return () => {
    listeners.get(channel)?.delete(listener);
  };
}

/** Sends an event to everyone on `channel` (a failing listener doesn't stop the others). */
export function publish(channel: Channel, event: BookEvent) {
  for (const listener of listeners.get(channel) || []) {
    try {
      listener(event);
    } catch {}
  }
}
