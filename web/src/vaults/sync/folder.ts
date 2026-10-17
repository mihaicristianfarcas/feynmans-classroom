/* A folder on the learner's computer, opened through the browser. Chromium browsers (File System Access
 * API) can list, read, write and delete its files any time; others (Firefox, Safari) can read the files
 * of a folder picked in a folder input, at the moment it's picked. */

export type FolderHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  queryPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
};

type Picker = (o: { id?: string; mode: "readwrite" }) => Promise<FolderHandle>;

/** Skipped both ways: version control, packages, macOS's folder files. */
export const ignored = (name: string) => name === ".git" || name === "node_modules" || name === ".DS_Store";

export const canOpenFolders = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Opens the system's folder dialog; null if cancelled. */
export async function chooseFolder(): Promise<FolderHandle | null> {
  try {
    return await (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker({
      id: "vault",
      mode: "readwrite",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return null;
    throw e;
  }
}

export interface DiskFile {
  size: number;
  mtime: number;
  read: () => Promise<File>;
}

/** Every file in the folder, by path ("Ideas/Energy.md"). */
export async function listFiles(root: FolderHandle): Promise<Map<string, DiskFile>> {
  const out = new Map<string, DiskFile>();
  const walk = async (dir: FolderHandle, prefix: string) => {
    const tasks: Promise<void>[] = [];
    for await (const entry of dir.values()) {
      if (ignored(entry.name)) continue;
      const path = prefix + entry.name;
      if (entry.kind === "directory") tasks.push(walk(entry as FolderHandle, `${path}/`));
      else
        tasks.push(
          (entry as FileSystemFileHandle).getFile().then((f) => {
            out.set(path, {
              size: f.size,
              mtime: f.lastModified,
              read: () => (entry as FileSystemFileHandle).getFile(),
            });
          }),
        );
    }
    await Promise.all(tasks);
  };
  await walk(root, "");
  return out;
}

async function parentOf(root: FolderHandle, path: string, create: boolean) {
  const parts = path.split("/");
  const name = parts.pop() as string;
  let dir: FileSystemDirectoryHandle = root;
  const chain = [dir];
  for (const p of parts) {
    dir = await dir.getDirectoryHandle(p, { create });
    chain.push(dir);
  }
  return { dir, name, chain, parts };
}

/** Writes `blob` at `path`, making folders as needed; returns the file as written. */
export async function writeFile(root: FolderHandle, path: string, blob: Blob): Promise<File> {
  const { dir, name } = await parentOf(root, path, true);
  const handle = await dir.getFileHandle(name, { create: true });
  const out = await handle.createWritable();
  await out.write(blob);
  await out.close();
  return handle.getFile();
}

/** Deletes the file at `path` and any folders it leaves empty. */
export async function removeFile(root: FolderHandle, path: string) {
  let found: Awaited<ReturnType<typeof parentOf>>;
  try {
    found = await parentOf(root, path, false);
    await found.dir.removeEntry(found.name);
  } catch (e) {
    if ((e as Error).name === "NotFoundError") return;
    throw e;
  }
  for (let i = found.parts.length; i > 0; i--) {
    const dir = found.chain[i] as FolderHandle;
    for await (const _ of dir.values()) return;
    await found.chain[i - 1].removeEntry(found.parts[i - 1]);
  }
}

/** A folder input (Firefox, Safari): the folder's name and files as they are now; null if cancelled. */
export function pickFolderFiles(): Promise<{ name: string; files: Map<string, DiskFile> } | null> {
  return new Promise((done) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.addEventListener("cancel", () => done(null));
    input.addEventListener("change", () => {
      const all = [...(input.files || [])];
      if (!all.length) return done(null);
      const files = new Map<string, DiskFile>();
      for (const f of all) {
        const parts = f.webkitRelativePath.split("/").slice(1);
        if (parts.some(ignored)) continue;
        files.set(parts.join("/"), { size: f.size, mtime: f.lastModified, read: async () => f });
      }
      done({ name: all[0].webkitRelativePath.split("/")[0], files });
    });
    input.click();
  });
}
