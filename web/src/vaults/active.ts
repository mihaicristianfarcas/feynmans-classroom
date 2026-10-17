/* The active vault: the one the top bar's picker names, the Notes page opens, the Brain draws and the
 * reader writes into. Kept in this browser; a vault that's gone gives way to the first vault there is
 * (there's always one). */
import { useEffect, useState } from "react";
import { vaults } from "../api";
import { useLoad } from "../lib/useLoad";
import { useVaultChanges } from "./useVaultChanges";

/** The vault open last (its id). */
export const LAST_VAULT = "notes-active-vault";
const EVENT = "notes:active-vault";

export function storedVault(): string | null {
  try {
    return localStorage.getItem(LAST_VAULT);
  } catch {
    return null;
  }
}

export function setActiveVault(id: string) {
  try {
    if (localStorage.getItem(LAST_VAULT) === id) return;
    localStorage.setItem(LAST_VAULT, id);
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The active vault among the vaults there are: the stored one while it's there, else the first. */
const resolve = (list: { id: string }[], stored: string | null): string | null =>
  list.some((v) => v.id === stored) ? stored : (list[0]?.id ?? null);

/** The active vault as it is now, for what's made outside a page that shows the picker. */
export async function activeVault(): Promise<string> {
  const id = resolve(await vaults.list(), storedVault());
  if (!id) throw new Error("there's no vault yet");
  return id;
}

/** The vaults there are, and the active vault among them (null while loading). */
export function useActiveVault() {
  const { data: list, reload } = useLoad(() => vaults.list());
  useVaultChanges(null, (changes) => {
    if (changes.some((c) => !c.path)) reload();
  });
  const [stored, setStored] = useState(storedVault);
  useEffect(() => {
    const on = () => setStored(storedVault());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return { list: list ?? null, active: list ? resolve(list, stored) : null };
}
