/* The top of the notes page's file list: which vault is open, a button to make or add one, and the open
 * vault's menu. */
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { vaults } from "../api";
import { go } from "../app/navigation";
import { useLoad } from "../lib/useLoad";
import { AddVault } from "./AddVault";
import { setActiveVault } from "./active";
import { vaultRoute } from "./routes";
import { useVaultChanges } from "./useVaultChanges";

export function VaultSwitch({ current, children }: { current: string; children?: ReactNode }) {
  const { data: list, reload } = useLoad(() => vaults.list());
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
        value={current}
        onChange={(e) => {
          setActiveVault(e.target.value);
          go(vaultRoute(e.target.value));
        }}
      >
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
        title="New vault"
        aria-label="New vault"
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
            setActiveVault(v.id);
            go(vaultRoute(v.id));
          }}
        />
      )}
    </div>
  );
}
