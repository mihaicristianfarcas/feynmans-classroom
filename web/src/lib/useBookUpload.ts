/* Adding a book from a file, as Library and Today do: from a hidden file field the button opens, or from a
 * file dropped on the page (counted while it's dragged over, so moving across children doesn't flicker
 * the overlay). Once read, the book opens. */
import { type DragEvent, useRef, useState } from "react";
import { api } from "../api";

export const BOOK_FORMATS = "PDF with selectable text, EPUB, Markdown or plain text";
export const BOOK_ACCEPT = ".pdf,.epub,.md,.markdown,.txt";

export function useBookUpload(onDone?: () => void) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(file.name);
    try {
      const book = await api.upload(file);
      location.hash = `#/book/${book.id}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
      onDone?.();
    }
  };
  const files = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  /** Spread on the element that takes a dropped file. */
  const dropTarget = {
    onDragEnter: (e: DragEvent) => files(e) && setDrag((n) => n + 1),
    onDragLeave: (e: DragEvent) => files(e) && setDrag((n) => Math.max(0, n - 1)),
    onDragOver: (e: DragEvent) => files(e) && e.preventDefault(),
    onDrop: (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      setDrag(0);
      upload(e.dataTransfer.files[0]);
    },
  };
  /** Spread on the hidden file field. */
  const field = {
    ref: input,
    type: "file",
    accept: BOOK_ACCEPT,
    hidden: true,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      upload(e.target.files?.[0]);
      e.target.value = "";
    },
  };
  return { uploading, error, dragging: drag > 0, choose: () => input.current?.click(), dropTarget, field };
}
