/* The app-wide event stream (/api/events): one connection for the whole page, shared by everything
 * that follows the vault or the agent. Browsers allow only six connections to one server, so each
 * page part opening its own would soon leave none for ordinary requests. */
type Handler = (data: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
let source: EventSource | null = null;

/** Calls `fn` with the data of every `type` event from the server ("vault", "agent"…). Returns an unsubscribe function. */
export function onServerEvent(type: string, fn: Handler): () => void {
  source ??= new EventSource("/api/events");
  let set = handlers.get(type);
  if (!set) {
    const listeners = new Set<Handler>();
    set = listeners;
    handlers.set(type, listeners);
    source.addEventListener(type, (e) => {
      const data = JSON.parse((e as MessageEvent).data) as unknown;
      for (const handler of listeners) handler(data);
    });
  }
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}
