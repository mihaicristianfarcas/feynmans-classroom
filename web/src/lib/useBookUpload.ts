/* Adding books from files, as Library and Today do: from a hidden file field the button opens (several
 * files can be chosen at once), from another for a whole folder, or from files and folders dropped on
 * the page (counted while they're dragged over, so moving across children doesn't flicker the overlay).
 * The adding itself, and what it has come to, is lib/addBooks.ts; `onDone` runs as each file is sent. */
import { type DragEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BOOK_EXTENSIONS } from "../../../shared/book-files.ts";
import {
  addBooks,
  adding,
  dismissFailures,
  droppedFiles,
  onBookSent,
  pickedFiles,
  stopAdding,
  subscribe,
} from "./addBooks";

export const BOOK_FORMATS = "PDF with selectable text, EPUB, Markdown or plain text";
export const BOOK_ACCEPT = BOOK_EXTENSIONS.join(",");

export function useBookUpload(onDone?: () => void) {
  const state = useSyncExternalStore(subscribe, adding);
  const [drag, setDrag] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => onBookSent(() => done.current?.()), []);

  const files = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  /** Spread on the element that takes dropped files. */
  const dropTarget = {
    onDragEnter: (e: DragEvent) => files(e) && setDrag((n) => n + 1),
    onDragLeave: (e: DragEvent) => files(e) && setDrag((n) => Math.max(0, n - 1)),
    onDragOver: (e: DragEvent) => files(e) && e.preventDefault(),
    onDrop: (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      setDrag(0);
      droppedFiles(e.dataTransfer).then(addBooks);
    },
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = pickedFiles(e.target.files);
    e.target.value = "";
    if (picked.length) addBooks(picked);
  };
  /** Spread on the hidden file field. */
  const field = { ref: input, type: "file", accept: BOOK_ACCEPT, multiple: true, hidden: true, onChange };
  /** Spread on the hidden field for a folder (everything in it, all the way down). */
  const folderField = { ref: folderInput, type: "file", webkitdirectory: "", hidden: true, onChange };
  return {
    ...state,
    dragging: drag > 0,
    choose: () => input.current?.click(),
    chooseFolder: () => folderInput.current?.click(),
    dropTarget,
    field,
    folderField,
    stop: stopAdding,
    dismiss: dismissFailures,
  };
}
