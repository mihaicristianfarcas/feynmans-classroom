/* Hears about files changing in the vault (an agent, Obsidian, another tab) from the server's event
 * stream, so a page showing them can reload. */
import { useEffect, useRef } from "react";

/** Reloads when files in the vault change outside this page (an agent, Obsidian, another tab). */
export function useVaultEvents(onChange: (path: string) => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    const source = new EventSource("/api/events");
    let timer = 0 as unknown as ReturnType<typeof setTimeout>;
    source.addEventListener("vault", (e) => {
      const { path } = JSON.parse((e as MessageEvent).data) as { path: string };
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(path), 250);
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, []);
}
