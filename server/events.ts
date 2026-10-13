export interface BookEvent {
  type: "demo" | "demo-removed" | "job" | "book" | "annotation" | "annotation-removed" | "vault" | "agent";
  data: unknown;
}
type Listener = (event: BookEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(bookId: string, listener: Listener) {
  if (!listeners.has(bookId)) listeners.set(bookId, new Set());
  listeners.get(bookId)!.add(listener);
  return () => {
    listeners.get(bookId)?.delete(listener);
  };
}

export function publish(bookId: string, event: BookEvent) {
  for (const listener of listeners.get(bookId) || []) {
    try {
      listener(event);
    } catch {}
  }
}
