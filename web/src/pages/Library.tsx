/* The library: your books and saved articles standing on a bookcase, sorted onto topics (or by when they
 * came, their title, their length), with a search and a topic to narrow it to; a book comes off the
 * shelf into your hands (BookInHand), and from there into the reader. Add a link, a file (or drop one
 * anywhere on the page, or paste a link), and it falls onto the shelf when it is in; books that arrive
 * from elsewhere (the bookmark, the agent, another tab) fall in as you look. Under Figures
 * (#/library/figures), the figures you drew. It mentions the model tool only when the one in use isn't
 * ready. */
import { Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { topicOf } from "../../../shared/topics.ts";
import { api, type Book, learn, type SettingsInfo } from "../api";
import { onServerEvent } from "../api/events";
import { Spinner } from "../components/feedback";
import { Toast, useToast } from "../components/Toast";
import { useIndicator } from "../components/ui";
import { announce } from "../lib/a11y";
import { AddPanel, FORMATS, linksIn } from "../library/AddPanel";
import { Arrivals, type Save } from "../library/Arrivals";
import { Bookcase } from "../library/Bookcase";
import { BookInHand } from "../library/BookInHand";
import { minutesOf, SORTS, type Sort, sortBooks } from "../library/shelf";
import "../library/library.css";
import { Figures } from "./Figures";

const SORT_KEY = "classroom-shelf-sort";

function savedSort(): Sort {
  try {
    const s = localStorage.getItem(SORT_KEY);
    if (SORTS.some((x) => x.key === s)) return s as Sort;
  } catch {}
  return "topic";
}

export function Library({ theme }: { theme: "light" | "dark" }) {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const view = hash.split("?")[0].startsWith("#/library/figures") ? "figures" : "books";
  const views = useIndicator<HTMLElement>(view);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [owner, setOwner] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(0);
  const [adding, setAdding] = useState(false);
  const [saves, setSaves] = useState<Save[]>([]);
  const [sort, setSort] = useState<Sort>(savedSort);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<string | null>(null);
  const [inHand, setInHand] = useState<{ id: string; spine: HTMLElement | null; animate: boolean } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const known = useRef<Set<string> | null>(null);
  const sorts = useIndicator<HTMLFieldSetElement>(sort);
  const { toast, say } = useToast();

  const refresh = useCallback(() => api.books().then(setBooks, (e) => setError(e.message)), []);
  useEffect(() => {
    refresh();
    learn.settings().then(setInfo, () => setInfo(null));
    learn.profile().then(
      (p) => setOwner(p.name || ""),
      () => {},
    );
  }, [refresh]);
  // books saved, sorted or renamed anywhere (the bookmark's page, the agent, another tab) show up here
  useEffect(() => {
    let timer = 0 as unknown as ReturnType<typeof setTimeout>;
    const off = onServerEvent("book", () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 150);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refresh]);

  // anything that lands on the shelf while you look falls into its place
  useEffect(() => {
    if (!books) return;
    const ids = new Set(books.map((b) => b.id));
    if (!known.current) {
      known.current = ids;
      return;
    }
    const added = [...ids].filter((id) => !known.current!.has(id));
    known.current = ids;
    if (!added.length) return;
    setFresh((f) => new Set([...f, ...added]));
    setTimeout(() => setFresh((f) => new Set([...f].filter((id) => !added.includes(id)))), 2600);
  }, [books]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(file.name);
    setAdding(false);
    try {
      const book = await api.upload(file);
      await refresh();
      announce(`Added ${book.title} to your library.`);
      say(`Added “${book.title}”.`, { label: "Read", href: `#/book/${book.id}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  /** Saves links one after another; each falls onto the shelf as it comes in. */
  const saveLinks = useCallback(
    async (links: string[]) => {
      setAdding(false);
      const batch: Save[] = links.map((url) => ({ key: `${Date.now()}-${url}`, url, status: "saving" }));
      setSaves((s) => [...s.filter((x) => x.status !== "failed"), ...batch]);
      for (const item of batch) {
        try {
          const book = await api.saveLink(item.url);
          setSaves((s) => s.map((x) => (x.key === item.key ? { ...x, status: "saved", book } : x)));
          await refresh();
          announce(`Saved ${book.title} to your library.`);
        } catch (e) {
          setSaves((s) =>
            s.map((x) => (x.key === item.key ? { ...x, status: "failed", error: (e as Error).message } : x)),
          );
          announce(`Couldn’t save ${item.url}: ${(e as Error).message}`);
        }
      }
    },
    [refresh],
  );

  // a link pasted anywhere on the page (not into a field) is saved
  useEffect(() => {
    if (view !== "books") return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (adding || inHand || target?.closest("input, textarea, [contenteditable=true]")) return;
      const links = linksIn(e.clipboardData?.getData("text") || "");
      if (!links.length) return;
      e.preventDefault();
      void saveLinks(links);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [view, adding, inHand, saveLinks]);

  // "/" goes to the search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || inHand || adding) return;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inHand, adding]);

  const sorted = useMemo(() => sortBooks(books || [], sort), [books, sort]);
  const shown = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return new Set(
      sorted
        .filter((b) => !only || b.topic === only)
        .filter((b) => {
          const hay =
            `${b.title} ${b.author || ""} ${b.source?.site || ""} ${topicOf(b.topic).name} ${(b.tags || []).join(" ")}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
        .map((b) => b.id),
    );
  }, [sorted, q, only]);
  const hours = Math.max(1, Math.round((books || []).reduce((n, b) => n + minutesOf(b), 0) / 60));
  const topics = new Set((books || []).map((b) => b.topic).filter(Boolean)).size;

  const takeDown = useCallback((book: Book, spine: HTMLElement, byKeyboard: boolean) => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setInHand({ id: book.id, spine, animate: !byKeyboard && !reduced });
  }, []);
  const putBack = useCallback(() => setInHand(null), []);
  const read = useCallback((book: Book) => {
    setLeaving(true);
    location.hash = `#/book/${book.id}`;
  }, []);
  const change = useCallback(
    async (book: Book, patch: { title?: string; topic?: string }) => {
      setBooks((list) => list?.map((b) => (b.id === book.id ? { ...b, ...patch } : b)) ?? null);
      try {
        await api.updateBook(book.id, patch);
        if (patch.topic) announce(`Moved to ${topicOf(patch.topic).name}.`);
      } catch (e) {
        say((e as Error).message);
        refresh();
      }
    },
    [refresh, say],
  );
  const remove = useCallback(
    async (gone: Book[]) => {
      setInHand(null);
      setBooks((list) => list?.filter((b) => !gone.some((g) => g.id === b.id)) ?? null);
      await Promise.all(gone.map((b) => api.deleteBook(b.id).catch(() => {})));
      say(gone.length === 1 ? `Removed “${gone[0].title}”.` : `Removed ${gone.length} books.`);
      refresh();
    },
    [refresh, say],
  );
  /** Takes a book down without the flight (from the arrivals card): its spine, once it is on the shelf. */
  const openArrived = useCallback((book: Book) => {
    setOnly(null);
    setQ("");
    requestAnimationFrame(() => {
      const spine = document.querySelector<HTMLElement>(`[data-book="${book.id}"] .spine`);
      setInHand({ id: book.id, spine, animate: false });
    });
  }, []);

  const files = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const ready =
    !info || (info.active === "codex" ? info.codex.installed && info.codex.loggedIn : info.claude.installed);
  const holding = inHand ? books?.find((b) => b.id === inHand.id) : undefined;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping a file is a shortcut; "Add" does the same
    <div
      className="library rise"
      data-leaving={leaving || undefined}
      onDragEnter={(e) => files(e) && setDrag((n) => n + 1)}
      onDragLeave={(e) => files(e) && setDrag((n) => Math.max(0, n - 1))}
      onDragOver={(e) => files(e) && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(0);
        if (view === "books") upload(e.dataTransfer.files[0]);
      }}
    >
      <header className="page-head row">
        <h1 className="page-title">Library</h1>
        <nav className="segmented" aria-label="Library" ref={views}>
          <a href="#/library" aria-current={view === "books" ? "page" : undefined}>
            Books
          </a>
          <a href="#/library/figures" aria-current={view === "figures" ? "page" : undefined}>
            Figures
          </a>
        </nav>
        <span className="spacer" />
        {view === "books" && books?.length ? <AddButton uploading={uploading} onClick={() => setAdding(true)} /> : null}
      </header>
      <input
        ref={input}
        type="file"
        accept=".pdf,.epub,.md,.markdown,.txt"
        hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!ready && info && (
        <p className="fine notice">
          {info.active === "codex"
            ? info.codex.installed
              ? "Codex isn’t logged in (run codex login), so nothing can be explained, drawn or sorted yet."
              : "Codex isn’t installed (npm i -g @openai/codex), so nothing can be explained, drawn or sorted yet."
            : "Claude Code isn’t installed (npm i -g @anthropic-ai/claude-code), so nothing can be explained, drawn or sorted yet."}{" "}
          <a href="#/settings">Settings</a>
        </p>
      )}

      {view === "figures" ? (
        <Figures theme={theme} />
      ) : books === null ? (
        <Spinner label="Loading your shelf" />
      ) : books.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-title">Bring in a hard book</h2>
          <p className="fine">
            Read it beside a margin that explains, draws and quizzes. Save an article or a paper from a link, or add a{" "}
            {FORMATS} file (or drop one on this page).
          </p>
          <AddButton uploading={uploading} onClick={() => setAdding(true)} primary />
        </div>
      ) : (
        <>
          <p className="shelf-stats">
            {books.length} {books.length === 1 ? "book" : "books"}
            {topics > 1 ? ` on ${topics} topics` : ""} · about {hours} {hours === 1 ? "hour" : "hours"} of reading
          </p>
          <div className="shelf-tools">
            <label className="shelf-search" data-empty={!q || undefined}>
              <Search aria-hidden="true" />
              <span className="visually-hidden">Search the library</span>
              <input
                ref={search}
                type="search"
                value={q}
                placeholder="Search"
                aria-keyshortcuts="/"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && q) {
                    e.stopPropagation();
                    setQ("");
                  }
                }}
              />
            </label>
            {only && (
              <button
                type="button"
                className="shelf-only"
                data-tone={topicOf(only).tone}
                onClick={() => setOnly(null)}
                aria-label={`Showing only ${topicOf(only).name}; show every topic`}
              >
                {topicOf(only).name}
                <X aria-hidden="true" />
              </button>
            )}
            <span className="spacer" />
            <fieldset className="segmented" ref={sorts}>
              <legend className="visually-hidden">Arrange by</legend>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sort === s.key}
                  onClick={() => {
                    setSort(s.key);
                    try {
                      localStorage.setItem(SORT_KEY, s.key);
                    } catch {}
                  }}
                >
                  {s.label}
                </button>
              ))}
            </fieldset>
          </div>
          <Bookcase
            books={sorted}
            shown={shown}
            sort={sort}
            openId={inHand?.id ?? null}
            fresh={fresh}
            onOpen={takeDown}
            onTopic={(t) => setOnly((o) => (o === t ? null : t))}
          />
          {shown.size === 0 && (
            <p className="shelf-none" role="status">
              Nothing on the shelves matches{q ? ` “${q}”` : ""}.
            </p>
          )}
          <p className="shelf-hint fine">
            Click a spine to take it down; the arrow keys walk along the shelf. Paste a link anywhere here to save it.
          </p>
        </>
      )}

      {drag > 0 && view === "books" && (
        <div className="drop-overlay" aria-hidden="true">
          <span>Drop to add it to your library</span>
        </div>
      )}
      {adding && (
        <AddPanel
          onLinks={(links) => void saveLinks(links)}
          onFile={() => input.current?.click()}
          onClose={() => setAdding(false)}
        />
      )}
      {holding && inHand && (
        <BookInHand
          key={holding.id}
          book={holding}
          spine={inHand.spine}
          animate={inHand.animate}
          owner={owner}
          onClose={putBack}
          onRead={read}
          onChange={change}
          onRemove={(b) => void remove([b])}
        />
      )}
      <Arrivals
        saves={saves}
        onOpen={openArrived}
        onUndo={(gone) => {
          setSaves([]);
          void remove(gone);
        }}
        onDismiss={() => setSaves([])}
      />
      <Toast toast={toast} />
    </div>
  );
}

function AddButton({
  uploading,
  onClick,
  primary,
}: {
  uploading: string | null;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button ${primary ? "primary" : ""}`}
      onClick={onClick}
      disabled={!!uploading}
      aria-haspopup="dialog"
    >
      {uploading ? (
        <Spinner label={`Reading “${uploading}”`} />
      ) : (
        <>
          <Plus aria-hidden="true" />
          Add
        </>
      )}
    </button>
  );
}
