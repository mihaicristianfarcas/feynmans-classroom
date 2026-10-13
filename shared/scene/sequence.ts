/* sequence: actors (processes, servers, clients) on vertical lifelines, messages as arrows that
 * travel while the clock runs. Time goes down. The reader scrubs time with the progress slider,
 * steps from event to event, and changes params (latency, timeouts) that the event times use. */
import { evalNum, fillTemplate, type Scope } from "./expr.ts";
import { Labels } from "./labels.ts";
import { arriveTime, eventTime } from "./model.ts";
import { arrow, circle, dot, line, niceTicks, type Pt, r1, rect, shape, text, textWidth, tickLabel } from "./svg.ts";
import type { Actor, FrameState, RenderOut, SeqEvent, SequenceScene, Tone } from "./types.ts";
import { HEIGHT, WIDTH } from "./types.ts";

const TOP = 104;
const BOTTOM = HEIGHT - 16;
const GLYPH_Y = 30;

function glyph(actor: Actor, cx: number, tone: Tone, opacity = 1): string {
  const y = GLYPH_Y;
  const s = { tone, id: actor.id, opacity };
  switch (actor.shape) {
    case "server":
      return rect(cx - 14, y - 16, 28, 32, "paper", { ...s, rx: 2 }) + line([[cx - 14, y - 5], [cx + 14, y - 5]], { tone: "lo", opacity }) + line([[cx - 14, y + 6], [cx + 14, y + 6]], { tone: "lo", opacity }) + dot(cx + 9, y - 10.5, 1.4, { tone, opacity }) + dot(cx + 9, y + 0.5, 1.4, { tone, opacity }) + dot(cx + 9, y + 11, 1.4, { tone, opacity });
    case "database":
      return shape(`M${cx - 14} ${y - 11}v22a14 5 0 0 0 28 0v-22`, "paper", s) + `<ellipse cx="${cx}" cy="${y - 11}" rx="14" ry="5" class="sc-shape" data-fill="paper" data-tone="${tone}"${opacity < 1 ? ` style="opacity:${opacity}"` : ""}/>` + shape(`M${cx - 14} ${y}a14 5 0 0 0 28 0`, "none", { tone: "lo", opacity });
    case "client":
      return rect(cx - 15, y - 13, 30, 21, "paper", { ...s, rx: 2 }) + line([[cx, y + 8], [cx, y + 13]], { tone: "mid", opacity }) + line([[cx - 7, y + 14], [cx + 7, y + 14]], { tone: "mid", opacity });
    case "queue":
      return rect(cx - 17, y - 9, 34, 18, "paper", { ...s, rx: 2 }) + [-8.5, 0, 8.5].map((dx) => line([[cx + dx, y - 9], [cx + dx, y + 9]], { tone: "lo", opacity })).join("");
    case "person":
      return circle(cx, y - 9, 6, "paper", s) + shape(`M${cx - 12} ${y + 15}c0-10 5-15 12-15s12 5 12 15z`, "paper", s);
    case "process":
      return rect(cx - 16, y - 11, 32, 22, "paper", { ...s, rx: 7 });
    default:
      return circle(cx, y, 13, "paper", s) + dot(cx, y, 2, { tone, opacity });
  }
}

interface Clock {
  send?: string;
  recv?: string;
  local?: string;
}

/** Lamport or vector clocks for every event, from event times (sends before receives at a tie). */
function clocksOf(spec: SequenceScene, scope: Scope): Map<string, Clock> {
  const out = new Map<string, Clock>();
  if (spec.clocks === "none") return out;
  const index = new Map(spec.actors.map((a, i) => [a.id, i]));
  const n = spec.actors.length;
  type Ev = { time: number; order: number; kind: "send" | "recv" | "local"; actor: string; id: string; msg?: string };
  const evs: Ev[] = [];
  for (const e of spec.events) {
    if (e.when !== "" && !evalNum(e.when, scope, 1)) continue;
    if (e.type === "message") {
      evs.push({ time: eventTime(e, scope), order: 0, kind: "send", actor: e.from, id: e.id });
      if (!e.lost) evs.push({ time: arriveTime(e, scope), order: 1, kind: "recv", actor: e.to, id: e.id });
    } else if (e.type === "state") evs.push({ time: eventTime(e, scope), order: 0, kind: "local", actor: e.actor, id: e.id });
  }
  evs.sort((a, b) => a.time - b.time || a.order - b.order);
  const lamport = new Map<string, number>();
  const vector = new Map<string, number[]>();
  const carried = new Map<string, number | number[]>();
  for (const ev of evs) {
    if (!index.has(ev.actor)) continue;
    const entry = out.get(ev.id) || {};
    if (spec.clocks === "lamport") {
      let c = lamport.get(ev.actor) || 0;
      if (ev.kind === "recv") c = Math.max(c, (carried.get(ev.id) as number) || 0) + 1;
      else c += 1;
      lamport.set(ev.actor, c);
      if (ev.kind === "send") carried.set(ev.id, c);
      entry[ev.kind] = String(c);
    } else {
      const v = [...(vector.get(ev.actor) || new Array(n).fill(0))];
      if (ev.kind === "recv") {
        const m = (carried.get(ev.id) as number[]) || [];
        for (let i = 0; i < n; i++) v[i] = Math.max(v[i], m[i] || 0);
      }
      v[index.get(ev.actor)!] += 1;
      vector.set(ev.actor, v);
      if (ev.kind === "send") carried.set(ev.id, [...v]);
      entry[ev.kind] = `[${v.join(",")}]`;
    }
    out.set(ev.id, entry);
  }
  return out;
}

