// From ManimGX (MIT, see LICENSE): browser/src/director.ts, version 0.1.1, adapted for the classroom.
//
// The director's worker: Python (Pyodide) running scenes, their takes sent to the page's players.
// ManimGX comes from the classroom's mirror of PyPI (micropip), and with it the player's engine, which
// is handed on. Changes from upstream: it is a classic worker (Pyodide loaded with importScripts), as
// a sandboxed frame can't start a module worker from a blob; micropip reads the mirror's index; a
// scene may only bring in the packages it is allowed (`extras`), not anything it imports; each run
// ends with a plain report (its
// scenes, length, error) beside the take stream; and a dry run (a check) makes the film without
// sending it and adds ManimGX's own layout checks (what `manimgx inspect` reports: text cut off by the
// frame, texts over each other, lines through labels, text too small), sampled at the end of each play.
//
// In: {boot: {pyodide, manimgx, index, extras}} once; {film, run: {source, scene, dry}}; {film, drop}.
// Out: {status} while it boots; {engine: {js, wasm, fonts}} once; then each film's {film, feed} take
// stream and its {film, report}.

import type { Boot, FromDirector, Report, Run, ToDirector } from "./protocol.ts";
import { message } from "./protocol.ts";

interface PythonValue {
  toJs(): unknown;
  destroy(): void;
}

interface Micropip {
  install(requirement: string): Promise<void>;
}

interface Pyodide {
  loadPackage(name: string | string[]): Promise<void>;
  loadPackagesFromImports(source: string): Promise<void>;
  pyimport(name: string): unknown;
  runPython(source: string): unknown;
}

interface PyodideModule {
  loadPyodide(options: { indexURL: string }): Promise<Pyodide>;
}

type Runner = (
  film: number,
  source: string,
  scene: string | null,
  send: (bytes: Uint8Array<ArrayBuffer>) => void,
  tried: string[],
  dry: boolean,
) => string;

interface Python {
  py: Pyodide;
  micropip: Micropip;
  runner: Runner;
  note: (text: string) => Uint8Array<ArrayBuffer>;
  drop: (film: number) => void;
  extras: Set<string>;
}

/** A worker's own globals (the page's types don't describe a worker). */
const scope = globalThis as unknown as {
  importScripts(...urls: string[]): void;
  postMessage(data: FromDirector, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ToDirector>) => void) | null;
};

const queue = new Map<number, Run | null>(); // the latest run, or teardown after the active run
let booted: Promise<Python | null> | undefined;
let busy = false;
let failed = false;

function send(data: FromDirector, transfer: Transferable[] = []): void {
  scope.postMessage(data, transfer);
}

scope.onmessage = ({ data }) => {
  if ("boot" in data) {
    booted = boot(data.boot).catch((error: unknown) => {
      failed = true;
      queue.clear();
      send({ failure: `ManimGX could not start: ${message(error)}` });
      return null;
    });
    return;
  }
  if (!failed) {
    queue.set(data.film, "run" in data ? data.run : null);
    drain();
  }
};

async function boot({ pyodide, manimgx, index, extras = [] }: Boot): Promise<Python> {
  send({ status: "Loading Python…" });
  // a classic worker: a sandboxed frame (an opaque origin) can't start a module worker from a blob
  scope.importScripts(`${pyodide}pyodide.js`);
  const { loadPyodide } = globalThis as unknown as PyodideModule;
  const py = await loadPyodide({ indexURL: pyodide });
  send({ status: "Installing ManimGX…" });
  await py.loadPackage("micropip");
  const micropip = py.pyimport("micropip") as Micropip;
  if (index) py.runPython(`import micropip; micropip.set_index_urls(${JSON.stringify([index])})`);
  await micropip.install(manimgx);
  // the player's engine, in the engine the wheel holds, beside the Python it plays for
  const built = py.runPython(`
from manimgx import _engine
from manimgx.drawing.typesetting import FONTS
(*_engine.web(), _engine.face_fonts(list(FONTS)))`) as PythonValue;
  const [js, wasm, fonts] = built.toJs() as [string, Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>[]];
  built.destroy();
  send({ engine: { js, wasm, fonts } }, [wasm.buffer, ...fonts.map((f) => f.buffer)]);
  const runner = py.runPython(RUNNER) as Runner;
  const note = py.runPython("lambda text: to_js(_engine.note(text))") as Python["note"];
  const drop = py.runPython("drop") as Python["drop"];
  send({ status: "Making the film…" });
  return { py, micropip, runner, note, drop, extras: new Set(extras) };
}

