/* At start: the app always has a vault, and notes are kept only in vaults. Notes found in the app's own
 * notes/ folder (from before, when it showed as a vault of its own, or written there by the agent) move
 * into the first vault kept in the app (a new one, "Notes", if there's none: never into a folder of the
 * learner's), folders and all, with a copy of the attachments they may embed; jj keeps them in the app
 * vault's history as they were. */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { VAULT_DIR } from "../config.ts";
import { atomicWrite } from "../fs.ts";
import { changed, docs, isGenerated, touched } from "../vault/index.ts";
import { addAppVault, getVault, listVaults, rootOf } from "./index.ts";
import { listProperty, setListProperty } from "./properties.ts";

/** The files under notes/ to move (relative to it): everything but hidden files and the generated index. */
function ownFiles(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const full = join(VAULT_DIR, "notes", rel);
    if (!existsSync(full) || !statSync(full).isDirectory()) return;
    for (const e of readdirSync(full, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(child);
      else if (e.isFile() && !isGenerated(`notes/${child}`)) out.push(child);
    }
  };
  walk("");
  return out;
}

/** Moves the app's own notes into a vault kept in the app, and makes a vault if there's still none. Returns
 * the id of the vault the notes went to, when there were any. */
export function adoptOwnNotes(): string | null {
  const files = ownFiles();
  if (!files.length) {
    if (!listVaults().length) addAppVault("Notes");
    return null;
  }
  const info = listVaults().find((v) => v.app) ?? addAppVault("Notes");
  const root = rootOf(info);
  for (const rel of files) {
    // a name already taken there keeps both: the moved one gets " (moved)"
    let to = join(root, rel);
    for (let n = 1; existsSync(to); n++)
      to = join(root, rel).replace(/(\.[^./]+)?$/, (ext) => ` (moved${n > 1 ? ` ${n}` : ""})${ext}`);
    // Persist former identities in the file so references survive restarts and reindexing.
    if (/\.md$/i.test(rel)) {
      const from = join(VAULT_DIR, "notes", rel);
      const doc = docs.at(`notes/${rel}`);
      const text = readFileSync(from, "utf8");
      const aliases = new Set([
        ...listProperty(text, "aliases"),
        ...(doc?.aliases || []),
        `notes/${rel.replace(/\.md$/i, "")}`,
      ]);
      if (doc) aliases.add(doc.id);
      atomicWrite(from, setListProperty(text, "aliases", [...aliases]));
    }
    mkdirSync(dirname(to), { recursive: true });
    renameSync(join(VAULT_DIR, "notes", rel), to);
  }
  // the pictures they embed (![[x.png]]) were kept in the app's attachments/; the vault gets a copy
  const attachments = join(VAULT_DIR, "attachments");
  if (existsSync(attachments) && readdirSync(attachments).length)
    cpSync(attachments, join(root, "attachments"), { recursive: true, force: false });
  docs.loadDir("notes");
  touched("notes");
  changed(`notes moved to the vault “${info.name}”`);
  getVault(info.id).reconcile();
  console.log(`[vaults] moved ${files.length} note file(s) into the vault “${info.name}”`);
  return info.id;
}
