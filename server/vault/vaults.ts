/* The learner's vaults: each one a folder of its own, listed by name in DATA_DIR/vaults.json with the
 * one that is open. The first is DATA_DIR/vault (made on the first start); a vault made in the app goes
 * in DATA_DIR/vaults/<name>. Which vault is open, and the work that belongs to it, is current.ts's; the
 * books two vaults share are kept once (books/shared.ts). */
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_DIR } from "../config.ts";
import { readJson, safeJoin, writeJson } from "../fs.ts";
import { shortId, slugify } from "./files.ts";

export interface VaultEntry {
  id: string;
  name: string;
  /** Its folder, relative to DATA_DIR. */
  dir: string;
  created?: string;
}

interface Registry {
  open: string;
  vaults: VaultEntry[];
}

const FILE = () => resolve(DATA_DIR, "vaults.json");
/** The vault there is before any other is made. */
const FIRST: VaultEntry = { id: "main", name: "My vault", dir: "vault" };

function read(): Registry {
  const saved = readJson<Partial<Registry>>(FILE(), {});
  const vaults = (Array.isArray(saved.vaults) ? saved.vaults : []).filter(
    (v) => v && typeof v.id === "string" && typeof v.name === "string" && typeof v.dir === "string",
  );
  if (!vaults.length) vaults.push({ ...FIRST });
  return { open: vaults.some((v) => v.id === saved.open) ? saved.open! : vaults[0].id, vaults };
}

const write = (registry: Registry) => writeJson(FILE(), registry);

/** Every vault, in the order they were made. */
export const listVaults = (): VaultEntry[] => read().vaults;

export const findVault = (id: string): VaultEntry | undefined => read().vaults.find((v) => v.id === id);

/** The vault that is open (or opens when the server starts). */
export function openEntry(): VaultEntry {
  const registry = read();
  return registry.vaults.find((v) => v.id === registry.open)!;
}

/** Remembers which vault is open, for the next start. */
export function rememberOpen(id: string) {
  const registry = read();
  if (!registry.vaults.some((v) => v.id === id)) throw new Error("no such vault");
  write({ ...registry, open: id });
}

/** A vault's folder. Throws for an entry pointing outside DATA_DIR (or at it), which the app never makes. */
export function vaultPath(vault: VaultEntry): string {
  const path = safeJoin(DATA_DIR, vault.dir);
  if (!path || path === resolve(DATA_DIR)) throw new Error(`the vault “${vault.name}” has no folder of its own`);
  return path;
}

/** A name a vault can have: trimmed, not empty, not too long, and not another vault's. */
function checkName(name: unknown, others: VaultEntry[]): string {
  const clean = String(name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) throw new Error("Give the vault a name.");
  if (clean.length > 60) throw new Error("That name is too long (60 characters at most).");
  if (others.some((v) => v.name.toLowerCase() === clean.toLowerCase()))
    throw new Error(`There’s already a vault called “${clean}”.`);
  return clean;
}

/** Makes a new, empty vault folder (DATA_DIR/vaults/<name>) and lists it. It is set up when it is opened. */
export function addVault(name: string): VaultEntry {
  const registry = read();
  const clean = checkName(name, registry.vaults);
  const base = `vaults/${slugify(clean, 40)}`;
  let dir = base;
  for (let n = 2; existsSync(resolve(DATA_DIR, dir)) || registry.vaults.some((v) => v.dir === dir); n++)
    dir = `${base}-${n}`;
  const vault: VaultEntry = { id: shortId("v"), name: clean, dir, created: new Date().toISOString() };
  mkdirSync(vaultPath(vault), { recursive: true });
  write({ ...registry, vaults: [...registry.vaults, vault] });
  return vault;
}

export function renameVault(id: string, name: string): VaultEntry {
  const registry = read();
  const vault = registry.vaults.find((v) => v.id === id);
  if (!vault) throw new Error("no such vault");
  vault.name = checkName(
    name,
    registry.vaults.filter((v) => v.id !== id),
  );
  write(registry);
  return vault;
}

/** Deletes a vault's folder for good and takes it off the list. Not the open one: open another first. */
export function removeVault(id: string) {
  const registry = read();
  const vault = registry.vaults.find((v) => v.id === id);
  if (!vault) throw new Error("no such vault");
  if (registry.open === id) throw new Error("That vault is open: open another one first.");
  const path = vaultPath(vault);
  if (existsSync(path) && statSync(path).isDirectory()) rmSync(path, { recursive: true, force: true });
  write({ ...registry, vaults: registry.vaults.filter((v) => v.id !== id) });
}
