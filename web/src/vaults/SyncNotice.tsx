/* A synced vault's status in this browser, with the one action it may need: allowing the folder again
 * after the browser restarted, or opening the folder in a browser that hasn't got it yet. */
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { announce } from "../lib/a11y";
import { pickVaultFolder, reconnect, useVaultSync } from "./sync/engine";

export function SyncNotice({ id, name, quiet }: { id: string; name: string; quiet?: boolean }) {
  const s = useVaultSync(id);
  const [error, setError] = useState<string | null>(null);
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
  if (s.state === "copied") {
    text = "Choose the folder again to bring in changes made in Obsidian. Edits made here stay in the app.";
    action = { ...openFolder, label: "Choose folder again…" };
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
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
