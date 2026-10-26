/* Why this browser can or can't save into a synced vault's folder, for the help shown beside a vault that
 * is only copied in (FolderHelp.tsx), and whether the learner asked not to see that help on its own again. */

/** "full": it can (Chromium). "brave": Brave, with the API off by default. "insecure": the page isn't on
 * localhost or https, where browsers withhold it. "none": not offered at all (Firefox, Safari). */
export type FolderSupport = "full" | "brave" | "insecure" | "none";

interface Env {
  showDirectoryPicker?: unknown;
  isSecureContext?: boolean;
  navigator?: { brave?: unknown };
}

export function folderSupport(env: Env = typeof window === "undefined" ? {} : (window as Env)): FolderSupport {
  if ("showDirectoryPicker" in env) return "full";
  if (env.isSecureContext === false) return "insecure";
  if (env.navigator?.brave) return "brave";
  return "none";
}

/** Brave's switch for the File System Access API. */
export const BRAVE_FLAG = "brave://flags/#file-system-access-api";

const HIDDEN = "classroom-folder-help-hidden";

export function folderHelpHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN) === "1";
  } catch {
    return false;
  }
}

export function hideFolderHelp(hidden: boolean) {
  try {
    if (hidden) localStorage.setItem(HIDDEN, "1");
    else localStorage.removeItem(HIDDEN);
  } catch {}
}
