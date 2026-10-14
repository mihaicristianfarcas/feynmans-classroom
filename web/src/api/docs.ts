/* The API for documents of any kind (notes, concepts, cards, annotations, sessions with the tutor, kept
 * figures): lists, one with its links, making, changing, adding to and deleting one, its versions. The
 * pages show each kind their own way; underneath, they all come and go through here. */
import { call, del, patch, post } from "./client";
import type { Doc, DocDetail, DocKind, DocOf } from "./types";

/** A saved version of the vault, or of one file in it (jj's change and commit ids). */
export interface Version {
  change: string;
  commit: string;
  when: string;
  subject: string;
}

export interface DocFilter {
  type?: string;
  book?: string;
  concept?: string;
  folder?: string;
  tag?: string;
}

/** A document's fields to set (those of its kind: name it, as `docs.update<Card>`, to set a card's
 * sides); a note may also name the `folder` it goes in. */
export type DocPatch<D extends Doc = Doc> = Partial<Omit<D, "id" | "kind" | "path" | "created" | "updated">> & {
  folder?: string;
};

export const docs = {
  /** The documents of a kind, matching a filter, the most recently changed first. */
  list: <K extends DocKind>(kind: K, filter: DocFilter = {}) =>
    call<DocOf<K>[]>(`/api/docs?${new URLSearchParams({ kind, ...filter } as Record<string, string>)}`),
  /** One document, with its links in and out. */
  get: <D extends Doc = Doc>(id: string) => call<DocDetail<D>>(`/api/docs/${id}`),
  byPath: <D extends Doc = Doc>(path: string) => call<DocDetail<D>>(`/api/docs/-?path=${encodeURIComponent(path)}`),
  /** Makes a note (or a concept, a card, a figure: `kind`). */
  create: <K extends DocKind = "note">(input: DocPatch<DocOf<K>> & { kind?: K }) => post<DocOf<K>>("/api/docs", input),
  update: <D extends Doc = Doc>(id: string, input: DocPatch<D>) => patch<D>(`/api/docs/${id}`, input),
  append: <D extends Doc = Doc>(id: string, markdown: string) => post<D>(`/api/docs/${id}/append`, { markdown }),
  remove: (id: string) => del(`/api/docs/${id}`),
  versions: (id: string) => call<Version[]>(`/api/docs/${id}/versions`),
  version: (id: string, commit: string) => call<{ body: string; diff: string }>(`/api/docs/${id}/versions/${commit}`),
  restore: <D extends Doc = Doc>(id: string, commit: string) => post<D>(`/api/docs/${id}/restore`, { commit }),
  /** Turns the first plain mention of a document in the note at `path` into a link. */
  linkMention: (id: string, path: string) => post<Doc>(`/api/docs/${id}/link-mention`, { path }),
};