export function renderSequence(spec: SequenceScene, state: FrameState): RenderOut {
  const { scope, vis, focus } = state;
  const now = Number(scope.now) || 0;
  const n = spec.actors.length;
  const left = 78;
  const right = 56;
  const xs = new Map(spec.actors.map((a, i) => [a.id, n === 1 ? WIDTH / 2 : left + (i * (WIDTH - left - right)) / (n - 1)]));
  const shownEvent = (e: SeqEvent) => (vis(e.id) > 0.01 && (e.when === "" || !!evalNum(e.when, scope, 1)) ? vis(e.id) : 0);

  // time scale from every event (so it does not jump while playing)
  let end = 1;
  for (const e of spec.events) {
    end = Math.max(end, eventTime(e, scope));
    if (e.type === "message") end = Math.max(end, arriveTime(e, scope));
    if ((e.type === "span" || e.type === "partition") && e.until !== "") end = Math.max(end, evalNum(e.until, scope, 0));
  }
  end += 0.4;
  const ty = (time: number) => TOP + (Math.max(0, time) / end) * (BOTTOM - TOP);
  const labels = new Labels({ x: 2, y: 2, w: WIDTH - 4, h: HEIGHT - 4 });
  const back: string[] = [];
  const mid: string[] = [];
  const front: string[] = [];
  const clocks = clocksOf(spec, scope);

  /* time axis on the left */
  const ticks = niceTicks(0, end - 0.4, Math.min(8, Math.ceil(end)));
  for (const v of ticks) {
    const y = ty(v);
    back.push(line([[left - 34, y], [WIDTH - 12, y]], { tone: "faint" }));
    back.push(text(left - 40, y + 3.5, tickLabel(v), { size: 10, anchor: "end", mono: true, tone: "lo" }));
  }
  if (spec.timeLabel) back.push(text(8, TOP - 12, spec.timeLabel, { size: 11, anchor: "start", italic: true, tone: "mid" }));

  /* partitions (behind everything) */
  for (const e of spec.events) {
    if (e.type !== "partition") continue;
    const o = shownEvent(e);
    const at = eventTime(e, scope);
    if (!o || now < at) continue;
    const until = e.until === "" ? end : evalNum(e.until, scope, end);
    const cols = e.actors.map((id) => xs.get(id)).filter((x): x is number => x !== undefined);
    if (!cols.length) continue;
    const x0 = Math.min(...cols) - 30,
      x1 = Math.max(...cols) + 30;
    const y0 = ty(at),
      y1 = ty(Math.min(now, until));
    back.push(rect(x0, y0, x1 - x0, Math.max(2, y1 - y0), "tint", { tone: focus.has(e.id) ? "lit" : "red", rx: 3, id: e.id, opacity: o * 0.7 }));
    // a jagged wall on both sides
    for (const wx of [x0, x1]) {
      const pts: Pt[] = [];
      for (let y = y0, i = 0; y <= y1; y += 6, i++) pts.push([wx + (i % 2 ? 3 : -3), y]);
      if (pts.length > 1) back.push(line(pts, { tone: "red", opacity: o }));
    }
    if (e.label) front.push(text((x0 + x1) / 2, y0 + 13, e.label, { size: 10, anchor: "middle", mono: true, tone: "red", opacity: o, halo: true }));
  }

  /* lifelines, with dead stretches after a crash */
  for (const actor of spec.actors) {
    const x = xs.get(actor.id)!;
    const downs = spec.events
      .filter((e): e is Extract<SeqEvent, { type: "crash" | "recover" }> => (e.type === "crash" || e.type === "recover") && e.actor === actor.id && !!shownEvent(e))
      .map((e) => ({ time: eventTime(e, scope), up: e.type === "recover" }))
      .sort((a, b) => a.time - b.time);
    let cursor = 0;
    let alive = true;
    const segs: { a: number; b: number; alive: boolean }[] = [];
    for (const d of downs) {
      if (d.time > now) break;
      segs.push({ a: cursor, b: d.time, alive });
      cursor = d.time;
      alive = d.up;
    }
    segs.push({ a: cursor, b: end, alive });
    back.push(line([[x, 64], [x, TOP - 4]], { tone: "lo" }));
    for (const s of segs) back.push(line([[x, ty(s.a)], [x, ty(s.b)]], s.alive ? { tone: "lo" } : { tone: "faint", dashed: true }));
    const tone: Tone = focus.has(actor.id) ? "lit" : "hi";
    front.push(`<g data-id="${actor.id}">${glyph(actor, x, tone)}</g>`);
    front.push(text(x, 66, actor.label, { size: 12, anchor: "middle", tone: "hi", weight: 500, italic: false }));
    if (actor.sublabel) front.push(text(x, 80, actor.sublabel, { size: 10, anchor: "middle", mono: true, tone: "mid" }));
    labels.reserve({ x: x - 24, y: 8, w: 48, h: 76 });
  }

  /* state boxes claim their space first, so labels and clocks go around them */
  for (const e of spec.events) {
    if (e.type !== "state" || !shownEvent(e) || now < eventTime(e, scope) - 1e-6) continue;
    const x = xs.get(e.actor);
    if (x === undefined) continue;
    const w = textWidth(fillTemplate(e.text, scope), 10.5, true) + 12;
    labels.reserve({ x: Math.max(4, Math.min(WIDTH - 4 - w, x - w / 2)), y: ty(eventTime(e, scope)) - 9, w, h: 18 });
  }

  /* events */
  const latestMsg = spec.events
    .filter((e): e is Extract<SeqEvent, { type: "message" }> => e.type === "message" && !!shownEvent(e) && eventTime(e, scope) <= now)
    .sort((a, b) => eventTime(b, scope) - eventTime(a, scope))[0];
  let narration = "";
  let narrationAt = -Infinity;
  for (const e of spec.events) {
    const o = shownEvent(e);
    if (!o) continue;
    const at = eventTime(e, scope);
    if (e.narration && at <= now + 1e-6 && at >= narrationAt) {
      narration = fillTemplate(e.narration, scope);
      narrationAt = at;
    }
    if (now < at - 1e-6) continue;
    const focused = focus.has(e.id);
    switch (e.type) {
      case "message": {
        const x1 = xs.get(e.from),
          x2 = xs.get(e.to);
        if (x1 === undefined || x2 === undefined) break;
        const arrive = arriveTime(e, scope);
        const done = now >= arrive - 1e-6;
        const f = arrive > at ? Math.min(1, (now - at) / (arrive - at)) : 1;
        const lostAt = 0.55;
        const tone: Tone = focused ? "lit" : e === latestMsg || !done ? (e.tone === "mid" ? "hi" : e.tone) : e.tone === "hi" ? "mid" : e.tone;
        const y1 = ty(at),
          y2 = ty(arrive);
        let a: Pt = [x1, y1],
          b: Pt = [x2, y2];
        if (e.from === e.to) {
          // a message to itself: a small loop to the right
          const pts: Pt[] = [[x1, y1], [x1 + 26, y1], [x1 + 26, y2], [x1 + 4, y2]];
          mid.push(line(pts, { tone, dashed: e.reply, id: e.id, opacity: o }));
          break;
        }
        const reach = e.lost ? Math.min(f, lostAt) : f;
        const tip: Pt = [a[0] + (b[0] - a[0]) * reach, a[1] + (b[1] - a[1]) * reach];
        if (done && !e.lost) mid.push(arrow(a, b, { tone, dashed: e.reply, id: e.id, opacity: o, head: 7, width: tone === "lit" ? 2 : undefined }));
        else mid.push(line([a, tip], { tone, dashed: e.reply, id: e.id, opacity: o, width: tone === "lit" ? 2 : undefined }));
        if (e.lost && f >= lostAt) {
          const s = 5;
          mid.push(line([[tip[0] - s, tip[1] - s], [tip[0] + s, tip[1] + s]], { tone: "red", opacity: o, width: 1.6 }) + line([[tip[0] - s, tip[1] + s], [tip[0] + s, tip[1] - s]], { tone: "red", opacity: o, width: 1.6 }));
        }
        if (!done && !(e.lost && f >= lostAt)) front.push(circle(tip[0], tip[1], 4.2, "solid", { tone: "lit", opacity: o }));
        if (e.label) {
          const label = fillTemplate(e.label, scope);
          const mx = (a[0] + (e.lost ? tip[0] : b[0])) / 2;
          const my = (a[1] + (e.lost ? tip[1] : b[1])) / 2;
          const w = textWidth(label, 11);
          const at2 = labels.place(mx, my, label, 11, [[0, -6, "middle"], [0, 13, "middle"], [w / 2 + 8, 4, "middle"], [-w / 2 - 8, 4, "middle"]]);
          front.push(text(at2.x, at2.y, label, { size: 11, anchor: "middle", tone: tone === "lo" ? "mid" : tone, opacity: o, halo: true, id: e.id }));
        }
        const clock = clocks.get(e.id);
        const dir = x2 > x1 ? 1 : -1;
        if (clock?.send) {
          const c = labels.place(x1 - dir * 7, y1 + 3.5, clock.send, 9.5, [[0, 0, dir > 0 ? "end" : "start"], [0, -9, dir > 0 ? "end" : "start"], [0, 11, dir > 0 ? "end" : "start"]], true);
          front.push(text(c.x, c.y, clock.send, { size: 9.5, anchor: c.anchor, mono: true, tone: "mid", halo: true }));
        }
        if (clock?.recv && done && !e.lost) {
          const c = labels.place(x2 + dir * 7, y2 + 3.5, clock.recv, 9.5, [[0, 0, dir > 0 ? "start" : "end"], [0, 12, dir > 0 ? "start" : "end"], [0, -10, dir > 0 ? "start" : "end"], [-dir * 14, 12, dir > 0 ? "end" : "start"]], true);
          front.push(text(c.x, c.y, clock.recv, { size: 9.5, anchor: c.anchor, mono: true, tone: "mid", halo: true }));
        }
        break;
      }
      case "state": {
        const x = xs.get(e.actor);
        if (x === undefined) break;
        const y = ty(at);
        const label = fillTemplate(e.text, scope);
        const w = textWidth(label, 10.5, true) + 12;
        const tone: Tone = focused ? "lit" : e.tone;
        // keep the box on the stage: shift it inward at the edges
        const bx = Math.max(4, Math.min(WIDTH - 4 - w, x - w / 2));
        front.push(`<g data-id="${e.id}"${o < 1 ? ` style="opacity:${r1(o * 100) / 100}"` : ""}>${rect(bx, y - 9, w, 18, "paper", { tone, rx: 2 })}${text(bx + w / 2, y + 3.6, label, { size: 10.5, anchor: "middle", mono: true, tone: tone === "lo" ? "mid" : tone })}</g>`);
        const clock = clocks.get(e.id);
        if (clock?.local) {
          const at2 = labels.place(x + w / 2 + 5, y + 3.5, clock.local, 9.5, [[0, 0, "start"], [-w - 10, 0, "end"]], true);
          front.push(text(at2.x, at2.y, clock.local, { size: 9.5, anchor: at2.anchor, mono: true, tone: "mid" }));
        }
        break;
      }
      case "span": {
        const x = xs.get(e.actor);
        if (x === undefined) break;
        const until = e.until === "" ? end : evalNum(e.until, scope, end);
        const y0 = ty(at),
          y1 = ty(Math.min(now, until));
        mid.push(rect(x - 4, y0, 8, Math.max(1, y1 - y0), "tint", { tone: focused ? "lit" : e.tone, id: e.id, opacity: o }));
        if (e.label) {
          const at2 = labels.place(x + 9, y0 + 10, e.label, 10, [[0, 0, "start"], [-18, 0, "end"]], true);
          front.push(text(at2.x, at2.y, e.label, { size: 10, anchor: at2.anchor, mono: true, tone: "mid", opacity: o, halo: true }));
        }
        break;
      }
      case "crash": {
        const x = xs.get(e.actor);
        if (x === undefined) break;
        const y = ty(at),
          s = 7;
        front.push(line([[x - s, y - s], [x + s, y + s]], { tone: "red", width: 2, id: e.id, opacity: o }) + line([[x - s, y + s], [x + s, y - s]], { tone: "red", width: 2, opacity: o }));
        if (e.label) front.push(text(x + 11, y + 4, e.label, { size: 10, mono: true, tone: "red", opacity: o, halo: true }));
        break;
      }
      case "recover": {
        const x = xs.get(e.actor);
        if (x === undefined) break;
        const y = ty(at);
        front.push(circle(x, y, 5, "paper", { tone: "green", id: e.id, opacity: o, width: 1.6 }));
        if (e.label) front.push(text(x + 10, y + 4, e.label, { size: 10, mono: true, tone: "green", opacity: o, halo: true }));
        break;
      }
    }
  }

  /* now: a line across the lifelines */
  const ny = ty(now);
  if (now > 0 && now < end) {
    front.push(line([[left - 30, ny], [WIDTH - 12, ny]], { tone: "lit", dashed: true, opacity: 0.55 }));
    front.push(text(left - 40, ny + 3.5, `${tickLabel(Math.round(now * 10) / 10)}`, { size: 10, anchor: "end", mono: true, tone: "hi", halo: true }));
  }
  return { svg: `<g class="sc-back">${back.join("")}</g><g>${mid.join("")}</g><g class="sc-front">${front.join("")}</g>`, narration };
}

