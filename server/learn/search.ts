/* Searching everything from the ⌘K palette: every document (concepts, notes, annotations, sessions
 * with the tutor, cards, figures), the notes of every vault, and the books' text, ranked by
 * simple term scores with the titles weighted up. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Doc, DocKind } from "../../shared/vault-types.ts";
import { listBooks } from "../books/store.ts";
import { docs, VAULT } from "../vault/index.ts";
import { chapterFile } from "../vault/library.ts";
import { getVault, listVaults } from "../vaults/index.ts";

export interface SearchHit {
  /** "vault": a vault note (`vault`, `path`). */
  kind: DocKind | "book" | "vault";
  id: string;
  title: string;
  snippet: string;
  score: number;
  bookId?: string;
  loc?: { page?: number; block?: number };
  vault?: string;
  vaultName?: string;
  path?: string;
}

const words = (q: string) =>
  q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);

function scoreText(text: string, terms: string[]): number {
  const low = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const n = low.split(t).length - 1;
    if (!n) return 0; // every term must appear
    s += Math.log(1 + n);
  }
  return s;
}

function snippet(text: string, terms: string[], width = 160): string {
  const low = text.toLowerCase();
  const at = Math.max(0, Math.min(...terms.map((t) => low.indexOf(t)).filter((i) => i >= 0)) - 50);
  return `${at > 0 ? "…" : ""}${text
    .slice(at, at + width)
    .replace(/\s+/g, " ")
    .trim()}${at + width < text.length ? "…" : ""}`;
}

/** How each kind's text is weighed against the others', and what a hit shows. */
const WEIGHT: Record<DocKind, number> = { concept: 1.6, note: 1.3, annotation: 1.2, session: 1.1, figure: 1, card: 1 };

/** The words a document is found by (its title counts twice) and the text a hit's snippet comes from. */
function searchable(d: Doc): { text: string; snippetOf: string } {
  const extra =
    d.kind === "concept"
      ? d.summary
      : d.kind === "annotation"
        ? `${d.source.quote} ${d.request || ""}`
        : d.kind === "card"
          ? `${d.front} ${d.back}`
          : "";
  return {
    text: `${d.title} ${d.title} ${d.aliases.join(" ")} ${d.tags.join(" ")} ${extra} ${d.body}`,
    snippetOf:
      d.kind === "concept" ? d.summary || d.body : d.kind === "card" ? d.back : d.body || d.source?.quote || "",
  };
}

export function search(q: string, limit = 40): SearchHit[] {
  const terms = words(q);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const d of docs.list()) {
    const { text, snippetOf } = searchable(d);
    const s = scoreText(text, terms);
    if (!s) continue;
    const at = d.source;
    hits.push({
      kind: d.kind,
      id: d.id,
      title: d.title,
      snippet: d.kind === "concept" && d.summary ? d.summary : snippet(snippetOf, terms),
      score: s * WEIGHT[d.kind],
      bookId: at?.bookId,
      loc: at?.page !== undefined ? { page: at.page } : at?.block !== undefined ? { block: at.block } : undefined,
    });
  }
  for (const v of listVaults()) {
    let vault: ReturnType<typeof getVault>;
    try {
      vault = getVault(v.id);
    } catch {
      continue;
    }
    for (const e of vault.files.values()) {
      if (e.kind !== "note" || !e.text) continue;
      const s = scoreText(`${e.name} ${e.name} ${e.aliases.join(" ")} ${e.tags.join(" ")} ${e.text}`, terms);
      if (!s) continue;
      hits.push({
        kind: "vault",
        id: `${v.id}:${e.path}`,
        title: e.name,
        snippet: snippet(e.text.slice(e.bodyStart || 0), terms),
        score: s * WEIGHT.note,
        vault: v.id,
        vaultName: v.name,
        path: e.path,
      });
    }
  }
  // book text, by chapter file in the library
  for (const b of listBooks().filter((x) => x.status === "ready")) {
    b.toc.forEach((ch, i) => {
      let body = "";
      try {
        body = readFileSync(join(VAULT, chapterFile(b, i)), "utf8");
      } catch {
        return;
      }
      const s = scoreText(body, terms);
      if (!s) return;
      const low = body.toLowerCase();
      const idx = low.indexOf(terms[0]);
      const marker = [...body.slice(0, idx).matchAll(/\[\[(page|block) (\d+)\]\]/g)].pop();
      hits.push({
        kind: "book",
        id: `${b.id}:${ch.id}`,
        title: `${b.title} · ${ch.title}`,
        snippet: snippet(body.replace(/\[\[(page|block) \d+\]\]/g, ""), terms),
        score: s * 0.8,
        bookId: b.id,
        loc: marker ? { [marker[1]]: Number(marker[2]) } : undefined,
      });
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
