/* Adding books from files, one or many: what is picked (several files at once, or a folder) or dropped
 * (files, and folders opened all the way down) is sorted into books and the rest, and the books are
 * sent one at a time, so the shelf fills as each is read. What is being added is kept here rather than
 * in a page, so it carries on while you look elsewhere. A book added on its own opens once it's read;
 * several are added in the library, which shows how far it has got. */
import { formatOf, MAX_BOOK_BYTES } from "../../../shared/book-files.ts";
import { api } from "../api";
import { announce } from "./a11y";

/** A file picked or dropped, and where it was in what was chosen ("Physics/Feynman.pdf" in a folder). */
export interface Picked {
  file: File;
  path: string;
}
/** A file that wasn't added, and why (written for the learner). */
export interface Failure {
  name: string;
  error: string;
}

/** What is being added: the books sent since nothing was being added. */
export interface Adding {
  /** The file being read now (where it was in what was chosen). */
  current: string | null;
  /** How many books this round sends, how many have been sent, and how many went in. */
  total: number;
  sent: number;
  added: number;
  /** The files that weren't added, until they are put away. */
  failed: Failure[];
  /** How many files in the folders chosen aren't books (left out without a word). */
  leftOut: number;
  /** How many books were still waiting when adding was stopped (they weren't sent). */
  unsent: number;
}

const NOT_A_BOOK = "It isn't a PDF, EPUB, Markdown or plain-text file.";
const TOO_LARGE = "It's larger than 200 MB.";
const NO_BOOKS = "is a PDF, EPUB, Markdown or plain-text file.";

/** Sorts what was chosen: the books (in the order of their paths), the files chosen on their own that
 * can't be (and why), and how many in folders aren't books. Hidden files and folders are passed over. */
export function sortPicked(picked: Picked[]): { books: Picked[]; failed: Failure[]; leftOut: number } {
  const books: Picked[] = [];
  const failed: Failure[] = [];
  let leftOut = 0;
  for (const p of picked) {
    const parts = p.path.split("/");
    // .DS_Store, .git, and the "._" shadows macOS leaves on other disks are nobody's books
    if (parts.some((part) => part.startsWith("."))) continue;
    if (!formatOf(p.file.name)) {
      if (parts.length > 1) leftOut++;
      else failed.push({ name: p.path, error: NOT_A_BOOK });
    } else if (p.file.size > MAX_BOOK_BYTES) failed.push({ name: p.path, error: TOO_LARGE });
    else books.push(p);
  }
  books.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  return { books, failed, leftOut };
}

/** The files a file field holds, with where each was in the folder chosen. */
export const pickedFiles = (files: FileList | File[] | null): Picked[] =>
  [...(files || [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));

/** The files dropped, with folders opened all the way down. Call it in the drop event itself: what was
 * dropped can be asked for only then (the folders are read after). */
export function droppedFiles(data: DataTransfer): Promise<Picked[]> {
  const entries = [...data.items].filter((item) => item.kind === "file").map((item) => item.webkitGetAsEntry());
  if (!entries.length || entries.some((entry) => !entry)) return Promise.resolve(pickedFiles(data.files));
  return Promise.all(entries.map((entry) => walk(entry!))).then((lists) => lists.flat());
}

async function walk(entry: FileSystemEntry): Promise<Picked[]> {
  const path = entry.fullPath.replace(/^\//, "");
  try {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      return [{ file, path }];
    }
    if (!entry.isDirectory || entry.name.startsWith(".")) return [];
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children: FileSystemEntry[] = [];
    // a folder is read a batch at a time, until a read comes back empty
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      children.push(...batch);
    }
    return (await Promise.all(children.map(walk))).flat();
  } catch {
    // one the browser won't hand over (gone, or not allowed) is passed over like any file that isn't a book
    return [];
  }
}

const idle: Adding = { current: null, total: 0, sent: 0, added: 0, failed: [], leftOut: 0, unsent: 0 };
let state = idle;
let waiting: Picked[] = [];
const listeners = new Set<() => void>();
const afterEach = new Set<() => void>();

const set = (patch: Partial<Adding>) => {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
};
const busy = () => state.current !== null || waiting.length > 0;

/** For useSyncExternalStore: listens for changes, and what is being added now. */
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const adding = () => state;

/** Calls `fn` each time a file has been sent (whether it went in or not). Returns a function that stops. */
export function onBookSent(fn: () => void) {
  afterEach.add(fn);
  return () => {
    afterEach.delete(fn);
  };
}

/** Adds the books among `picked`, after any being added already. */
export function addBooks(picked: Picked[]) {
  const { books, failed, leftOut } = sortPicked(picked);
  if (!books.length && !failed.length) {
    // a folder (or only hidden files) with no book in it: said of the folder, when there is one
    const folder = picked.find((p) => p.path.includes("/"))?.path.split("/")[0] || "";
    failed.push({ name: folder, error: `Nothing ${folder ? "in it" : "chosen"} ${NO_BOOKS}` });
  }
  // nothing being added: a new round, and what didn't go in last time is put away
  const fresh = !busy();
  const before = fresh ? idle : state;
  waiting.push(...books);
  set({
    total: before.total + books.length,
    failed: [...before.failed, ...failed],
    leftOut: before.leftOut + leftOut,
    ...(fresh ? { sent: 0, added: 0, unsent: 0 } : {}),
  });
  // several are added in the library, which shows how far it has got
  if (state.total > 1 && location.hash.split("?")[0] !== "#/library") location.hash = "#/library";
  if (fresh && books.length) void run();
}

/** Sends none of the books still waiting (the one being read goes in). */
export function stopAdding() {
  if (!waiting.length) return;
  set({ total: state.total - waiting.length, unsent: state.unsent + waiting.length });
  waiting = [];
}

/** Puts away the list of files that weren't added. */
export const dismissFailures = () => set({ failed: [] });

async function run() {
  while (waiting.length) {
    const next = waiting.shift()!;
    set({ current: next.path });
    try {
      const book = await api.upload(next.file);
      set({ added: state.added + 1 });
      // a book added on its own opens
      if (state.total === 1 && !state.unsent) location.hash = `#/book/${book.id}`;
    } catch (error) {
      set({ failed: [...state.failed, { name: next.path, error: (error as Error).message }] });
    }
    set({ sent: state.sent + 1 });
    for (const fn of afterEach) fn();
  }
  set({ current: null });
  if (state.total + state.unsent > 1) announce(summary(state));
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a round of several books came to, in a sentence or two. */
export function summary(a: Adding): string {
  const added = `Added ${count(a.added, "book", "books")}${a.unsent ? `, then stopped (${a.unsent} not sent)` : ""}.`;
  const failed = a.failed.length ? ` ${count(a.failed.length, "file", "files")} couldn't be added.` : "";
  const leftOut = a.leftOut
    ? ` Left out ${count(a.leftOut, "file that isn't a book", "files that aren't books")}.`
    : "";
  return added + failed + leftOut;
}
