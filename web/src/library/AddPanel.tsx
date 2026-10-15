/* Adding to the library, in one dialog: links (one or several, each read into an article, or the PDF
 * behind it), a file (PDF, EPUB, Markdown or text; or drop one anywhere on the page), and a bookmark
 * for the browser's bar that saves whatever page you are on (it opens a page here that asks first). */
import { Bookmark, Link2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "../components/tools";

export const FORMATS = "PDF with selectable text, EPUB, Markdown or plain text";

/** Every web link in a piece of text (one per line, or an export from a read-later app). */
export function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s"'<>,]+/gi) || [];
  const bare = found.length ? [] : text.split(/\s+/).filter((w) => /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(w));
  return [...new Set([...found, ...bare].map((l) => l.replace(/[).,;]+$/, "")))];
}

export function AddPanel({
  onLinks,
  onFile,
  onClose,
}: {
  onLinks: (links: string[]) => void;
  onFile: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const bookmarklet = useRef<HTMLAnchorElement>(null);
  const links = linksIn(text);

  // React won't render a javascript: link, so the bookmark's address is set on the element itself
  useEffect(() => {
    const code = `javascript:void(window.open('${location.origin}/#/save?url='+encodeURIComponent(location.href)))`;
    bookmarklet.current?.setAttribute("href", code);
  }, []);

  return (
    <Modal title="Add to your library" onClose={onClose}>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!links.length) return setError("Paste a link to an article or a PDF.");
          onLinks(links);
        }}
      >
        <label className="add-label" htmlFor="add-links">
          <Link2 aria-hidden="true" />
          Save a link
        </label>
        <textarea
          id="add-links"
          rows={2}
          value={text}
          placeholder="https://… (an article or a PDF; several, one per line)"
          aria-describedby={error ? "add-error" : "add-hint"}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {error ? (
          <p className="form-error" id="add-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="fine" id="add-hint">
            Each page is read into an article (its pictures kept) and sorted onto a topic.
          </p>
        )}
        <div className="row">
          <span className="spacer" />
          <button type="submit" className="button primary" disabled={!text.trim()}>
            {links.length > 1 ? `Save ${links.length} links` : "Save"}
          </button>
        </div>
      </form>
      <div className="add-more">
        <button type="button" className="add-option" onClick={onFile}>
          <Upload aria-hidden="true" />
          <span>
            <strong>Add a file</strong>
            <span className="fine">{FORMATS}, or drop one on the page</span>
          </span>
        </button>
        <div className="add-option" data-static="">
          <Bookmark aria-hidden="true" />
          <span>
            <strong>Save from your browser</strong>
            <span className="fine">
              Drag{" "}
              {/* biome-ignore lint/a11y/useValidAnchor: a bookmark to drag to the browser's bar (its address is set above); clicked here, it does nothing */}
              <a
                ref={bookmarklet}
                className="bookmarklet"
                href="#/save"
                title="Drag me to your bookmarks bar"
                onClick={(e) => e.preventDefault()}
              >
                Save to Classroom
              </a>{" "}
              to your bookmarks bar, then click it on any article to save it here. Or{" "}
              <button
                type="button"
                className="link"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(bookmarklet.current?.getAttribute("href") || "")
                    .then(() => setCopied(true))
                }
              >
                {copied ? "copied" : "copy its address"}
              </button>{" "}
              and paste it as a new bookmark’s URL.
            </span>
          </span>
        </div>
      </div>
    </Modal>
  );
}