async function drain(): Promise<void> {
  const python = await booted;
  if (!python || busy) return;
  const { py, micropip, runner, note, drop, extras } = python;
  busy = true;
  try {
    for (const [film, run] of queue) {
      queue.delete(film);
      const feed = (bytes: Uint8Array<ArrayBuffer>): void => send({ film, feed: bytes.buffer }, [bytes.buffer]);
      const report = (r: Report) => send({ film, report: r });
      try {
        if (run === null) {
          drop(film);
          continue;
        }
        const { source, scene, dry = false } = run;
        await py.loadPackagesFromImports(source); // the scene's Pyodide package imports (numpy…)
        // A missing module the scene may use is installed once, then the runner runs again.
        const tried: string[] = [];
        for (;;) {
          const out = JSON.parse(runner(film, source, scene ?? null, feed, tried, dry)) as Report & {
            missing?: string;
          };
          if (out.missing && extras.has(out.missing) && !tried.includes(out.missing)) {
            tried.push(out.missing);
            await micropip.install(out.missing).catch(() => {});
            continue;
          }
          if (out.missing)
            out.error = {
              message: `No module named '${out.missing}': a scene can use ManimGX, numpy and Python's own modules${extras.size ? ` (and ${[...extras].join(", ")})` : ""}`,
              type: "ModuleNotFoundError",
            };
          delete out.missing;
          report({ ...out, done: true });
          break;
        }
      } catch (error) {
        // Loading and calling Python can fail outside its own scene error boundary. Keep the
        // error in this film's ordinary note stream so another film or edit can still run.
        const failure = { message: message(error), type: "Error" };
        if (!run?.dry) feed(note(JSON.stringify({ error: failure })));
        report({ error: failure, done: true });
      }
      await new Promise<void>((resolve) => setTimeout(resolve)); // let newer runs in
    }
  } finally {
    busy = false;
    if (queue.size) drain();
  }
}

// Python: a film's source run as a scene file, like `manimgx render` runs one, its take sent on;
// returns what came of it as JSON. A dry run sends nothing and checks the layout at each play's end.
const RUNNER = `
import dataclasses, importlib.util, json, linecache, shutil, sys, traceback
from fractions import Fraction
from pathlib import Path
from pyodide.ffi import to_js
import manimgx
from manimgx import _engine
from manimgx.config import Config, config
from manimgx.scene import Scene

FILMS = Path("/home/pyodide/films")
_diagnostics = None

def diagnostics():
    # manimgx.cli needs the command line's packages; its layout checks need only ManimGX
    global _diagnostics
    if _diagnostics is None:
        path = Path(manimgx.__file__).parent / "cli" / "diagnostics.py"
        spec = importlib.util.spec_from_file_location("manimgx_layout", path)
        _diagnostics = importlib.util.module_from_spec(spec)
        sys.modules["manimgx_layout"] = _diagnostics
        spec.loader.exec_module(_diagnostics)
    return _diagnostics

def run(film, source, name, send, tried, dry):
    out = (lambda data: None) if dry else (lambda data: send(to_js(data)))
    path = FILMS / str(film) / "scene.py"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding="utf-8")
        linecache.cache.pop(str(path), None)
        defaults = Config()
        for field in dataclasses.fields(Config):
            setattr(config, field.name, getattr(defaults, field.name))
        spec = importlib.util.spec_from_file_location("scene", path)
        module = importlib.util.module_from_spec(spec)
        sys.modules["scene"] = module
        exec(compile(source, str(path), "exec"), module.__dict__)
        scenes = [v for v in vars(module).values() if isinstance(v, type) and issubclass(v, Scene) and v.__module__ == "scene"]
        names = [s.__name__ for s in scenes]
        if not scenes:
            raise ValueError("the source defines no scene (a subclass of manimgx.Scene)")
        kind = scenes[names.index(name)] if name in names else scenes[0]
        out(_engine.note(json.dumps({"scenes": names, "scene": kind.__name__})))
        result = {"scenes": names, "scene": kind.__name__}
        if dry:
            d = diagnostics()
            layout, seen = d.Layout(), [0]
            made = kind()
            def ended(play, *_):
                if made.three_d:
                    return
                known = d.names(made, d.written_frame())
                layout.see((play.end, play.where), d.view(made, known))
                seen[0] += 1
            made.render(plays=ended)
            result["duration"] = float(made.clock)
            result["layout"] = d.report(layout, seen[0]) if seen[0] else ""
            result["problems"] = len(layout.numbers)
        else:
            made = kind()
            made.render(take=out)
            result["duration"] = float(made.clock)
        return json.dumps(result)
    except ModuleNotFoundError as error:
        if error.name and error.name not in list(tried):
            return json.dumps({"missing": error.name})
        return report(out, path, error)
    except Exception as error:
        return report(out, path, error)

def drop(film):
    path = FILMS / str(film) / "scene.py"
    module = sys.modules.get("scene")
    if getattr(module, "__file__", None) == str(path):
        del sys.modules["scene"]
    for filename in list(linecache.cache):
        if Path(filename).is_relative_to(path.parent):
            del linecache.cache[filename]
    if path.parent.exists():
        shutil.rmtree(path.parent)

def report(out, path, error):
    # the scene's own frames, not manimgx's or Pyodide's
    frames = [f for f in traceback.extract_tb(error.__traceback__) if f.filename == str(path)]
    trace = "".join(traceback.format_list(frames) + traceback.format_exception_only(error))
    line = frames[-1].lineno if frames else getattr(error, "lineno", None)
    failure = {"message": str(error), "type": type(error).__name__, "trace": trace, "line": line}
    out(_engine.note(json.dumps({"error": failure})))
    return json.dumps({"error": failure})

run
`;
