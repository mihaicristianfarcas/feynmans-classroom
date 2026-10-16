/* The top of the notes page's file list: which vault is open (the app's own notes first, unless they
 * were removed from the page, then the vaults added from folders), a button to add one, and the open
 * vault's menu. */
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { vaults } from "../api";
import { go } from "../app/navigation";
import { useLoad } from "../lib/useLoad";
import { AddVault } from "./AddVault";
import { vaultRoute } from "./routes";
import { useVaultChanges } from "./useVaultChanges";

/** The vault open last on the notes page (its id; empty for the app's own notes). */
export const LAST_VAULT = "classroom-last-vault";

/** The app's own notes, as the switcher shows them. */
export const OWN_VAULT = "Classroom";

export function VaultSwitch({ current, children }: { current: string | null; children?: ReactNode }) {
  const { data, reload } = useLoad(() => Promise.all([vaults.list(), vaults.own()]));
  const [list, own] = data || [];
  // the app's own notes stay listed while they're open (a link to one leads here)
  const showOwn = !own?.hidden || current === null;
  useVaultChanges(null, (changes) => {
    if (changes.some((c) => !c.path)) reload();
  });
  const [adding, setAdding] = useState(false);
  return (
    <div className="tree-head vault-switch">
      <label className="visually-hidden" htmlFor="vault-pick">
        Vault
      </label>
      <select
        id="vault-pick"
        className="vault-pick"
        value={current ?? ""}
        onChange={(e) => {
          const to = e.target.value;
          try {
            localStorage.setItem(LAST_VAULT, to);
          } catch {}
          go(to ? vaultRoute(to) : "#/notes");
        }}
      >
        {showOwn && <option value="">{OWN_VAULT}</option>}
        {(list || []).map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.status === "missing" ? " (folder missing)" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="icon-button"
        title="Add a vault"
        aria-label="Add a vault"
        onClick={() => setAdding(true)}
      >
        <Plus aria-hidden="true" />
      </button>
      {children}
      {adding && (
        <AddVault
          onClose={() => setAdding(false)}
          onAdded={(v) => {
            setAdding(false);
            reload();
            go(vaultRoute(v.id));
          }}
        />
      )}
    </div>
  );
}
