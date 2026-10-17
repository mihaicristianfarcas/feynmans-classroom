/* The top bar's vault picker: which vault is active, for the Notes page, the Brain's graph and the
 * reader's notes. On the Notes page, picking one opens it. */
import { Library } from "lucide-react";
import { go } from "../app/navigation";
import { announce } from "../lib/a11y";
import { setActiveVault, useActiveVault } from "./active";
import { vaultRoute } from "./routes";

export function VaultPicker() {
  const { list, active } = useActiveVault();
  if (!list?.length || active === null) return null;
  return (
    <div className="topnav-vault">
      <Library aria-hidden="true" />
      <label className="visually-hidden" htmlFor="active-vault">
        Active vault
      </label>
      <select
        id="active-vault"
        className="vault-pick"
        value={active}
        title="Active vault"
        onChange={(e) => {
          const to = e.target.value;
          setActiveVault(to);
          announce(`${list.find((v) => v.id === to)?.name} is the active vault`);
          if (/^#\/(notes|vaults)/.test(location.hash)) go(vaultRoute(to));
        }}
      >
        {list.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.status === "missing" ? " (folder missing)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
