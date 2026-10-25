/* The vault switch in the top bar, beside the wordmark: the open vault's name, and a menu of the others
 * to open one (the page starts again at Today in it), with a way to the Vaults settings to make, rename
 * or delete them. Shown only once there is more than one vault. */
import { Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type VaultSummary, vaults } from "../api";
import { go } from "../app/navigation";
import { Spinner } from "../components/feedback";
import { announce, useArrowKeys } from "../lib/a11y";
import { useLoad } from "../lib/useLoad";
import { openVault } from "./open";

export function VaultSwitch() {
  const { data: list, reload } = useLoad(() => vaults.list(), [], "vaults");
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<VaultSummary | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  // vaults made, renamed or deleted in Settings
  const again = useRef(reload);
  again.current = reload;
  useEffect(() => {
    const on = () => again.current();
    window.addEventListener("classroom:vaults", on);
    return () => window.removeEventListener("classroom:vaults", on);
  }, []);
  const current = list?.find((v) => v.open);
  if (!list || list.length < 2 || !current) return null;
  const choose = async (vault: VaultSummary) => {
    setOpen(false);
    if (vault.open) return;
    setOpening(vault);
    announce(`Opening ${vault.name}`);
    try {
      await openVault(vault.id);
    } catch (e) {
      setOpening(null);
      alert((e as Error).message);
    }
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only closes the menu when focus leaves it; the buttons inside are the controls
    <div
      className="vault-switch"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="vault-switch-button"
        ref={button}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Vault: ${current.name}`}
        title="Switch vault"
        disabled={!!opening}
        onClick={() => setOpen((v) => !v)}
      >
        {opening ? (
          <Spinner label={`Opening ${opening.name}`} />
        ) : (
          <>
            <span className="vault-switch-name">{current.name}</span>
            <ChevronsUpDown aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <VaultMenu
          list={list}
          onChoose={choose}
          onClose={() => {
            setOpen(false);
            button.current?.focus();
          }}
          onManage={() => {
            setOpen(false);
            go("#/settings/vault");
          }}
        />
      )}
    </div>
  );
}

/** The menu of vaults, open: it starts on the open one, the arrow keys move through it, Escape closes it. */
function VaultMenu({
  list,
  onChoose,
  onClose,
  onManage,
}: {
  list: VaultSummary[];
  onChoose: (vault: VaultSummary) => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useArrowKeys(box, { selector: "[role=menuitemradio], [role=menuitem]", orientation: "vertical" });
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[aria-checked=true], [role=menuitem]")?.focus();
  }, []);
  return (
    <div
      className="menu vault-menu"
      role="menu"
      aria-label="Vaults"
      ref={box}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      {list.map((vault) => (
        <button
          key={vault.id}
          type="button"
          role="menuitemradio"
          aria-checked={vault.open}
          onClick={() => onChoose(vault)}
        >
          <Check aria-hidden="true" className="vault-menu-check" />
          <span className="vault-menu-name">{vault.name}</span>
          <span className="vault-menu-facts">{facts(vault)}</span>
        </button>
      ))}
      <div className="menu-sep" />
      <button type="button" role="menuitem" onClick={onManage}>
        <Settings2 aria-hidden="true" />
        Manage vaults
      </button>
    </div>
  );
}

/** What a vault holds, in a few words. */
export function facts(vault: VaultSummary): string {
  const part = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (!vault.books && !vault.notes && !vault.cards) return "empty";
  return [part(vault.books, "book"), part(vault.notes, "note"), vault.cards ? part(vault.cards, "card") : ""]
    .filter(Boolean)
    .join(" · ");
}
