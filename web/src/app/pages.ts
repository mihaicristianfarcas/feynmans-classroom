/* Every page's code, as its own chunk fetched on first visit, and fetched ahead: all of them once the app
 * is idle, and one page with what it shows first as soon as a link to it is pointed at or focused (so a
 * click finds it ready). The data keys are the ones the pages load under (useLoad's key). */
import { lazy } from "react";
import { api, learn } from "../api";
import { prime } from "../lib/cache";

const code = {
  reader: () => import("../reader/Reader"),
  notes: () => import("../notes/Notes"),
  brain: () => import("../pages/brain/Brain"),
  gallery: () => import("../pages/Gallery"),
  journey: () => import("../pages/Journey"),
  library: () => import("../pages/Library"),
  review: () => import("../pages/Review"),
  settings: () => import("../pages/Settings"),
  welcome: () => import("../pages/Welcome"),
};

export const Reader = lazy(() => code.reader().then((m) => ({ default: m.Reader })));
export const Notes = lazy(() => code.notes().then((m) => ({ default: m.Notes })));
export const Brain = lazy(() => code.brain().then((m) => ({ default: m.Brain })));
export const Gallery = lazy(() => code.gallery().then((m) => ({ default: m.Gallery })));
export const Journey = lazy(() => code.journey().then((m) => ({ default: m.Journey })));
export const Library = lazy(() => code.library().then((m) => ({ default: m.Library })));
export const Review = lazy(() => code.review().then((m) => ({ default: m.Review })));
export const Settings = lazy(() => code.settings().then((m) => ({ default: m.Settings })));
export const Welcome = lazy(() => code.welcome().then((m) => ({ default: m.Welcome })));

const quiet = (p: Promise<unknown>) => void p.catch(() => {});

/** What each page shows first, loaded ahead under the key the page reads it by. */
const DATA: Record<string, () => void> = {
  today: () => {
    quiet(prime("today", learn.today));
    quiet(prime("journey", learn.journey));
  },
  library: () => quiet(prime("books", api.books)),
  journey: () => quiet(prime("journey", learn.journey)),
  review: () => quiet(prime("decks", learn.decks)),
  notes: () => quiet(prime("tree", learn.tree)),
  brain: () => quiet(prime("graph", learn.graph)),
  settings: () => quiet(prime("settings", learn.settings)),
};

/** The page a link goes to, by its hash (#/library → library, #/ → today). */
export const pageOf = (href: string) => href.replace(/^#\/?/, "").split(/[/?]/)[0] || "today";

/** Fetches a page's code and what it shows first, ahead of a visit. */
export function preload(page: string) {
  const load = code[(page === "book" ? "reader" : page) as keyof typeof code];
  if (load) quiet(load());
  DATA[page]?.();
}

/** Fetches every page's code, for when the app has nothing else to do. */
export function preloadAll() {
  for (const load of Object.values(code)) quiet(load());
}

/** Props for a link that fetch the page it goes to as soon as it is pointed at, touched or focused. */
export const ahead = (href: string) => {
  const go = () => preload(pageOf(href));
  return { onPointerEnter: go, onFocus: go, onTouchStart: go };
};
