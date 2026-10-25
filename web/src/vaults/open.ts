/* Opening another vault from the page: the server closes the open one and opens it, and the page starts
 * again at Today in it (all it had loaded was the other vault's). Every tab does the same when it hears
 * that another vault was opened, or finds that the one it shows was closed. */
import { vaults } from "../api";
import { leaveVault, shownVault } from "../api/client";
import { onServerEvent } from "../api/events";

/** What this device keeps about the vault it shows (not how the app looks or reads). */
const KEPT = ["classroom-due", "classroom-last-note"];

let restarting = false;
/** Starts the page again at Today, in the vault that is open (once, however many things say so). */
export function startOver() {
  if (restarting) return;
  restarting = true;
  leaveVault();
  for (const key of KEPT) {
    try {
      localStorage.removeItem(key);
    } catch {}
  }
  history.replaceState(null, "", "#/");
  location.reload();
}

/** Opens a vault, then starts the page again in it. */
export async function openVault(id: string) {
  await vaults.open(id);
  startOver();
}

/** Tells vaults that changed (made, renamed, deleted) to whatever lists them. */
export const vaultsChanged = () => window.dispatchEvent(new Event("classroom:vaults"));

/** Starts the page over when another vault is opened (here or in another tab), or a call finds the one
 * it shows closed. Returns a function that stops listening. */
export function followOpenVault() {
  const off = onServerEvent("vault-open", (data) => {
    const shown = shownVault();
    if (shown && (data as { id: string }).id !== shown) startOver();
  });
  window.addEventListener("classroom:vault-changed", startOver);
  return () => {
    off();
    window.removeEventListener("classroom:vault-changed", startOver);
  };
}
