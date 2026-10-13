/* Classroom demo runtime.
 *
 * A demo is one classic script that calls Classroom.demo({...}). The runtime builds the anatomy
 * card (Fig n, title, hint, live readout), the declared controls and stats, runs one calm frame
 * loop (paused offscreen, under "Pause", and while a predict-first question is open), and talks to
 * the host page over postMessage. The anatomy kit is available as globals k, G, T and GL.
 * RUNTIME.md documents the contract for demo authors.
 */
(() => {
  "use strict";
  const OPTS = Object.assign({ theme: "light", fig: "Fig 1", predict: true, autoplay: true }, globalThis.__CLASSROOM_OPTS || {});
  const S = {
    def: null,
    ctx: null,
    api: null,
    playing: OPTS.autoplay !== false,
    visible: true,
    predicting: false,
    t: 0,
    raf: 0,
    last: 0,
    frames: 0,
    starts: 0,
    errors: [],
    lastInput: -Infinity,
    ready: false,
    el: {},
  };
  globalThis.__classroom = S;

  const raf = globalThis.requestAnimationFrame ? (fn) => globalThis.requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(Date.now()), 16);
  const caf = globalThis.cancelAnimationFrame ? (id) => globalThis.cancelAnimationFrame(id) : (id) => clearTimeout(id);
  const now = () => (globalThis.performance ? performance.now() : Date.now()) / 1000;
  const reduced = () => {
    try {
      return !!(globalThis.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  };
  const post = (message) => {
    try {
      if (globalThis.parent && globalThis.parent !== globalThis) globalThis.parent.postMessage({ source: "classroom", ...message }, "*");
    } catch {}
  };
  const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const h = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of [].concat(children)) if (child) node.appendChild(child);
    return node;
  };

  /* ---------- small motion helpers (also exposed on ctx) ---------- */
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const follow = (x, target, dt, tau = 0.25) => (reduced() ? target : Math.abs(target - x) < 1e-4 ? target : x + (target - x) * (1 - Math.exp(-dt / Math.max(1e-3, tau))));
  // Sub-stepped spring on { x, v }. Returns true while still moving.
  const spring = (s, target, dt, stiffness = 120, damping = 2 * Math.sqrt(stiffness)) => {
    if (reduced()) {
      s.x = target;
      s.v = 0;
      return false;
    }
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      s.v = (s.v || 0) + ((target - s.x) * stiffness - (s.v || 0) * damping) * h;
      s.x += s.v * h;
    }
    if (Math.abs(target - s.x) < 5e-4 && Math.abs(s.v) < 5e-4) {
      s.x = target;
      s.v = 0;
      return false;
    }
    return true;
  };
  const fmt = (value, digits = 2) => {
    if (typeof value !== "number") return String(value);
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e5 || abs < 1e-3)) return value.toExponential(Math.max(1, digits - 1)).replace("e+", "e");
    return value.toFixed(digits);
  };

  /* ---------- errors ---------- */
  function fail(error, where = "demo") {
    const message = error && error.message ? error.message : String(error);
    const stack = error && error.stack ? String(error.stack).split("\n").slice(0, 6).join("\n") : "";
    S.errors.push({ where, message, stack });
    stop();
    if (S.el.plate && !S.el.plate.querySelector(".cr-error")) {
      S.el.plate.appendChild(h("div", { class: "cr-error", role: "alert" }, [h("strong", { text: "This visualization stopped" }), h("span", { text: message })]));
    }
    post({ type: "error", message, stack, where });
    try {
      console.error(`[classroom] ${where}: ${message}`);
    } catch {}
  }
  if (globalThis.addEventListener) {
    globalThis.addEventListener("error", (event) => fail(event.error || event.message, "script"));
    globalThis.addEventListener("unhandledrejection", (event) => fail(event.reason, "promise"));
  }

  /* ---------- the loop ---------- */
  function tick(time) {
    S.raf = 0;
    if (!S.api || !S.playing || !S.visible || S.predicting) return;
    const at = (typeof time === "number" ? time : Date.now()) / 1000;
    const dt = S.last ? clamp(at - S.last, 0, 1 / 30) : 1 / 60;
    S.last = at;
    S.t += dt;
    let keep = true;
    try {
      if (S.api.frame) keep = S.api.frame(dt, S.t) !== false;
      else keep = false;
    } catch (error) {
      fail(error, "frame");
      return;
    }
    S.frames++;
    if (keep) S.raf = raf(tick);
  }
  function wake() {
    if (!S.raf && S.api && S.playing && S.visible && !S.predicting) {
      S.last = 0;
      S.raf = raf(tick);
    }
  }
  function stop() {
    if (S.raf) caf(S.raf);
    S.raf = 0;
  }

  /* ---------- controls ---------- */
  function controlNode(control, ctx) {
    const id = `cr-${control.id}`;
    const type = control.type || "range";
    if (type === "button") {
      const button = h("button", { type: "button", class: "cr-button", "data-control": control.id, text: control.label || control.id });
      button.addEventListener("click", () => {
        S.lastInput = now();
        emit("press", control.id);
        wake();
      });
      return h("div", { class: "cr-control", "data-type": "button" }, [button]);
    }
    if (type === "toggle") {
      const input = h("input", { type: "checkbox", id, "data-control": control.id, checked: !!ctx.params[control.id] });
      input.addEventListener("change", () => setValue(control.id, input.checked, "user"));
      return h("label", { class: "cr-control", "data-type": "toggle", for: id }, [input, h("span", { text: control.label || control.id })]);
    }
    if (type === "select") {
      const options = (control.options || []).map((option) => {
        const [value, label] = Array.isArray(option) ? option : typeof option === "object" ? [option.value, option.label] : [option, option];
        return h("option", { value, text: label ?? value, selected: String(value) === String(ctx.params[control.id]) });
      });
      const select = h("select", { id, "data-control": control.id }, options);
      select.addEventListener("change", () => setValue(control.id, select.value, "user"));
      return h("label", { class: "cr-control", "data-type": "select", for: id }, [h("span", { class: "cr-label", text: control.label || control.id }), select]);
    }
    const input = h("input", {
      type: "range",
      id,
      "data-control": control.id,
      min: control.min ?? 0,
      max: control.max ?? 1,
      step: control.step ?? "any",
      value: ctx.params[control.id],
    });
    const out = h("output", { for: id, class: "cr-value", text: formatControl(control, ctx.params[control.id]) });
    input.addEventListener("input", () => setValue(control.id, Number(input.value), "user"));
    return h("label", { class: "cr-control", "data-type": "range", for: id }, [h("span", { class: "cr-label", text: control.label || control.id }), input, out]);
  }
  function formatControl(control, value) {
    if (control.format && typeof control.format === "function") {
      try {
        return String(control.format(value));
      } catch {}
    }
    const step = Number(control.step);
    const digits = control.digits ?? (Number.isFinite(step) && step > 0 ? Math.max(0, Math.min(4, Math.ceil(-Math.log10(step) - 1e-9))) : 2);
    return `${typeof value === "number" ? value.toFixed(digits) : value}${control.unit ? ` ${control.unit}` : ""}`;
  }
  function controlOf(id) {
    return (S.def.controls || []).find((control) => control.id === id);
  }
  function coerce(control, value) {
    const type = control.type || "range";
    if (type === "toggle") return !!value;
    if (type === "select") {
      const options = (control.options || []).map((option) => (Array.isArray(option) ? option[0] : typeof option === "object" ? option.value : option));
      const match = options.find((option) => String(option) === String(value));
      return match === undefined ? options[0] : match;
    }
    if (type === "button") return undefined;
    const number = Number(value);
    return clamp(Number.isFinite(number) ? number : Number(control.value ?? control.min ?? 0), Number(control.min ?? -Infinity), Number(control.max ?? Infinity));
  }
  function setValue(id, value, source = "program") {
    const control = controlOf(id);
    if (!control || !S.ctx) return;
    const next = coerce(control, value);
    if (next === S.ctx.params[id] && source !== "user") return;
    S.ctx.params[id] = next;
    if (source === "user") S.lastInput = now();
    const input = S.el.controls && S.el.controls.querySelector(`[data-control="${id}"]`);
    if (input) {
      if (input.type === "checkbox") input.checked = !!next;
      else if (String(input.value) !== String(next)) input.value = String(next);
      const out = input.parentNode && input.parentNode.querySelector("output");
      if (out) out.textContent = formatControl(control, next);
    }
    refreshReset();
    if (control.restart) {
      restart();
      return;
    }
    emit("change", id, next, S.ctx.params, source);
    wake();
  }
  function refreshReset() {
    if (!S.el.reset || !S.ctx) return;
    const dirty = (S.def.controls || []).some((c) => c.type !== "button" && S.ctx.params[c.id] !== defaultOf(c));
    if (dirty) S.el.reset.removeAttribute("disabled");
    else S.el.reset.setAttribute("disabled", "");
  }
  function defaultOf(control) {
    const type = control.type || "range";
    if (type === "button") return undefined;
    if (type === "toggle") return !!control.value;
    if (type === "select") return coerce(control, control.value);
    return coerce(control, control.value ?? control.min ?? 0);
  }

  /* ---------- events ---------- */
  function emit(name, ...args) {
    const list = (S.ctx && S.ctx._handlers[name]) || [];
    for (const fn of list) {
      try {
        fn(...args);
      } catch (error) {
        fail(error, `on("${name}")`);
      }
    }
  }
  function pointerOf(event) {
    const svg = S.el.svg;
    let x = 0,
      y = 0,
      fx = 0,
      fy = 0;
    try {
      const box = svg.getBoundingClientRect();
      fx = box.width ? (event.clientX - box.left) / box.width : 0;
      fy = box.height ? (event.clientY - box.top) / box.height : 0;
      const ctm = svg.getScreenCTM && svg.getScreenCTM();
      if (ctm && svg.createSVGPoint) {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const local = point.matrixTransform(ctm.inverse());
        x = local.x;
        y = local.y;
      } else {
        x = fx * S.def.width;
        y = fy * S.def.height;
      }
    } catch {}
    return { x, y, fx, fy, buttons: event.buttons || 0, event };
  }

  /* ---------- building the card ---------- */
  function buildShell(def) {
    const root = document.querySelector("#classroom") || document.body.appendChild(h("div", { id: "classroom" }));
    root.className = "cr-root";
    root.innerHTML = "";
    const corners = h("div", { class: "iso-plate-corners", "aria-hidden": "true" }, [
      h("span", { class: "iso-plate-corner", "data-corner": "fig", text: OPTS.fig }),
      def.title ? h("span", { class: "iso-plate-corner", "data-corner": "title", text: def.title }) : null,
      def.hint ? h("span", { class: "iso-plate-corner", "data-corner": "hint", text: def.hint }) : null,
      h("span", { class: "iso-plate-corner", "data-corner": "readout", "data-readout": "", text: "" }),
    ]);
    const stage = h("div", { class: "iso-stage cr-stage", tabindex: "0", role: "group", "aria-label": def.label || def.title || "Interactive figure" });
    stage.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg" viewBox="0 0 ${def.width} ${def.height}" role="img" aria-label="${esc(def.label || def.title || "")}"></svg>`;
    const plate = h("div", { class: "iso-plate cr-plate" }, [corners, stage]);
    const keys = (def.keys || []).length
      ? h(
          "figcaption",
          { class: "iso-legend cr-legend" },
          h(
            "span",
            { class: "iso-keys" },
            def.keys.map((key) => h("span", { class: "iso-key", html: `${swatch(key.mark)}${esc(key.label)}` })),
          ),
        )
      : null;
    const figure = h("figure", { class: "iso-figure cr-figure" }, [plate, keys]);
    const pause = h("button", { type: "button", class: "cr-button", "data-action": "pause", text: S.playing ? "Pause" : "Play" });
    const again = h("button", { type: "button", class: "cr-button", "data-action": "restart", text: "Restart" });
    const reset = (def.controls || []).some((c) => c.type !== "button") ? h("button", { type: "button", class: "cr-button", "data-action": "reset", text: "Back to text values", disabled: true }) : null;
    pause.addEventListener("click", () => setPlaying(!S.playing));
    again.addEventListener("click", () => restart());
    if (reset) reset.addEventListener("click", () => resetValues());
    const bar = h("div", { class: "cr-bar" }, [pause, again, reset]);
    const controls = h("div", { class: "cr-controls" });
    const stats = (def.stats || []).length
      ? h(
          "div",
          { class: "cr-stats", "aria-live": "off" },
          def.stats.map((stat) => h("span", { class: "cr-stat" }, [h("span", { class: "cr-stat-label", text: stat.label || stat.id }), h("b", { "data-stat": stat.id, text: "—" })])),
        )
      : null;
    root.append(figure, bar, controls);
    if (stats) root.appendChild(stats);
    Object.assign(S.el, { root, plate, stage, svg: stage.querySelector("svg"), readout: corners.querySelector("[data-readout]"), controls, stats, pause, reset });

    stage.addEventListener("pointerdown", (event) => {
      S.lastInput = now();
      try {
        stage.setPointerCapture && stage.setPointerCapture(event.pointerId);
      } catch {}
      emit("pointerdown", pointerOf(event));
      wake();
    });
    stage.addEventListener("pointermove", (event) => {
      S.lastInput = now();
      emit("pointermove", pointerOf(event));
      wake();
    });
    stage.addEventListener("pointerup", (event) => {
      emit("pointerup", pointerOf(event));
      wake();
    });
    stage.addEventListener("pointerleave", (event) => {
      emit("pointerleave", pointerOf(event));
      wake();
    });
    stage.addEventListener("keydown", (event) => {
      S.lastInput = now();
      const handled = (S.ctx && S.ctx._handlers.key || []).length;
      emit("key", event);
      if (!handled && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        const first = (def.controls || []).find((c) => (c.type || "range") === "range");
        if (first) {
          event.preventDefault();
          const step = Number(first.step) || (first.max - first.min) / 50;
          setValue(first.id, S.ctx.params[first.id] + (event.key === "ArrowRight" ? 1 : -1) * step * (event.shiftKey ? 10 : 1), "user");
        }
      }
      wake();
    });
    if (globalThis.IntersectionObserver) {
      new IntersectionObserver((entries) => {
        S.visible = entries[entries.length - 1].isIntersecting;
        if (S.visible) wake();
      }, { rootMargin: "120px 0px" }).observe(stage);
    }
    if (globalThis.document && document.addEventListener) {
      document.addEventListener("visibilitychange", () => {
        S.visible = document.visibilityState !== "hidden";
        if (S.visible) wake();
      });
    }
  }
  function swatch(mark = "raised") {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
      const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
      const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
      return `<svg class="iso-swatch" data-mark="${esc(mark)}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${esc(mark)}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
  }
  function buildControls(ctx) {
    const box = S.el.controls;
    box.innerHTML = "";
    for (const control of S.def.controls || []) box.appendChild(controlNode(control, ctx));
    refreshReset();
  }

  /* ---------- predict first ---------- */
  function showPredict(def) {
    const p = def.predict;
    if (!p || !OPTS.predict || !Array.isArray(p.choices) || !p.choices.length) return;
    S.predicting = true;
    const choices = p.choices.map((choice, index) => {
      const button = h("button", { type: "button", class: "cr-button cr-choice", "data-choice": index, text: choice });
      button.addEventListener("click", () => reveal(index));
      return button;
    });
    const skip = h("button", { type: "button", class: "cr-skip", text: "Skip" });
    skip.addEventListener("click", () => close());
    const box = h("div", { class: "cr-predict", role: "dialog", "aria-label": "Predict first" }, [
      h("div", { class: "cr-predict-head" }, [h("span", { class: "cr-eyebrow", text: "Predict first" }), skip]),
      h("p", { class: "cr-predict-q", text: p.question }),
      h("div", { class: "cr-choices" }, choices),
    ]);
    S.el.plate.appendChild(box);
    post({ type: "predict", open: true });
    function reveal(index) {
      const right = index === p.answer;
      choices.forEach((button, i) => {
        button.setAttribute("disabled", "");
        if (i === p.answer) button.setAttribute("data-right", "");
        if (i === index && !right) button.setAttribute("data-wrong", "");
      });
      const watch = h("button", { type: "button", class: "cr-button", text: "Watch it" });
      watch.addEventListener("click", () => close(index));
      box.appendChild(h("p", { class: "cr-predict-a", text: `${right ? "Right." : "Not quite."} ${p.explain || ""}`.trim() }));
      box.appendChild(watch);
    }
    function close(index) {
      box.remove();
      S.predicting = false;
      post({ type: "predict", open: false });
      emit("reveal", index ?? null);
      wake();
    }
  }

  /* ---------- lifecycle ---------- */
  function makeCtx(params) {
    const parts = new Map();
    const ctx = {
      k: globalThis.k,
      G: globalThis.G,
      T: globalThis.T,
      GL: globalThis.GL,
      d2: globalThis.d2,
      svg: S.el.svg,
      stage: S.el.stage,
      width: S.def.width,
      height: S.def.height,
      params,
      theme: OPTS.theme,
      get calm() {
        return reduced();
      },
      _handlers: {},
      draw(markup) {
        S.el.svg.innerHTML = Array.isArray(markup) ? markup.join("") : String(markup ?? "");
        parts.clear();
        return S.el.svg;
      },
      part(name) {
        if (!parts.has(name)) parts.set(name, S.el.svg.querySelector(`[data-part="${name}"]`));
        const node = parts.get(name);
        if (!node) throw new Error(`no element with data-part="${name}" in the drawing`);
        return node;
      },
      parts(name) {
        return Array.from(S.el.svg.querySelectorAll(`[data-part="${name}"]`));
      },
      readout(text) {
        const value = String(text ?? "");
        if (S.el.readout.textContent !== value) S.el.readout.textContent = value;
      },
      stat(id, value, digits) {
        const node = S.el.stats && S.el.stats.querySelector(`[data-stat="${id}"]`);
        if (!node) return;
        const text = typeof value === "number" ? fmt(value, digits ?? 2) : String(value ?? "—");
        if (node.textContent !== text) node.textContent = text;
      },
      set(id, value) {
        setValue(id, value, "program");
      },
      on(name, fn) {
        (ctx._handlers[name] = ctx._handlers[name] || []).push(fn);
        return ctx;
      },
      idle() {
        return now() - S.lastInput;
      },
      wake,
      time() {
        return S.t;
      },
      clamp,
      lerp,
      follow,
      spring,
      fmt,
      smooth: (a, b, x) => {
        const t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
      },
    };
    return ctx;
  }
  function start() {
    S.starts++;
    S.t = 0;
    S.last = 0;
    const params = S.ctx ? S.ctx.params : Object.fromEntries((S.def.controls || []).filter((c) => c.type !== "button").map((c) => [c.id, defaultOf(c)]));
    S.ctx = makeCtx(params);
    S.el.svg.innerHTML = "";
    S.el.readout.textContent = "";
    if (S.el.stats) S.el.stats.querySelectorAll("[data-stat]").forEach((node) => (node.textContent = "—"));
    S.el.plate.querySelectorAll(".cr-error").forEach((node) => node.remove());
    if (S.starts === 1) buildControls(S.ctx);
    let api;
    try {
      api = S.def.setup ? S.def.setup(S.ctx) : null;
    } catch (error) {
      fail(error, "setup");
      return;
    }
    S.api = typeof api === "function" ? { frame: api } : api || {};
    try {
      if (S.api.frame) S.api.frame(0, 0);
    } catch (error) {
      fail(error, "frame");
      return;
    }
    wake();
  }
  function restart() {
    stop();
    try {
      S.api && S.api.dispose && S.api.dispose();
    } catch {}
    S.api = null;
    start();
    post({ type: "restarted" });
  }
  function resetValues() {
    for (const control of S.def.controls || []) {
      if (control.type === "button") continue;
      S.ctx.params[control.id] = defaultOf(control);
    }
    buildControls(S.ctx);
    restart();
  }
  function setPlaying(playing) {
    S.playing = !!playing;
    if (S.el.pause) S.el.pause.textContent = S.playing ? "Pause" : "Play";
    if (S.playing) wake();
    else stop();
    post({ type: "playing", playing: S.playing });
  }
  function setTheme(theme) {
    OPTS.theme = theme === "dark" ? "dark" : "light";
    document.body.setAttribute("data-theme", OPTS.theme);
    if (S.ctx) S.ctx.theme = OPTS.theme;
    emit("theme", OPTS.theme);
    wake();
  }

  function demo(def) {
    if (S.def) throw new Error("Classroom.demo() was called twice; a demo file defines one figure");
    if (!def || typeof def !== "object") throw new Error("Classroom.demo() needs a definition object");
    S.def = Object.assign({ width: 600, height: 380, controls: [], stats: [], keys: [] }, def);
    const boot = () => {
      try {
        buildShell(S.def);
        start();
        showPredict(S.def);
        S.ready = true;
        post({ type: "ready", title: S.def.title || "", predict: !!S.predicting });
      } catch (error) {
        fail(error, "boot");
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  if (globalThis.addEventListener) {
    globalThis.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.source !== "classroom-host") return;
      if (data.type === "theme") setTheme(data.theme);
      else if (data.type === "pause") setPlaying(false);
      else if (data.type === "play") setPlaying(true);
      else if (data.type === "restart") restart();
      else if (data.type === "reset") resetValues();
      else if (data.type === "set" && data.id) setValue(data.id, data.value, "user");
    });
  }

  globalThis.Classroom = { demo, version: 1, options: OPTS, restart, setPlaying, setTheme, set: (id, value) => setValue(id, value, "user") };
})();
