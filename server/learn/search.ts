/* Searching the whole vault from the ⌘K palette: concepts, notes, annotations, sessions with the tutor,
 * cards and the books' text, ranked by simple term scores with the titles weighted up. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listBooks } from "../books/store.ts";
import { annotations, cards, concepts, notes, sessions, VAULT } from "../vault/index.ts";
import { chapterFile } from "../vault/library.ts";

export interface SearchHit {
  kind: "note" | "concept" | "card" | "book" | "annotation" | "session";
  id: string;
  title: string;
  snippet: string;
  score: number;
  bookId?: string;
  loc?: { page?: number; block?: number };
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

export function search(q: string, limit = 40): SearchHit[] {
  const terms = words(q);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const c of concepts.list()) {
    const s = scoreText(`${c.name} ${c.name} ${c.aliases.join(" ")} ${c.summary} ${c.body}`, terms);
    if (s)
      hits.push({
        kind: "concept",
        id: c.id,
        title: c.name,
        snippet: c.summary || snippet(c.body, terms),
        score: s * 1.6,
      });
  }
  for (const n of notes.list()) {
    const s = scoreText(`${n.title} ${n.title} ${n.body} ${n.tags.join(" ")}`, terms);
    if (s)
      hits.push({
        kind: "note",
        id: n.id,
        title: n.title,
        snippet: snippet(n.body, terms),
        score: s * 1.3,
        bookId: n.source?.bookId,
      });
  }
  for (const a of annotations.list()) {
    const s = scoreText(`${a.anchor.quote} ${a.request || ""} ${a.body}`, terms);
    if (s)
      hits.push({
        kind: "annotation",
        id: a.id,
        title: `${a.kind}: ${a.anchor.quote.slice(0, 80)}`,
        snippet: snippet(a.body || a.anchor.quote, terms),
        score: s * 1.2,
        bookId: a.bookId,
        loc: a.anchor.page !== undefined ? { page: a.anchor.page } : { block: a.anchor.block },
      });
  }
  for (const x of sessions.list()) {
    const said = x.messages.map((m) => m.text).join(" ");
    const s = scoreText(`${x.title} ${x.title} ${said}`, terms);
    const where = x.passage?.source;
    if (s)
      hits.push({
        kind: "session",
        id: x.id,
        title: `Tutor: ${x.title}`,
        snippet: snippet(said, terms),
        score: s * 1.1,
        bookId: x.bookId,
        loc:
          where?.page !== undefined
            ? { page: where.page }
            : where?.block !== undefined
              ? { block: where.block }
              : undefined,
      });
  }
  for (const k of cards.list()) {
    const s = scoreText(`${k.front} ${k.back}`, terms);
    if (s) hits.push({ kind: "card", id: k.id, title: k.front.slice(0, 90), snippet: k.back.slice(0, 160), score: s });
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
