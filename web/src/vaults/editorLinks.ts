/* The editor's links and pasted attachments belong to the vault and note being edited. */
import { useMemo } from "react";
import { vaults } from "../api";
import { announce } from "../lib/a11y";
import type { LinkSource } from "../notes/NoteEditor";
import { openVaultLink } from "./routes";

export function useVaultEditorLinks(id: string, path: string): LinkSource {
  return useMemo(
    () => ({
      targets: () => vaults.targets(id),
      follow: (target, sub) => void openVaultLink(id, target, { sub, from: path }),
      attach: async (file, data) => {
        const named = file.name && !/^image\.\w+$/.test(file.name) ? file.name : undefined;
        const saved = await vaults.attach(id, data, named, path);
        announce(`Saved ${saved.path}`);
        return saved.embed;
      },
    }),
    [id, path],
  );
}
