// From ManimGX (MIT, see LICENSE): browser/src/protocol.ts, version 0.1.1, with the classroom's
// additions: the director boots from the classroom's own mirror of Pyodide and PyPI (an index URL and
// the packages a scene may add), and reports each run as plain data (its scenes, its error, that it
// ended) beside the take stream, so a page can show and check a film without reading the engine's notes.

/** Messages shared by the page and its Python worker. */
export interface Boot {
  /** Pyodide's files (its `indexURL`). */
  pyodide: string;
  /** What micropip installs: `manimgx==<version>`. */
  manimgx: string;
  /** The package index micropip reads (a JSON API URL with `{package_name}`), or none for PyPI. */
  index?: string;
  /** Packages a scene may bring in when it imports them (networkx for graphs…); others fail. */
  extras?: string[];
}

export interface Run {
  source: string;
  scene: string | null;
  /** Make the film without sending it (a check: only the report matters). */
  dry?: boolean;
}

export type ToDirector = { boot: Boot } | { film: number; run: Run } | { film: number; drop: true };

/** These byte arrays originate in Pyodide and own transferable ArrayBuffers. */
export interface EngineFiles {
  js: string;
  wasm: Uint8Array<ArrayBuffer>;
  fonts: Uint8Array<ArrayBuffer>[];
}

/** What came of running a film's source. */
export interface Report {
  /** The scenes the source defines, and the one played. */
  scenes?: string[];
  scene?: string;
  /** The film's length in seconds, once it is made. */
  duration?: number;
  /** The scene's error: its message, type, the scene's own lines of the trace, and its line. */
  error?: { message: string; type: string; trace?: string; line?: number | null };
  /** The run is over (made, or failed). */
  done?: boolean;
}

export type FromDirector =
  | { status: string }
  | { failure: string }
  | { engine: EngineFiles }
  | { film: number; feed: ArrayBuffer }
  | { film: number; report: Report };

export function message(error: unknown): string {
  return String(typeof error === "object" && error !== null && "message" in error ? (error.message ?? error) : error);
}
