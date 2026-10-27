/* What adding books has come to, under the Library's title (and on Today before the first book): how
 * far a round of several books has got, with a way to stop the rest, and the files that weren't added
 * and why, until they're put away (a long list shows its first few, the rest on demand). */
import { X } from "lucide-react";
import type { Failure } from "../lib/addBooks";
import type { useBookUpload } from "../lib/useBookUpload";
import { Spinner } from "./feedback";

const SHOWN = 6;

export function AddingBooks({ add }: { add: ReturnType<typeof useBookUpload> }) {
  const left = add.leftOut ? `, ${add.leftOut} file${add.leftOut === 1 ? "" : "s"} left out` : "";
  return (
    <>
      {add.current !== null && add.total > 1 && (
        <div className="adding">
          <Spinner label={`Adding books: ${add.sent + 1} of ${add.total}${left}`} />
          {add.sent + 1 < add.total && (
            <button
              type="button"
              className="button subtle small"
              onClick={add.stop}
              title="Add the one being read, and no more"
            >
              Stop
            </button>
          )}
        </div>
      )}
      {add.failed.length > 0 && (
        <div className="notice adding-failed" role="alert">
          {add.failed.length === 1 ? (
            <p>
              <Failed {...add.failed[0]} />
            </p>
          ) : (
            <div>
              <p>{add.failed.length} files weren’t added:</p>
              <ul>
                {add.failed.slice(0, SHOWN).map((f, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the list only grows, and is put away whole
                  <li key={i}>
                    <Failed {...f} />
                  </li>
                ))}
              </ul>
              {add.failed.length > SHOWN && (
                <details>
                  <summary>{add.failed.length - SHOWN} more</summary>
                  <ul>
                    {add.failed.slice(SHOWN).map((f, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: the list only grows, and is put away whole
                      <li key={i}>
                        <Failed {...f} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <button
            type="button"
            className="icon-button small"
            onClick={add.dismiss}
            aria-label="Dismiss"
            title="Dismiss"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}

function Failed({ name, error }: Failure) {
  return (
    <>
      {name && <span className="adding-name">{name}: </span>}
      {error}
    </>
  );
}
