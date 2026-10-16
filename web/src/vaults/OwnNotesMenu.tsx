/* The menu of the app's own notes (Classroom) in the vault switcher: removing them from the Notes page,
 * which only hides them there while there are other vaults. Nothing is deleted: concepts, cards and links
 * to these notes keep working, and any vault's menu shows them again. */
import { X } from "lucide-react";
import { vaults } from "../api";
import { go } from "../app/navigation";
import { announce } from "../lib/a11y";
import { useLoad } from "../lib/useLoad";
import { useVaultChanges } from "./useVaultChanges";
import { OWN_VAULT } from "./VaultSwitch";
import { RowMenu } from "./VaultTree";

export function OwnNotesMenu() {
  const { data: list, reload } = useLoad(() => vaults.list());
  useVaultChanges(null, (changes) => {
    if (changes.some((c) => !c.path)) reload();
  });
  // with no other vault, the Notes page has nothing else to show
  if (!list?.length) return null;
  return (
    <RowMenu
      label={`Vault ${OWN_VAULT}`}
      button="icon-button"
      className="vault-menu"
      items={[
        {
          label: "Remove from the app…",
          icon: X,
          danger: true,
          run: async () => {
            if (
              !confirm(
                `Remove “${OWN_VAULT}” from the Notes page? Nothing is deleted: its notes, concepts and cards stay, and any vault's menu shows it again.`,
              )
            )
              return;
            await vaults.hideOwn(true);
            announce(`${OWN_VAULT} removed from the Notes page`);
            go("#/vaults");
          },
        },
      ]}
    />
  );
}
