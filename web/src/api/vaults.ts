/* The API for vaults: every vault with what it holds, and making, renaming, deleting and opening one. */
import { call, del, patch, post } from "./client";
import type { VaultSummary } from "./types";

export const vaults = {
  list: () => call<VaultSummary[]>("/api/vaults"),
  /** Makes a vault (with these books from any vault); it isn't opened. */
  create: (name: string, books: string[] = []) => post<VaultSummary>("/api/vaults", { name, books }),
  rename: (id: string, name: string) => patch<VaultSummary>(`/api/vaults/${id}`, { name }),
  remove: (id: string) => del(`/api/vaults/${id}`),
  /** Opens a vault (closing the open one); answered once it is open. */
  open: (id: string) => post<VaultSummary>(`/api/vaults/${id}/open`),
};
