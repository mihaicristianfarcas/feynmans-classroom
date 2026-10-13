/* The reader's help (press ?): how the margin works and every keyboard shortcut. A dialog that keeps
 * focus while open and closes on Escape. */
import { X } from "lucide-react";
import { useRef } from "react";
import { useFocusTrap } from "../lib/a11y";

export function ReaderHelp({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, true, { onEscape: onClose });
  return (
    <div className="help-pop" role="dialog" aria-label="Help" ref={box}>
      <button type="button" className="icon-button help-close" onClick={onClose} aria-label="Close help">
        <X aria-hidden="true" />
      </button>
      <h3>How this works</h3>
      <p>
        Read on the right. Select any passage for the menu: an explanation, a definition, an answer or a figure appears
        in the margin on the left, beside the passage, and is saved with the book in your vault.
      </p>
      <ul>
        <li>
          Select, then <kbd>H</kbd> highlight · <kbd>E</kbd> explain · <kbd>V</kbd> visualize · <kbd>A</kbd> ask ·{" "}
          <kbd>D</kbd> define · <kbd>N</kbd> add the passage to your note
        </li>
        <li>
          Without a mouse: <kbd>Tab</kbd> to the book (or use “Skip to the book”), scroll with the arrow keys, and press{" "}
          <kbd>S</kbd> to select the passage at the reading line; the menu opens with focus in it
        </li>
        <li>Click a marked passage to open its card; ask follow-ups in the card</li>
        <li>
          <kbd>C</kbd> capture a figure, formula or table from the page into your note (with a transcription if you
          like)
        </li>
        <li>
          <em>Note</em>: your notes while reading (passages land there). <em>Figures</em>: the chapter’s figures, large.{" "}
          <em>Study</em>: pretest, quiz, concepts
        </li>
        <li>
          <kbd>[</kbd> <kbd>]</kbd> previous / next figure · <kbd>⌘K</kbd> searches everything you’ve read and written
        </li>
      </ul>
    </div>
  );
}
