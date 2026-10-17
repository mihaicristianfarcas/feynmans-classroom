/* Typed calls for the vaults (kept in the app, or a folder: Obsidian's, or any folder of Markdown): the
 * list, a vault's files, a note with its links, resolving links, saving and changing files, attachments, a note's versions
 * and suggested connections, tags, search, graph. */
import { call, del, patch, post } from "./client";
import type { SuggestedLink } from "./types";

export type VaultFileKind = "note" | "image" | "pdf" | "audio" | "video" | "file";

/** The note changed on disk (in Obsidian, say) since it was opened here: `text` is what's there now. */
export class VaultConflict extends Error {
  constructor(readonly text: string) {
    super("this note changed on disk since you opened it");
  }
}

/** A link names a note or file the vault doesn't have yet. */
export class VaultMissing extends Error {
  constructor(readonly target: string) {
    super(`nothing in the vault is called ${target} yet`);
  }
}

export interface VaultSummary {
  id: string;
  name: string;
  /** The folder on the server; "" for a synced vault or one kept in the app. */
  path: string;
  added: string;
  /** Kept in sync with a folder on the learner's computer by their browser. */
  synced?: boolean;
  /** Kept only in the app, with no folder anywhere else. */
  app?: boolean;
  status: "ready" | "missing";
  obsidian: boolean;
  notes: number;
  /** Files other than notes: pictures, PDFs, recordings… */
  files: number;
  folders: number;
}

export interface VaultTree {
  folders: string[];
  files: { path: string; name: string; kind: VaultFileKind; mtime: number }[];
}

export interface VaultBacklink {
  path: string;
  title: string;
  line: number;
  context: string;
  embed?: boolean;
}

export interface VaultNote {
  path: string;
  name: string;
  kind: VaultFileKind;
  text?: string;
  bodyStart?: number;
  properties?: Record<string, unknown>;
  tags?: string[];
  aliases?: string[];
  headings?: { level: number; text: string; line: number }[];
  mtime?: number;
  outgoing?: {
    target: string;
    sub?: string;
    embed: boolean;
    md: boolean;
    path: string | null;
    kind: VaultFileKind | null;
    /** Names nothing in the vault, but a concept, book or note of the app. */
    app?: { kind: "concept" | "book" | "note"; title: string };
  }[];
  backlinks: VaultBacklink[];
  mentions?: VaultBacklink[];
}

export interface VaultResolved {
  path: string;
  name: string;
  kind: VaultFileKind;
  body?: string;
}

