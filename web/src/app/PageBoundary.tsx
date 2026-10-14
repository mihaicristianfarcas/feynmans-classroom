/* What a page shows when it fails to draw, or its code fails to load (a tab left open across an
 * update asks for files that are gone): a message and a way to reload, instead of a blank window. */
import { Component, type ReactNode } from "react";

export class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = /dynamically imported module|Importing a module script failed|error loading/i.test(error.message);
    return (
      <div className="center-note" role="alert">
        <p>{stale ? "The app was updated. Reload to carry on." : "Something went wrong on this page."}</p>
        {!stale && <p className="fine">{error.message}</p>}
        <button type="button" className="button primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
