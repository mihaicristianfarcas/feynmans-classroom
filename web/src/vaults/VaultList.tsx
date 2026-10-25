/* The vaults, as Settings lists them: each with what it holds, the open one marked; open another (the page
 * starts again at Today in it), rename one in place, delete one that isn't open (after saying what goes
 * with it), or make a new one. */
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { type VaultSummary, vaults } from "../api";
import { Spinner } from "../components/feedback";
import { Modal } from "../components/tools";
import { announce } from "../lib/a11y";
import { useLoad } from "../lib/useLoad";
import { NewVault } from "./NewVault";
import { openVault, vaultsChanged } from "./open";
import { facts } from "./VaultSwitch";

export function VaultList() {
  const { data: list, reload } = useLoad(() => vaults.list(), [], "vaults");
  const [making, setMaking] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<VaultSummary | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!list) return null;
  const changed = () => {
    reload();
    vaultsChanged();
  };
  const open = async (vault: VaultSummary) => {
    setError(null);
    setOpening(vault.id);
    announce(`Opening ${vault.name}`);
    try {
      await openVault(vault.id);
    } catch (e) {
      setOpening(null);
      setError((e as Error).message);
    }
  };
  return (
    <>
      <ul className="vault-list" aria-label="Your vaults">
        {list.map((vault) => (
          <li key={vault.id} className="vault-row" data-open={vault.open || undefined}>
            {renaming === vault.id ? (
              <Rename
                vault={vault}
                onDone={(name) => {
                  setRenaming(null);
                  if (!name) return;
                  changed();
                  announce(`Renamed to ${name}`);
                }}
              />
            ) : (
              <>
                <div className="vault-row-text">
                  <span className="vault-row-name">
                    {vault.name}
                    {vault.open && (
                      <span className="tag-pill" data-tone="sage">
                        Open
                      </span>
                    )}
                  </span>
                  <span className="vault-row-facts">{facts(vault)}</span>
                </div>
                <div className="vault-row-actions">
                  {!vault.open &&
                    (opening === vault.id ? (
                      <Spinner label={`Opening ${vault.name}`} />
                    ) : (
                      <button
                        type="button"
                        className="button small"
                        onClick={() => open(vault)}
                        disabled={!!opening}
                        aria-label={`Open ${vault.name}`}
                      >
                        Open
                      </button>
                    ))}
                  <button
                    type="button"
                    className="button small subtle"
                    onClick={() => setRenaming(vault.id)}
                    aria-label={`Rename ${vault.name}`}
                  >
                    Rename
                  </button>
                  {!vault.open && (
                    <button
                      type="button"
                      className="icon-button small"
                      onClick={() => setDeleting(vault)}
                      aria-label={`Delete ${vault.name}`}
                      title="Delete this vault"
                      aria-haspopup="dialog"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button type="button" className="button" onClick={() => setMaking(true)} aria-haspopup="dialog">
          <Plus aria-hidden="true" />
          New vault
        </button>
      </div>
      {making && <NewVault onClose={() => setMaking(false)} />}
      {deleting && (
        <DeleteVault
          vault={deleting}
          onClose={(gone) => {
            setDeleting(null);
            if (!gone) return;
            changed();
            announce(`Deleted ${deleting.name}`);
          }}
        />
      )}
    </>
  );
}

/** A vault's name as a field, in its row: Enter (or Save) renames it, Escape (or Cancel) leaves it. */
function Rename({ vault, onDone }: { vault: VaultSummary; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(vault.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === vault.name) return onDone(null);
    setSaving(true);
    try {
      onDone((await vaults.rename(vault.id, name)).name);
    } catch (err) {
      setSaving(false);
      setError((err as Error).message);
    }
  };
  return (
    <form className="vault-rename" onSubmit={save}>
      <label className="field">
        <span className="visually-hidden">New name for {vault.name}</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the field appears where the name was, because Rename was asked for
          autoFocus
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            onDone(null);
          }}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `rename-${vault.id}-error` : undefined}
        />
      </label>
      <button type="submit" className="button small primary" disabled={saving || !name.trim()}>
        Save
      </button>
      <button type="button" className="button small subtle" onClick={() => onDone(null)}>
        Cancel
      </button>
      {error && (
        <p className="form-error" id={`rename-${vault.id}-error`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Asks before a vault is deleted for good, saying what goes with it. */
function DeleteVault({ vault, onClose }: { vault: VaultSummary; onClose: (gone: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const part = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const remove = async () => {
    setBusy(true);
    try {
      await vaults.remove(vault.id);
      onClose(true);
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  };
  return (
    <Modal title={`Delete “${vault.name}”?`} onClose={() => onClose(false)}>
      <p className="vault-warning">
        Its {part(vault.notes, "note")}, {part(vault.cards, "card")} and {part(vault.concepts, "concept")}, the margins
        and tutor sessions of its books, and its history go for good, with its folder (<code>{vault.path}</code>). This
        can’t be undone.
      </p>
      {vault.books > 0 && (
        <p className="fine">A book it shares with another vault stays there; the others go with it.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="button danger" onClick={remove} disabled={busy}>
          {busy ? (
            <Spinner label="Deleting the vault" />
          ) : (
            <>
              <Trash2 aria-hidden="true" />
              Delete the vault
            </>
          )}
        </button>
        <button type="button" className="button subtle" onClick={() => onClose(false)}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
