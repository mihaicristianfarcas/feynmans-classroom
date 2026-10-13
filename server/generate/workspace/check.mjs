// node check.mjs [--demo demo.js] [--json report.json]
// Loads the demo in a simulated browser (linkedom), runs frames, exercises every control and button,
// and reports errors (must be zero) and warnings. Prints CHECK PASSED or CHECK FAILED.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const DEMO = resolve(arg("--demo", join(HERE, "demo.js")));
const RUNTIME = resolve(arg("--runtime", join(HERE, "runtime")));
const JSON_OUT = arg("--json", null);
const LINKEDOM = process.env.CLASSROOM_LINKEDOM || "__LINKEDOM__";
const { parseHTML } = await import(LINKEDOM.startsWith("file:") || LINKEDOM.startsWith("/") ? (LINKEDOM.startsWith("/") ? pathToFileURL(LINKEDOM).href : LINKEDOM) : LINKEDOM);

const errors = [];
const warnings = [];
const stats = {};
const report = () => {
  const ok = errors.length === 0;
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ ok, errors, warnings, stats }, null, 1));
  for (const e of errors) console.log(`ERROR   ${e}`);
  for (const w of warnings) console.log(`WARNING ${w}`);
  console.log(`stats   ${JSON.stringify(stats)}`);
  console.log(ok ? "CHECK PASSED" : "CHECK FAILED");
  process.exit(ok ? 0 : 1);
};

if (!existsSync(DEMO)) {
  errors.push(`no demo file at ${DEMO}: write demo.js first`);
  report();
}
const source = readFileSync(DEMO, "utf8");

