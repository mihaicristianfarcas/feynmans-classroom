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
        Read on the right. Select any passage for the menu: an explanation, a definition, an answer, a figure or an
        animation appears in the margin on the left, beside the passage, and is saved with the book in your vault.
        Passages that overlap get their cards side by side.
      </p>
      <ul>
        <li>
          Select, then <kbd>H</kbd> highlight · <kbd>E</kbd> explain · <kbd>V</kbd> visualize (a figure, or an
          animation) · <kbd>A</kbd> ask · <kbd>D</kbd> define · <kbd>N</kbd> add the passage to your note
        </li>
        <li>
          Without a mouse: <kbd>Tab</kbd> to the book (or use “Skip to the book”), scroll with the arrow keys, and press{" "}
          <kbd>S</kbd> to select the passage at the reading line; the menu opens with focus in it
        </li>
        <li>Click a marked passage to line its card up beside it; ask follow-ups in the card, as with the tutor</li>
        <li>
          <kbd>⌘F</kbd> or <kbd>/</kbd> find in the whole book (<kbd>Enter</kbd> next, <kbd>Shift</kbd>+<kbd>Enter</kbd>{" "}
          previous, or choose from the list of every place) · <kbd>+</kbd> <kbd>−</kbd> zoom, <kbd>0</kbd> fit to the
          pane · <kbd>P</kbd> the pages as thumbnails · type in the page number to go there
        </li>
        <li>
          <kbd>C</kbd> capture a figure, formula or table from the page into your note (with a transcription if you
          like)
        </li>
        <li>
          <em>Note</em>: your notes while reading (passages land there). <em>Figures</em>: every figure and animation in
          this section, chapter or book. <em>Tutor</em>: conversations kept with the book. <em>Study</em>: pretest,
          quiz, concepts
        </li>
        <li>
          <kbd>[</kbd> <kbd>]</kbd> previous / next figure · <kbd>⌘K</kbd> searches everything you’ve read and written
        </li>
      </ul>
    </div>
  );
}
