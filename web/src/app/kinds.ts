/* What each kind of document is called in the app, and its colour in lists. The server keeps every
 * kind the same way (a document with a `kind`); the pages show each its own way, and agree here on its
 * name (where it opens: docRoute in navigation.ts). */
import type { DocKind } from "../api";

export const KIND_NAME: Record<DocKind, string> = {
  note: "Note",
  concept: "Concept",
  card: "Card",
  annotation: "Annotation",
  session: "Session with the tutor",
  figure: "Figure",
};

/** A kind's pastel in lists and search results (books and passages are peach). */
export const KIND_TONE: Record<DocKind | "book", string> = {
  concept: "sage",
  note: "sky",
  annotation: "lavender",
  card: "butter",
  figure: "butter",
  book: "peach",
  session: "rose",
};
