/* Routes for flashcards and review: browsing them with their memory state, making them (by hand, or
 * drafted from a passage by a model), the review queue and ratings (scheduled with FSRS-6), and the
 * decks. (Changing or deleting one is what every document does: routes/docs.ts.) */
import type { Hono } from "hono";
import type { Card, Note } from "../../shared/vault-types.ts";
import { getBook } from "../books/store.ts";
import { readBody } from "../http.ts";
import { deckCounts, draftCards, listCards, rateCard, reviewQueue, saveDrafts, saveNewCards } from "../learn/cards.ts";

type NewCard = Partial<Card> & { front: string; back: string };

export function cardRoutes(app: Hono) {
  app.get("/api/cards", (c) => c.json(listCards(c.req.query())));
  /** One card, or several as `{ cards: [...] }`. */
  app.post("/api/cards", async (c) => {
    const b = await readBody<{ cards?: NewCard[] } & Partial<NewCard>>(c);
    return c.json(saveNewCards(b.cards || [b as NewCard]));
  });

  app.post("/api/cards/draft", async (c) => c.json(await draftCards(await readBody(c))));
  app.post("/api/cards/save-drafts", async (c) => {
    const b = await readBody<{
      drafts: { front: string; back: string; type?: "basic" | "cloze"; concept?: string }[];
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
