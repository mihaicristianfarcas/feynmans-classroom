/* The notes page (#/notes[/<id>]), like Obsidian: the file tree on the left and the open note beside
 * it (or a welcome when none is open). It reopens the last note and reloads when the vault changes.
 * The tree, the note and its sidebar live beside this file. */
import { SquarePen } from "lucide-react";
import { useEffect, useState } from "react";
import { learn } from "../api";
import { go } from "../app/navigation";
import { useLoad } from "../lib/useLoad";
import { FileTree, newNote, type Tree } from "./FileTree";
import { NotePane } from "./NotePane";
import { useVaultEvents } from "./useVaultEvents";

export function Notes({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const route = hash.split("?")[0];
  const id = route.startsWith("#/notes/") ? decodeURIComponent(route.slice("#/notes/".length)) || null : null;
  const { data: tree, reload } = useLoad(() => learn.tree());
  useEffect(() => {
    // remember the last note, and open it when coming back to Notes
    try {
      if (id) localStorage.setItem("classroom-last-note", id);
      else if (route === "#/notes" || route === "#/notes/") {
        const last = localStorage.getItem("classroom-last-note");
        if (last) go(`#/notes/${last}`);
      }
    } catch {}
  }, [id, route]);
  useVaultEvents(reload);
  return (
    <div className="notes-page">
      <FileTree tree={tree} current={id} reload={reload} />
      {id ? <NotePane key={id} id={id} theme={theme} onChanged={reload} /> : <EmptyNotes tree={tree} />}
    </div>
  );
}

function EmptyNotes({ tree }: { tree: Tree | null }) {
  return (
    <div className="note-pane empty-pane">
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
        {tree && tree.notes.length > 0 && <p className="fine">Or pick one on the left.</p>}
      </div>
    </div>
  );
}
