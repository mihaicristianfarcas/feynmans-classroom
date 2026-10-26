/* Dialog explaining why a synced vault is only copied in from its folder in this browser: which browsers
 * can save into the folder, how to turn that on in Brave, and a box to stop it opening on its own
 * (FolderHelpOnOpen opens it when such a vault is opened). */
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "../components/tools";
import { announce } from "../lib/a11y";
import { useVaultSync } from "./sync/engine";
import { BRAVE_FLAG, folderHelpHidden, folderSupport, hideFolderHelp } from "./sync/support";

export function FolderHelp({ onClose }: { onClose: () => void }) {
  const support = folderSupport();
  const [hidden, setHidden] = useState(folderHelpHidden);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(BRAVE_FLAG);
      announce("Copied");
    } catch {
      announce("Couldn't copy; select the address instead");
    }
  };

  const brave = (
    <p>
      Brave can save into folders too, but has it turned off by default. To turn it on, open{" "}
      <code className="folder-help-flag">{BRAVE_FLAG}</code>
      <button type="button" className="icon-button small" onClick={copy} aria-label="Copy the address" title="Copy">
        <Copy aria-hidden="true" />
      </button>{" "}
      in a new tab, set <em>File System Access API</em> to Enabled, relaunch Brave, then choose the folder again.
    </p>
  );

  return (
    <Modal title="Saving into the folder" eyebrow="This browser can only read it" onClose={onClose}>
      <div className="folder-help">
        {support === "insecure" && (
          <p className="folder-help-lead">
            Browsers let only pages on <code>localhost</code> (or https) save into folders. Open the app at{" "}
            <code>http://localhost{location.port ? `:${location.port}` : ""}</code> instead of{" "}
            <code>{location.hostname}</code>, then choose the folder again.
          </p>
        )}
        {support === "brave" && <div className="folder-help-lead">{brave}</div>}
        <p>
          Here the app reads the folder only at the moment you choose it. Edits made in the app stay in the app's copy,
          and changes made in Obsidian come in when you choose the folder again.
        </p>
        <p>
          Chrome, Edge, Arc, Opera and Vivaldi keep the folder in sync both ways while the app is open: edits made here
          are saved into it, and changes made in Obsidian show up within seconds. Firefox and Safari can't save into
          folders on your computer.
        </p>
        {support !== "brave" && brave}
        <div className="folder-help-foot">
          <label className="check">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => {
                setHidden(e.target.checked);
                hideFolderHelp(e.target.checked);
              }}
            />
            Don't show this again
          </label>
          <button type="button" className="button primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </Modal>
  );
}

const offered = new Set<string>();

/** Opens the help on its own the first time vault `id` shows as only copied in, once per page load, unless
 * the learner turned that off. */
export function FolderHelpOnOpen({ id }: { id: string }) {
  const s = useVaultSync(id);
  const [open, setOpen] = useState(false);
  const copied = s?.state === "copied" && folderSupport() !== "full";
  useEffect(() => {
    if (!copied || offered.has(id) || folderHelpHidden()) return;
    offered.add(id);
    setOpen(true);
  }, [copied, id]);
  return open ? <FolderHelp onClose={() => setOpen(false)} /> : null;
}
