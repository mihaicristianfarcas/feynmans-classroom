/* Hears about files changing in the vault (the agent, Obsidian, another tab, jj bringing a change in
 * or taking it out) from the server's event stream, so a page showing them can reload. */
import { useEffect, useRef } from "react";
import { onServerEvent } from "../api/events";

/** Calls `onChange` (at most every quarter second) when a file in the vault changes; with `only`, just
 * for paths it accepts (e.g. those under notes/). The path passed is the last one that changed. */
export function useVaultEvents(onChange: (path: string) => void, only?: (path: string) => boolean) {
  const ref = useRef(onChange);
  ref.current = onChange;
  const filter = useRef(only);
  filter.current = only;
  useEffect(() => {
    let timer = 0 as unknown as ReturnType<typeof setTimeout>;
    const off = onServerEvent("vault", (data) => {
      const { path } = data as { path: string };
      if (filter.current && !filter.current(path)) return;
      clearTimeout(timer);
      timer = setTimeout(() => ref.current(path), 250);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, []);
}

/** Paths under any of these folders ("notes/", "cards/"…). */
export const under =
  (...folders: string[]) =>
  (path: string) =>
    folders.some((f) => path.startsWith(f));