const q = (params: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString();

/** The URL a file of a vault is served from (pictures, PDFs, sound, video). */
export const vaultFileUrl = (id: string, path: string) => `/api/vaults/${id}/file?${q({ path })}`;

/** A snapshot of a vault that changed a note (`path`: the note's path then). */
export interface VaultVersion {
  commit: string;
  when: string;
  subject: string;
  path: string;
}

export const vaults = {
  list: () => call<VaultSummary[]>("/api/vaults"),
  add: (path: string, name?: string) => post<VaultSummary>("/api/vaults", { path, name }),
  addSynced: (name: string) => post<VaultSummary>("/api/vaults", { name, synced: true }),
  /** Makes a vault kept only in the app. */
  addApp: (name: string) => post<VaultSummary>("/api/vaults", { name, app: true }),
  rename: (id: string, name: string) => patch<VaultSummary>(`/api/vaults/${id}`, { name }),
  remove: (id: string) => del(`/api/vaults/${id}`),
  rescan: (id: string) => post<{ changes: number }>(`/api/vaults/${id}/rescan`),
  tree: (id: string) => call<VaultTree>(`/api/vaults/${id}/tree`),
  note: (id: string, path: string) => call<VaultNote>(`/api/vaults/${id}/note?${q({ path })}`),
  /** Where a link goes; throws VaultMissing if it names nothing yet. */
  resolve: async (
    id: string,
    target: string,
    opts: { from?: string; sub?: string; md?: boolean; body?: boolean } = {},
  ) => {
    const r = await call<VaultResolved | { path: null }>(
      `/api/vaults/${id}/resolve?${q({
        target,
        from: opts.from,
        sub: opts.sub,
        md: opts.md ? "1" : undefined,
        body: opts.body ? "1" : undefined,
      })}`,
    );
    if (!r.path) throw new VaultMissing(target);
    return r as VaultResolved;
  },
  targets: (id: string) => call<{ title: string; kind: string; detail?: string }[]>(`/api/vaults/${id}/targets`),
  /** Saves a note; with `base` (the text it was opened with) it throws a VaultConflict if the file changed since. */
  save: async (id: string, path: string, text: string, base?: string) => {
    const res = await fetch(`/api/vaults/${id}/note`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, text, base }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) throw new VaultConflict(data.text ?? "");
    if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
    return data as { path: string; mtime: number };
  },
  /** A new note; `body`, `bookId` and `about` (concept names) fill it, linking the book and the concepts. */
  create: (
    id: string,
    opts: { title?: string; folder?: string; from?: string; body?: string; bookId?: string; about?: string[] },
  ) => post<{ path: string }>(`/api/vaults/${id}/notes`, opts),
  folder: (id: string, path: string) => post<{ path: string }>(`/api/vaults/${id}/folders`, { path }),
  move: (id: string, from: string, to: string) => post<{ path: string }>(`/api/vaults/${id}/move`, { from, to }),
  trash: (id: string, path: string) => post<{ changes: number }>(`/api/vaults/${id}/trash`, { path }),
  attach: (id: string, data: string, name?: string, note?: string) =>
    post<{ path: string; link: string; embed: string; kind: VaultFileKind }>(`/api/vaults/${id}/attachments`, {
      data,
      name,
      note,
    }),
  append: (id: string, path: string, text: string) =>
    post<{ path: string; text: string }>(`/api/vaults/${id}/append`, { path, text }),
  /** The vault notes that link to a book. */
  bookNotes: (bookId: string) =>
    call<{ vault: string; vaultName: string; path: string; title: string; page?: number }[]>(
      `/api/books/${bookId}/vault-notes`,
    ),
  versions: (id: string, path: string) => call<VaultVersion[]>(`/api/vaults/${id}/versions?${q({ path })}`),
  version: (id: string, path: string, commit: string) =>
    call<{ body: string; diff: string }>(`/api/vaults/${id}/versions/${commit}?${q({ path })}`),
  restore: (id: string, path: string, commit: string) =>
    post<{ path: string }>(`/api/vaults/${id}/restore`, { path, commit }),
  connections: (id: string, path: string) => call<SuggestedLink[]>(`/api/vaults/${id}/connections?${q({ path })}`),
  suggestConnections: (id: string, path: string) =>
    post<{ suggested: SuggestedLink[] }>(`/api/vaults/${id}/connections/suggest`, { path }),
  decideConnection: (id: string, cid: string, decision: "accept" | "reject" | "remove") =>
    post<SuggestedLink>(`/api/vaults/${id}/connections/${cid}/${decision}`),
  tags: (id: string) => call<{ tag: string; count: number }[]>(`/api/vaults/${id}/tags`),
  search: (id: string, query: string) =>
    call<{ path: string; title: string; kind: VaultFileKind; snippet: string; score: number }[]>(
      `/api/vaults/${id}/search?${q({ q: query })}`,
    ),
  graph: (id: string, files = false) =>
    call<{
      nodes: { id: string; label: string; kind: VaultFileKind; links: number; mtime: number }[];
      edges: { from: string; to: string }[];
    }>(`/api/vaults/${id}/graph${files ? "?files=1" : ""}`),
};

/** A file of a synced vault's copy on the server. */
export interface SyncEntry {
  path: string;
  size: number;
  mtime: number;
}

/** The copy of a synced vault, file by file. */
export const vaultSync = {
  list: (id: string) => call<SyncEntry[]>(`/api/vaults/${id}/sync`),
  read: async (id: string, path: string) => {
    const res = await fetch(`/api/vaults/${id}/sync/file?${q({ path })}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`couldn't read ${path}`);
    return res.blob();
  },
  write: (id: string, path: string, body: Blob) =>
    call<SyncEntry>(`/api/vaults/${id}/sync/file?${q({ path })}`, { method: "PUT", body }),
  remove: (id: string, path: string) => del(`/api/vaults/${id}/sync/file?${q({ path })}`),
};
