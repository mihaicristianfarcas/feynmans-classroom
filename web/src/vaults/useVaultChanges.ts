/* Hears about files changing in a vault (edited in Obsidian, by another app, or here) from the
 * server's event stream, which the server's watcher feeds, so the vaults page follows them as they land. */
import { useEffect, useRef } from "react";
import { onServerEvent } from "../api/events";

export interface VaultChange {
  vault: string;
  path: string;
  change: "added" | "changed" | "removed";
}

/** Calls `onChange` with every change gathered over a fifth of a second, for vault `id` (any vault: null). */
export function useVaultChanges(id: string | null, onChange: (changes: VaultChange[]) => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    let timer = 0 as unknown as ReturnType<typeof setTimeout>;
    let batch: VaultChange[] = [];
    const off = onServerEvent("vaults", (data) => {
      const c = data as VaultChange;
      if (id && c.vault !== id) return;
      batch.push(c);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const changes = batch;
        batch = [];
        ref.current(changes);
      }, 200);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [id]);
}
