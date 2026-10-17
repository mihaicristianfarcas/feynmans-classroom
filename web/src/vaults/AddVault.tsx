/* Dialog for a new vault: one kept only in the app (named, and empty to begin with), or one from a folder
 * on this computer (an Obsidian vault, or any folder of Markdown), which the app copies and keeps in sync
 * with the folder from this browser (sync/). */
import { FolderOpen, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type VaultSummary, vaults } from "../api";
import { Modal } from "../components/tools";
import { announce } from "../lib/a11y";
import { pickVaultFolder, useVaultSync } from "./sync/engine";
import { canOpenFolders } from "./sync/folder";

export function AddVault({ onClose, onAdded }: { onClose: () => void; onAdded: (v: VaultSummary) => void }) {
  const [name, setName] = useState("");
  const [making, setMaking] = useState(false);
  const [adding, setAdding] = useState<VaultSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = useVaultSync(adding?.id);
  const live = canOpenFolders();

  const make = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setMaking(true);
    try {
      const made = await vaults.addApp(name.trim());
      announce(`Made the vault ${made.name}`);
      onAdded(made);
    } catch (err) {
      setError((err as Error).message);
      setMaking(false);
    }
  };

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

  const busy = making || !!adding;
  return (
    <Modal title="New vault" eyebrow="Kept in the app, or a folder of yours" onClose={onClose}>
      <div className="add-vault">
        <form className="add-vault-make" onSubmit={make}>
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Physics" />
          </label>
          <button type="submit" className="button primary" disabled={busy || !name.trim()}>
            <Plus aria-hidden="true" />
            Make vault
          </button>
        </form>
        <p className="fine">Its notes are kept in the app, nowhere else on your computer.</p>
        <hr className="add-vault-or" />
        <p className="fine">
          {live
            ? "Or use a folder on your computer (an Obsidian vault, or any folder of Markdown). Edits made here are saved to it, and changes made in Obsidian show up here, while the app is open in this browser."
            : "Or use a folder on your computer (an Obsidian vault, or any folder of Markdown). To bring in later changes made in Obsidian, choose it again. This browser can't save into the folder, so edits made here stay in the app."}
        </p>
        <button type="button" className="button" onClick={choose} disabled={busy}>
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
