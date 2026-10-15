/* The dialog that adds an outside vault: the folder (an Obsidian vault, or any folder of Markdown) by its
 * path on this computer, and a name to show for it. Its files stay where they are; the app reads them
 * there, writes edits back to them, and follows changes made to them in Obsidian or anywhere else. */
import { type FormEvent, useState } from "react";
import { type VaultSummary, vaults } from "../api";
import { Modal } from "../components/tools";

export function AddVault({ onClose, onAdded }: { onClose: () => void; onAdded: (v: VaultSummary) => void }) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!path.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onAdded(await vaults.add(path.trim(), name.trim() || undefined));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Add a vault" eyebrow="Obsidian, or any folder of Markdown" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="fine">
          The app opens the files where they are: edits here are saved to them, and changes made in Obsidian show up
          here as you make them. Add as many vaults as you like.
        </p>
        <label className="field">
          <span>Folder</span>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="~/Documents/Obsidian/My vault"
            spellCheck={false}
            autoComplete="off"
            aria-describedby="add-vault-hint"
            required
          />
        </label>
        <p id="add-vault-hint" className="fine">
          Its full path on this computer. In Obsidian: right-click the vault's name, then “Reveal in Finder” (or
          Explorer) shows where it is.
        </p>
        <label className="field">
          <span>Name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The folder's name" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy || !path.trim()}>
            {busy ? "Reading the vault…" : "Add vault"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
