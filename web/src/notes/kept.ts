/* Notes kept for the visit (lib/cache.ts), under the key the notes page and the Brain's card both read
 * them by: a note opened again shows at once, and one pointed at in the list starts loading before the
 * click, so moving between notes never blanks the page. A note counts as loaded once what it shows
 * from elsewhere (pictures, math, embeds) is in too, so it is drawn whole. */
import { docs, type Note, type NoteDetail } from "../api";
import { prepareMarkdown } from "../components/markdownReady";
import { cached, keep, prime } from "../lib/cache";

export const noteKey = (id: string) => `note:${id}`;

/** The note as it was last loaded, if it was. */
export const keptNote = (id: string) => cached<NoteDetail>(noteKey(id));

/** Loads a note and what it shows (its pictures, math and embeds), without keeping it. */
export async function fetchNote(id: string): Promise<NoteDetail> {
  const note = await docs.get<Note>(id);
  await prepareMarkdown(note.body);
  return note;
}

/** Loads a note (joining a load already on its way) and keeps it. */
export const loadNote = (id: string) => prime(noteKey(id), () => fetchNote(id));

/** Keeps a note as it was just loaded. */
export const keepNote = (note: NoteDetail) => keep(noteKey(note.id), note);

/** Props for a link to a note that load it as soon as it is pointed at, touched or focused. */
export const noteAhead = (id: string) => {
  const go = () => void loadNote(id).catch(() => {});
  return { onPointerEnter: go, onFocus: go, onTouchStart: go };
};
