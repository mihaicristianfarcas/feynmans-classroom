/* Dialog for adding a vault: choose a folder on this computer (an Obsidian vault, or any folder of
 * Markdown). The app copies it and keeps the copy and the folder in sync from this browser (sync/). */
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { type VaultSummary, vaults } from "../api";
import { Modal } from "../components/tools";
import { announce } from "../lib/a11y";
import { pickVaultFolder, useVaultSync } from "./sync/engine";
import { canOpenFolders } from "./sync/folder";

export function AddVault({ onClose, onAdded }: { onClose: () => void; onAdded: (v: VaultSummary) => void }) {
  const [adding, setAdding] = useState<VaultSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = useVaultSync(adding?.id);
  const live = canOpenFolders();

  const choose = async () => {
    setError(null);
    let created: VaultSummary | null = null;
    try {
      const folder = await pickVaultFolder();
      if (!folder) return;
      created = await vaults.addSynced(folder.name);
      setAdding(created);
      announce(`Copying ${folder.name}`);
      await folder.sync(created.id);
      onAdded(created);
    } catch (e) {
      if (created) await vaults.remove(created.id).catch(() => {});
      setAdding(null);
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Add a vault" eyebrow="Obsidian, or any folder of Markdown" onClose={onClose}>
      <div className="add-vault">
        <p className="fine">
          {live
            ? "Choose the folder on your computer. Edits made here are saved to it, and changes made in Obsidian show up here, while the app is open in this browser."
            : "Choose the folder on your computer. To bring in later changes made in Obsidian, choose it again. This browser can't save into the folder, so edits made here stay in the app."}
        </p>
        <button type="button" className="button primary" onClick={choose} disabled={!!adding}>
          <FolderOpen aria-hidden="true" />
          Choose folder…
        </button>
        {adding && (
          <p className="fine" aria-live="polite">
            {progress?.state === "syncing"
              ? `Copying ${adding.name}: ${progress.done} of ${progress.total} files…`
              : `Copying ${adding.name}…`}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
