/* A synced vault's status in this browser, with the one action it may need: allowing the folder again
 * after the browser restarted, or opening the folder in a browser that hasn't got it yet. Where the
 * browser can't save into the folder, a button opens FolderHelp to say why. */
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { announce } from "../lib/a11y";
import { FolderHelp } from "./FolderHelp";
import { pickVaultFolder, reconnect, useVaultSync } from "./sync/engine";
import { canOpenFolders } from "./sync/folder";

export function SyncNotice({ id, name, quiet }: { id: string; name: string; quiet?: boolean }) {
  const s = useVaultSync(id);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const live = canOpenFolders();
  const act = async (run: () => Promise<void>) => {
    setError(null);
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!s || (quiet && (s.state === "synced" || s.state === "syncing"))) return null;

  const openFolder = {
    label: "Choose its folder…",
    run: async () => {
      const folder = await pickVaultFolder();
      if (folder) await folder.sync(id);
    },
  };
  let text: string;
  let action: { label: string; run: () => Promise<void> } | null = null;
  if (s.state === "copied" && live) {
    // copied in while the browser couldn't save into folders (Brave before its flag was turned on)
    text = "This browser can now save into the folder. Choose it again to keep it in sync both ways.";
    action = { ...openFolder, label: "Choose folder again…" };
  } else if (s.state === "copied") {
    text = "Copied from its folder. This browser can't save into the folder, so edits made here stay in the app.";
    action = { ...openFolder, label: "Bring in changes…" };
  } else if (s.state === "permission") {
    text = `Allow the app to use “${name}” again to keep it in sync.`;
    action = { label: "Allow", run: () => reconnect(id) };
  } else if (s.state === "unlinked") {
    text = "Its folder isn't connected in this browser.";
    action = openFolder;
  } else if (s.state === "error") {
    text = s.message;
    action = openFolder;
  } else if (s.state === "syncing") text = `Syncing ${s.done} of ${s.total}…`;
  else text = "In sync with its folder on this computer.";

  return (
    <div className={`vault-sync-note fine${quiet ? " tree-note" : ""}`} role="status">
      <span>{text}</span>
      {action && (
        <button
          type="button"
          className="button small"
          onClick={() =>
            act(async () => {
              await action.run();
              announce("Syncing");
            })
          }
        >
          <FolderOpen aria-hidden="true" />
          {action.label}
        </button>
      )}
      {s.state === "copied" && !live && (
        <button type="button" className="link" aria-haspopup="dialog" onClick={() => setHelp(true)}>
          Why?
        </button>
      )}
      {error && <span className="form-error">{error}</span>}
      {help && <FolderHelp onClose={() => setHelp(false)} />}
    </div>
  );
}
