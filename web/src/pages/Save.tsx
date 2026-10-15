/* #/save?url=…: where the browser bookmark ("Save to Classroom") lands. It never saves by itself (any
 * website could send you here): it shows the link and asks, one click to save it; then it shows the
 * article or PDF as it lands in the library, with the way to read it now. */
import { ArrowRight, Check, Library as LibraryIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Book } from "../api";
import { Spinner } from "../components/feedback";
import { announce } from "../lib/a11y";
import { Cover } from "../library/Spine";
import { lookOf } from "../library/shelf";
import "../library/library.css";

type State = { step: "ask" } | { step: "saving" } | { step: "saved"; book: Book } | { step: "failed"; error: string };

export function Save() {
  const [url] = useState(() => new URLSearchParams(location.hash.split("?")[1] || "").get("url")?.trim() || "");
  const [state, setState] = useState<State>({ step: "ask" });
  const saveButton = useRef<HTMLButtonElement>(null);
  const parsed = (() => {
    try {
      const u = new URL(url);
      return /^https?:$/.test(u.protocol) ? u : null;
    } catch {
      return null;
    }
  })();
  useEffect(() => {
    saveButton.current?.focus({ preventScroll: true });
  }, []);

  const save = async () => {
    setState({ step: "saving" });
    try {
      const book = await api.saveLink(url);
      setState({ step: "saved", book });
      announce(`Saved ${book.title} to your library.`);
    } catch (e) {
      setState({ step: "failed", error: (e as Error).message });
    }
  };

  if (!parsed)
    return (
      <div className="save-page rise">
        <h1 className="page-title">Save a page</h1>
        <p className="fine">
          This page saves the link a bookmark sends it. Add links from the <a href="#/library">library</a> instead.
        </p>
      </div>
    );

  return (
    <div className="save-page rise">
      {state.step === "saved" ? (
        <div className="save-done">
          <span className="save-cover" aria-hidden="true">
            <Cover book={state.book} look={lookOf(state.book)} />
          </span>
          <div>
            <p className="save-kicker">
              <Check aria-hidden="true" /> Saved to your library
            </p>
            <h1 className="save-title">{state.book.title}</h1>
            <p className="fine">
              {state.book.author || parsed.hostname.replace(/^www\./, "")}
              {state.book.format === "pdf" && state.book.pageCount ? ` · ${state.book.pageCount} pages` : ""}
            </p>
            <div className="row gap save-actions">
              <a className="button primary" href={`#/book/${state.book.id}`}>
                Read it now
                <ArrowRight aria-hidden="true" />
              </a>
              <a className="button" href="#/library">
                <LibraryIcon aria-hidden="true" />
                Go to the library
              </a>
            </div>
          </div>
        </div>
      ) : (
        <>
          <h1 className="page-title">Save this to your library?</h1>
          <p className="save-url">
            <strong>{parsed.hostname.replace(/^www\./, "")}</strong>
            <span>{`${parsed.pathname}${parsed.search}`.slice(0, 160)}</span>
          </p>
          <p className="fine">
            The page is read into an article (its pictures kept on this computer), or added as a PDF, and sorted onto a
            topic.
          </p>
          {state.step === "failed" && (
            <p className="form-error" role="alert">
              {state.error}
            </p>
          )}
          <div className="row gap save-actions">
            <button
              ref={saveButton}
              type="button"
              className="button primary"
              onClick={save}
              disabled={state.step === "saving"}
            >
              {state.step === "saving" ? (
                <Spinner label="Reading the page…" />
              ) : state.step === "failed" ? (
                "Try again"
              ) : (
                "Save"
              )}
            </button>
            <a className="button subtle" href="#/library">
              Cancel
            </a>
          </div>
        </>
      )}
    </div>
  );
}
