/* The notes page (#/notes[/<id>]), like Obsidian: the file tree on the left and the open note beside
 * it (or a welcome when none is open), with its links on the right. Both sides can be resized from their
 * edge, or closed and opened again with the buttons above the note. Moving to another note keeps the
 * one on show until the next has loaded (a note seen before shows at once), so the page never blanks
 * or jumps. It reopens the last note and reloads when the vault changes. On a phone it is one or the
 * other: the list, or the note with a way back to the list (so there it doesn't reopen the last note).
 * The tree, the note and its sidebar live beside this file. */
import { SquarePen } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { learn, type NoteDetail } from "../api";
import { go } from "../app/navigation";
import { PanelEdge, PanelToggle } from "../components/Panel";
import { useLoad } from "../lib/useLoad";
import { type Panel, usePanel } from "../lib/usePanel";
import { under, useVaultEvents } from "../lib/useVaultEvents";
import { FileTree, newNote, type Tree } from "./FileTree";
import { keptNote, loadNote } from "./kept";
import { NotePane } from "./NotePane";

/** Where the list and the note take turns (as in notes.css). */
const PHONE = "(max-width: 760px)";

export function Notes({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const route = hash.split("?")[0];
  const id = route.startsWith("#/notes/") ? decodeURIComponent(route.slice("#/notes/".length)) || null : null;
  const { data: tree, reload } = useLoad(() => learn.tree(), [], "tree");
  useEffect(() => {
    // remember the last note, and open it when coming back to Notes
    try {
      if (id) localStorage.setItem("classroom-last-note", id);
      else if ((route === "#/notes" || route === "#/notes/") && !matchMedia(PHONE).matches) {
        const last = localStorage.getItem("classroom-last-note");
        if (last) go(`#/notes/${last}`);
      }
    } catch {}
  }, [id, route]);
  useVaultEvents(reload, under("notes/"));
  const list = usePanel("notes-list", { initial: 260, min: 180, max: 480 });
  // on a phone the list is the page until a note is opened, even if it was closed on a wider screen
  const [phone, setPhone] = useState(() => matchMedia(PHONE).matches);
  useEffect(() => {
    const media = matchMedia(PHONE);
    const on = () => setPhone(media.matches);
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, []);
  const links = usePanel("notes-links", { initial: 300, min: 220, max: 520 });
  const shown = useShown(id);
  return (
    <div className="notes-page" data-open={id ? "" : undefined}>
      {(list.open || (phone && !id)) && <FileTree tree={tree} current={id} reload={reload} panel={list} />}
      <PanelEdge panel={list} side="left" label="note list" />
      {!id ? (
        <EmptyNotes tree={tree} list={list} />
      ) : shown ? (
        <NotePane
          key={shown.id}
          id={shown.id}
          initial={shown.note}
          theme={theme}
          onChanged={reload}
          list={list}
          links={links}
        />
      ) : (
        // the visit's first note, a moment away: its place, empty
        <div className="note-pane" />
      )}
    </div>
  );
}

/**
 * The note to show for `id`: the one asked for once it has loaded (at once if it was loaded before), and
 * until then the one shown before it. A note that can't be loaded is shown without its text, for the
 * pane to say what went wrong.
 */
function useShown(id: string | null) {
  const [shown, setShown] = useState<{ id: string; note: NoteDetail | null } | null>(() => {
    const note = id ? keptNote(id) : undefined;
    return id && note ? { id, note } : null;
  });
  // before the page is painted, so a note kept from before replaces the last without a frame between
  useLayoutEffect(() => {
    if (!id) {
      setShown(null);
      return;
    }
    const note = keptNote(id);
    if (note) {
      setShown((s) => (s?.id === id ? s : { id, note }));
      return;
    }
    let alive = true;
    loadNote(id).then(
      (n) => alive && setShown({ id, note: n }),
      () => alive && setShown({ id, note: null }),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  return shown;
}

function EmptyNotes({ tree, list }: { tree: Tree | null; list: Panel }) {
  return (
    <div className="note-pane empty-pane">
      <PanelToggle panel={list} side="left" label="note list" className="icon-button small pane-corner" />
      <div className="empty-state rise">
        <h1 className="empty-title">Notes</h1>
        <p className="fine">
          Write what you think as you learn. <code>[[Brackets]]</code> link ideas; every note is a Markdown file in your
          vault.
        </p>
        <button type="button" className="button primary" onClick={() => newNote("")}>
          <SquarePen aria-hidden="true" />
          New note
        </button>
        {tree && tree.notes.length > 0 && list.open && <p className="fine">Or pick one from your notes.</p>}
      </div>
    </div>
  );
}
