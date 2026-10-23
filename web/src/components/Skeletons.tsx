/* What a page looks like while it loads: its title at once (so the page is named), and quiet shapes
 * where its content will be, laid out as the page lays it out, so nothing jumps when it arrives. The
 * shapes fade in after a moment, so a quick load shows nothing in between. The same skeleton stands in
 * while a page's code arrives and while its data does. */

const Bone = ({ className = "" }: { className?: string }) => <span className={`sk ${className}`} aria-hidden="true" />;
const Lines = ({ n, className = "" }: { n: number; className?: string }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the lines are all alike and never move
      <Bone key={i} className={`sk-line ${i === n - 1 ? "short" : ""} ${className}`} />
    ))}
  </>
);
const Status = ({ what }: { what: string }) => (
  <span className="visually-hidden" role="status">
    Opening {what}…
  </span>
);
const Head = ({ title }: { title: string }) => (
  <header className="page-head">
    <h1 className="page-title">{title}</h1>
  </header>
);

/** A page of the shell loading, by its route's name. */
export function PageSkeleton({ page, title }: { page: string; title: string }) {
  if (page === "today") return <TodaySkeleton />;
  if (page === "notes")
    return (
      <div className="sk-notes" aria-busy="true">
        <Status what="your notes" />
        <div className="sk-notes-list">
          <Bone className="sk-field small" />
          <Lines n={7} />
        </div>
        <div className="sk-notes-doc">
          <Bone className="sk-title" />
          <Lines n={6} />
        </div>
      </div>
    );
  if (page === "brain")
    return (
      <div className="sk-brain" aria-busy="true">
        <Status what="your brain" />
        <Bone className="sk-field small" />
      </div>
    );
  return (
    // a page set narrower than the container (Review) keeps its width while it loads, so nothing jumps
    <div className={page === "review" ? "sk-page review" : "sk-page"} aria-busy="true">
      <Status what={title.toLowerCase()} />
      <Head title={title} />
      {page === "library" ? (
        <ShelfSkeleton />
      ) : page === "review" ? (
        <div className="review-stage">
          <Bone className="sk-card" />
        </div>
      ) : page === "journey" ? (
        <>
          <div className="sk-stats">
            <Bone className="sk-stat" />
            <Bone className="sk-stat" />
            <Bone className="sk-stat" />
            <Bone className="sk-stat" />
          </div>
          <Bone className="sk-block" />
        </>
      ) : (
        <div className="sk-text">
          <Lines n={5} />
        </div>
      )}
    </div>
  );
}

/** Today: the greeting, the ask field, the book you were reading and the side column. */
export function TodaySkeleton() {
  return (
    <div className="today sk-today" aria-busy="true">
      <Status what="today" />
      <div className="today-head">
        <Bone className="sk-title-lg" />
        <Bone className="sk-line short" />
      </div>
      <Bone className="sk-field" />
      <div className="today-grid">
        <div className="today-main">
          <Bone className="sk-hero" />
        </div>
        <div className="today-side">
          <Bone className="sk-panel" />
          <Bone className="sk-panel" />
        </div>
      </div>
    </div>
  );
}

/** The library's shelf: covers with a line under each. */
export function ShelfSkeleton({ n = 6 }: { n?: number }) {
  return (
    <ul className="shelf" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the covers are all alike and never move
        <li key={i} className="sk-book">
          <Bone className="sk-cover" />
          <Bone className="sk-line" />
          <Bone className="sk-line short" />
        </li>
      ))}
    </ul>
  );
}

/** A book opening in the reader: a page of lines where the book will be. */
export function BookSkeleton() {
  return (
    <div className="sk-book-page" aria-busy="true">
      <Status what="the book" />
      <div className="sk-sheet">
        <Bone className="sk-title" />
        <Lines n={9} />
        <Bone className="sk-figure" />
        <Lines n={5} />
      </div>
    </div>
  );
}

/** The reader opening: its bar, the margin and the book. */
export function ReaderSkeleton() {
  return (
    <div className="sk-reader" aria-busy="true">
      <div className="sk-reader-bar">
        <Bone className="sk-chip" />
        <Bone className="sk-line" />
      </div>
      <div className="sk-reader-body">
        <div className="sk-reader-margin">
          <Lines n={3} />
        </div>
        <BookSkeleton />
      </div>
    </div>
  );
}

/** The note list loading: a few rows. */
export function TreeSkeleton() {
  return (
    <div className="sk-tree" aria-busy="true">
      <Status what="your notes" />
      <Lines n={6} />
    </div>
  );
}

/** A note opening: its title, its bar, a few lines. */
export function NoteSkeleton() {
  return (
    <div className="note-main sk-note" aria-busy="true">
      <Status what="the note" />
      <Bone className="sk-title" />
      <Bone className="sk-line short" />
      <Lines n={5} />
    </div>
  );
}