/* ---------- static checks on the source ---------- */
if (/^\s*(import|export)\s/m.test(source)) errors.push("demo.js must be a plain script: no import/export statements");
if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|importScripts|\beval\s*\(|new Function\s*\(/.test(source)) errors.push("demo.js may not use fetch, XMLHttpRequest, WebSocket, eval or new Function");
if (/localStorage|sessionStorage|indexedDB|document\.cookie/.test(source)) warnings.push("storage APIs are unavailable in the sandboxed iframe; remove them");
const hex = source.match(/["'`(:\s](#[0-9a-fA-F]{3,8})\b/g);
if (hex) warnings.push(`hard-coded colours ${[...new Set(hex.map((h) => h.trim().replace(/^[^#]+/, "")))].slice(0, 4).join(", ")}: use tones (hi, mid, lo, faint, lit) so both themes work`);
if (/rgba?\(|hsla?\(/.test(source)) warnings.push("rgb()/hsl() colours found: use tones so both themes work");
const calls = source.match(/Classroom\.demo\s*\(/g) || [];
if (calls.length !== 1) errors.push(`demo.js must call Classroom.demo(...) exactly once (found ${calls.length})`);

/* ---------- the simulated browser ---------- */
const { window, document } = parseHTML('<!doctype html><html><head></head><body class="iso" data-theme="light"><div id="classroom"></div></body></html>');
let now = 0;
let rafId = 0;
const rafQueue = new Map();
const logs = [];
const quiet = (kind) => (...args) => logs.push(`${kind}: ${args.map(String).join(" ")}`);
const sandbox = {
  window,
  document,
  navigator: window.navigator || { userAgent: "check" },
  console: { log: quiet("log"), info: quiet("info"), warn: quiet("warn"), error: (...a) => { quiet("error")(...a); }, debug: quiet("debug") },
  requestAnimationFrame: (fn) => {
    rafQueue.set(++rafId, fn);
    return rafId;
  },
  cancelAnimationFrame: (id) => rafQueue.delete(id),
  performance: { now: () => now },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms ?? 0, 5)),
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  KeyboardEvent: window.KeyboardEvent || window.Event,
  __CLASSROOM_OPTS: { theme: "light", fig: "Fig 1", predict: false, autoplay: true },
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

function run(file, code) {
  try {
    new vm.Script(code, { filename: file }).runInContext(sandbox, { timeout: 5000 });
    return true;
  } catch (error) {
    const where = String(error.stack || "").split("\n").find((line) => line.includes(file)) || "";
    errors.push(`${file}: ${error.name}: ${error.message}${where ? ` (${where.trim()})` : ""}`);
    return false;
  }
}
const kitPath = join(RUNTIME, "dist", "kit.js");
for (const [file, path] of [["kit.js", kitPath], ["draw2d.js", join(RUNTIME, "draw2d.js")], ["classroom.js", join(RUNTIME, "classroom.js")]]) {
  if (!run(file, readFileSync(path, "utf8"))) report();
}
if (!run("demo.js", source)) report();

const S = sandbox.__classroom;
if (!S || !S.def) {
  errors.push("Classroom.demo(...) was never called");
  report();
}
const root = document.querySelector("#classroom");
const svg = () => root.querySelector(".cr-stage svg");
const markup = () => (svg() ? svg().innerHTML : "");
const readout = () => (root.querySelector("[data-readout]")?.textContent || "").trim();
const statsText = () => [...root.querySelectorAll("[data-stat]")].map((n) => n.textContent).join("|");
const runtimeErrors = () => S.errors.map((e) => `${e.where}: ${e.message}`);

let frameMs = 0;
let frameCount = 0;
function step(seconds) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    now += 1000 / 60;
    const due = [...rafQueue.values()];
    rafQueue.clear();
    const t0 = process.hrtime.bigint();
    for (const fn of due) {
      try {
        fn(now);
      } catch (error) {
        errors.push(`frame: ${error.message}`);
      }
    }
    if (due.length) {
      frameMs += Number(process.hrtime.bigint() - t0) / 1e6;
      frameCount++;
    }
    if (S.errors.length) return;
  }
}
const bad = (html) => {
  const m = html.match(/(?:d|x|y|cx|cy|r|width|height|points|transform|x1|y1|x2|y2)="[^"]*(NaN|undefined|Infinity|null)[^"]*"/);
  return m ? m[0].slice(0, 120) : null;
};
const checkHealth = (when) => {
  for (const e of runtimeErrors()) if (!errors.includes(`${when}: ${e}`)) errors.push(`${when}: ${e}`);
  const html = markup();
  const broken = bad(html);
  if (broken) errors.push(`${when}: broken SVG attribute ${broken}`);
  return !S.errors.length;
};

/* ---------- definition sanity ---------- */
const def = S.def;
stats.title = def.title || "";
if (!def.title) errors.push("definition needs a title");
else if (def.title.length > 40) warnings.push(`title is ${def.title.length} characters; keep it under 32`);
if (!def.hint) warnings.push("add a hint: what should the reader do?");
else if (def.hint.length > 48) warnings.push(`hint is ${def.hint.length} characters; keep it under 36`);
if (!def.label) warnings.push("add a label: an accessible description of the picture");
const controls = def.controls || [];
stats.controls = controls.length;
if (!controls.length) warnings.push("no controls: give the reader at least one thing to change");
if (controls.length > 4) warnings.push(`${controls.length} controls: keep it to 1–3 so the demo stays simple`);
for (const c of controls) {
  if (!c.id) errors.push("every control needs an id");
  const type = c.type || "range";
  if (type === "range" && !(Number(c.max) > Number(c.min))) errors.push(`control ${c.id}: max must be greater than min`);
  if (type === "range" && (c.value < c.min || c.value > c.max)) errors.push(`control ${c.id}: default value ${c.value} is outside [${c.min}, ${c.max}]`);
  if (type === "select" && !(c.options || []).length) errors.push(`control ${c.id}: a select needs options`);
}
if (def.predict) {
  const p = def.predict;
  if (!Array.isArray(p.choices) || p.choices.length < 2) errors.push("predict needs at least two choices");
  else if (!(p.answer >= 0 && p.answer < p.choices.length)) errors.push(`predict.answer ${p.answer} is not an index into choices`);
}

/* ---------- run it ---------- */
step(0.2);
if (!checkHealth("setup")) report();
const first = markup();
if (!/<(path|circle|rect|line|polyline|polygon|ellipse|text|g)\b/.test(first)) errors.push("the drawing is empty after setup: call ctx.draw(...) with the picture");
const texts = (first.match(/<text\b/g) || []).length;
stats.texts = texts;
if (texts > 18) warnings.push(`${texts} text labels in the drawing: keep words few (axis names, a symbol or two)`);
stats.elements = (first.match(/<(path|circle|rect|line|polyline|polygon|ellipse|text)\b/g) || []).length;
if (stats.elements > 1500) warnings.push(`${stats.elements} SVG elements: this is a lot for a simple demo`);

step(3);
checkHealth("playing");
const later = markup();
const readoutText = readout();
stats.readout = readoutText;
stats.animates = later !== first;
if (!readoutText) warnings.push("the card readout is empty: call ctx.readout(...) with the key live value");
if (!stats.animates) warnings.push("nothing moved in the first 3 seconds: the demo should play on its own (an idle loop) so the idea is visible without touching it");
const statNodes = [...root.querySelectorAll("[data-stat]")];
const empty = statNodes.filter((n) => (n.textContent || "").trim() === "—").map((n) => n.getAttribute("data-stat"));
if (empty.length) warnings.push(`stats never written: ${empty.join(", ")}`);

// exercise every control
const Classroom = sandbox.Classroom;
for (const c of controls) {
  const type = c.type || "range";
  if (type === "button") {
    const button = root.querySelector(`[data-control="${c.id}"]`);
    button?.dispatchEvent(new window.Event("click"));
    step(1.5);
    checkHealth(`after pressing "${c.label || c.id}"`);
    continue;
  }
  const values = type === "toggle" ? [!c.value, !!c.value] : type === "select" ? (c.options || []).map((o) => (Array.isArray(o) ? o[0] : typeof o === "object" ? o.value : o)) : [c.min, c.max, c.value];
  const seen = new Set();
  for (const value of values) {
    Classroom.set(c.id, value);
    step(1.2);
    if (!checkHealth(`${c.id} = ${value}`)) break;
    seen.add(markup() + "|" + readout() + "|" + statsText());
  }
  if (seen.size < 2 && !c.restart) warnings.push(`changing "${c.label || c.id}" did not change the picture, the readout or the stats`);
  else if (seen.size < 2 && c.restart) {
    /* restart controls rebuild; fine */
  }
}
// restart and back to text values
Classroom.restart();
step(1);
checkHealth("after Restart");
root.querySelector('[data-action="reset"]')?.dispatchEvent(new window.Event("click"));
step(1);
checkHealth("after Back to text values");

stats.frameMs = frameCount ? Math.round((frameMs / frameCount) * 100) / 100 : 0;
if (stats.frameMs > 6) warnings.push(`frames take ${stats.frameMs} ms in the check: simplify per-frame work (rebuild only what moves)`);
const consoleErrors = logs.filter((l) => l.startsWith("error:"));
if (consoleErrors.length) warnings.push(`console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
report();
