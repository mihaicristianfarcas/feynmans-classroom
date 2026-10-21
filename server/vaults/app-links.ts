/* Links from a vault's notes to the rest of the app: a [[link]] (in the text, or a property such as
 * `about`) that names nothing in its own vault but names a concept, a book or a note of the app's
 * own vault leads there. These put vault notes on the concept's page and in the Brain's graph. */
import { docs, sourceFromYaml } from "../vault/index.ts";
import { type Resolved, resolveLink } from "../vault/links.ts";
import { getVault, listVaults } from "./index.ts";
import type { Vault } from "./vault.ts";

export interface AppLink {
  vault: string;
  vaultName: string;
  /** The vault note the link is in, and its name. */
  path: string;
  title: string;
  /** What it leads to in the app. */
  to: Resolved;
  /** Written in a property (`about`, `related`) rather than the text. */
  property: boolean;
}

const LEADS: Resolved["kind"][] = ["concept", "book", "note"];

/** Where a link that names nothing in the vault leads in the app, if anywhere. */
export function appTarget(target: string, sub?: string): Resolved | null {
  const r = resolveLink(target, sub);
  return r && LEADS.includes(r.kind) ? r : null;
}

/** The app links of one vault's notes. */
export function appLinksOf(vault: Vault, name: string): AppLink[] {
  const out: AppLink[] = [];
  for (const e of vault.files.values()) {
    if (e.kind !== "note") continue;
    const seen = new Set<string>();
    vault.outgoing(e.path).forEach((o, i) => {
      if (o.path || o.md) return;
      const to = appTarget(o.target, o.sub);
      if (!to || seen.has(to.node)) return;
      seen.add(to.node);
      out.push({ vault: vault.id, vaultName: name, path: e.path, title: e.name, to, property: e.links[i].line === -1 });
    });
    // Older notes store concept IDs and a structured source in frontmatter.
    // Read them from the file just like wiki properties; no migration-only index is needed.
    const concepts = Array.isArray(e.data?.concepts) ? e.data.concepts : [];
    const source = sourceFromYaml(e.data?.source);
    const targets = [
      ...concepts.filter((id): id is string => typeof id === "string" && !!docs.get(id, "concept")),
      ...(source?.bookId ? [source.bookId] : []),
    ];
    for (const target of targets) {
      const to = appTarget(
        target,
        target === source?.bookId && source.page !== undefined ? `page=${source.page}` : undefined,
      );
      if (!to || seen.has(to.node)) continue;
      seen.add(to.node);
      out.push({ vault: vault.id, vaultName: name, path: e.path, title: e.name, to, property: true });
    }
  }
  return out;
}

/** The app links of every vault. */
export function appLinks(): AppLink[] {
  return listVaults().flatMap((v) => {
    try {
      return appLinksOf(getVault(v.id), v.name);
    } catch {
      return [];
    }
  });
}
