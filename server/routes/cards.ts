/* Routes for flashcards and review: browsing, making (by hand, or drafted from a passage by a
 * model), editing, the review queue and ratings (scheduled with FSRS-6), and the decks. */
import type { Hono } from "hono";
import type { Card, Note } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { readBody } from "../http.ts";
import {
  deckCounts,
  deleteCard,
  draftCards,
  listCards,
  rateCard,
  reviewQueue,
  saveCard,
  saveDrafts,
  saveNewCards,
} from "../learn/cards.ts";
import { cards } from "../vault/index.ts";

type NewCard = Partial<Card> & { front: string; back: string };

export function cardRoutes(app: Hono) {
  app.get("/api/cards", (c) => c.json(listCards(c.req.query())));
  /** One card, or several as `{ cards: [...] }`. */
  app.post("/api/cards", async (c) => {
    const b = await readBody<{ cards?: NewCard[] } & Partial<NewCard>>(c);
    return c.json(saveNewCards(b.cards || [b as NewCard]));
  });
  app.put("/api/cards/:id", async (c) => {
    const card = cards.get(c.req.param("id"));
    if (!card) return c.json({ error: "not found" }, 404);
    const b = await readBody<Partial<NewCard>>(c);
    return c.json(saveCard({ ...card, ...b, id: card.id, front: b.front ?? card.front, back: b.back ?? card.back }));
  });
  app.delete("/api/cards/:id", (c) => {
    deleteCard(c.req.param("id"));
    return c.json({ ok: true });
  });

  app.post("/api/cards/draft", async (c) => c.json(await draftCards(await readBody(c))));
  app.post("/api/cards/save-drafts", async (c) => {
    const b = await readBody<{
      drafts: { front: string; back: string; kind?: "basic" | "cloze"; concept?: string }[];
      deck?: string;
      source?: Note["source"];
      concepts?: { name: string; summary: string }[];
    }>(c);
    // drafts from a book go in a deck named after it
    const deck = b.deck || (b.source?.bookId ? getBook(b.source.bookId)?.title : undefined) || "general";
    return c.json(saveDrafts(b.drafts || [], { deck, source: b.source, concepts: b.concepts }));
  });

  app.get("/api/review", (c) => c.json(reviewQueue({ deck: c.req.query("deck") || undefined })));
  app.post("/api/review/:id", async (c) => {
    const b = await readBody<{ rating: 1 | 2 | 3 | 4; took?: number }>(c);
    return c.json(rateCard(c.req.param("id"), b.rating, b.took));
  });
  app.get("/api/decks", (c) => c.json(deckCounts()));
}
