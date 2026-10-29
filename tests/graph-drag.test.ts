// Dragging in the graph's layout: the item stays under the pointer, what it is linked to follows, what it
// comes up against makes room, and the rest of the graph keeps exactly still (no chain reaction through
// the whole layout). The worker's steps run on fake timers, each test running them until it has none left.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FromLayout, LayoutLink, LayoutNode, ToLayout } from "../web/src/components/graph/layout.worker.ts";

type Message = { gen: number; xy: Float32Array; done: boolean };

let onMessage: (e: { data: ToLayout }) => void = () => {};
const messages: Message[] = [];
const original = (globalThis as unknown as { self?: unknown }).self;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  (globalThis as unknown as { self: unknown }).self = {
    addEventListener: (_type: string, fn: (e: { data: ToLayout }) => void) => {
      onMessage = fn;
    },
    postMessage: (m: FromLayout) => {
      // the worker sends its buffer along, so keep a copy
      messages.push({ gen: m.gen, xy: new Float32Array(m.xy), done: m.done });
    },
  };
  await import("../web/src/components/graph/layout.worker.ts");
});

afterAll(() => {
  vi.useRealTimers();
  (globalThis as unknown as { self: unknown }).self = original;
});

const send = (data: ToLayout) => onMessage({ data });
const last = () => messages[messages.length - 1];
const at = (i: number) => [last().xy[i * 2], last().xy[i * 2 + 1]];
const item = (kind: LayoutNode["kind"], x: number, y: number): LayoutNode => ({
  kind,
  r: 10,
  named: false,
  labelWidth: 0,
  x,
  y,
});
const link = (source: number, target: number): LayoutLink => ({ source, target, kind: "related" });

/** A book (0) with three concepts round it (1–3), a lone concept off to its right (4) and a chain of
 * concepts far away (5–9). Laid out with no warmth, it rests just as given, its forces far from even. */
function layOut(gen: number, alpha: number) {
  const nodes = [
    item("book", 0, 0),
    item("concept", 0, -110),
    item("concept", -100, 60),
    item("concept", 100, 60),
    item("concept", 400, 0),
    ...[0, 1, 2, 3, 4].map((k) => item("concept", 2000 + k * 110, 1000)),
  ];
  const links = [link(0, 1), link(0, 2), link(0, 3), link(5, 6), link(6, 7), link(7, 8), link(8, 9)];
  send({ type: "graph", gen, nodes, links, aspect: 1.5, spread: 1, alpha });
}
function graph(gen: number) {
  layOut(gen, 0);
  vi.runAllTimers();
  return new Float32Array(last().xy);
}

/** Moves item i to (x, y) in steps of a frame, as a pointer would. */
function dragTo(i: number, from: [number, number], to: [number, number], moves = 20) {
  for (let k = 1; k <= moves; k++) {
    send({
      type: "drag",
      i,
      x: from[0] + ((to[0] - from[0]) * k) / moves,
      y: from[1] + ((to[1] - from[1]) * k) / moves,
    });
    vi.advanceTimersByTime(16);
  }
}

const far = [5, 6, 7, 8, 9];

describe("dragging one item", () => {
  it("picked up and held still, moves nothing, and waits for the pointer", () => {
    const before = graph(1);
    send({ type: "drag", i: 0, x: before[0], y: before[1] });
    vi.runAllTimers();
    for (let j = 0; j < before.length; j++) expect(last().xy[j]).toBeCloseTo(before[j], 3);
    // nothing is scheduled while the pointer holds it still
    expect(vi.getTimerCount()).toBe(0);
    send({ type: "release", i: 0 });
    vi.runAllTimers();
    expect(last().done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("brings what it links to along, and leaves the rest of the graph still", () => {
    const before = graph(2);
    dragTo(0, [0, 0], [0, -300]);
    vi.runAllTimers();
    expect(at(0)).toEqual([0, -300]);
    // its concepts came along, the one it ran into stepping aside, and are about a link's length from it
    for (const j of [1, 2, 3]) {
      expect(before[j * 2 + 1] - at(j)[1]).toBeGreaterThan(100);
      expect(Math.hypot(at(j)[0], at(j)[1] + 300)).toBeLessThan(150);
    }
    // the lone concept nothing came near, and the chain across the graph, did not move at all
    for (const j of [4, ...far]) expect(at(j)).toEqual([before[j * 2], before[j * 2 + 1]]);
    expect(vi.getTimerCount()).toBe(0);

    send({ type: "release", i: 0 });
    vi.runAllTimers();
    expect(last().done).toBe(true);
    // let go, it stays where it was left, and so does the rest
    expect(at(0)).toEqual([0, -300]);
    for (const j of [4, ...far]) expect(at(j)).toEqual([before[j * 2], before[j * 2 + 1]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps going after the pointer stops, until what it brings along has caught up", () => {
    graph(3);
    // one jump, then the pointer holds still: its concepts keep following, to about a link's length away
    send({ type: "drag", i: 0, x: 0, y: -300 });
    vi.advanceTimersByTime(0);
    const away = (j: number) => Math.hypot(at(j)[0], at(j)[1] + 300);
    const early = [1, 2, 3].map(away);
    vi.runAllTimers();
    [1, 2, 3].forEach((j, k) => {
      expect(early[k]).toBeGreaterThan(160);
      expect(away(j)).toBeLessThan(140);
    });
    expect(vi.getTimerCount()).toBe(0);
    send({ type: "release", i: 0 });
    vi.runAllTimers();
  });

  it("makes room where it is dropped", () => {
    const before = graph(4);
    const lone: [number, number] = [before[8], before[9]];
    dragTo(0, [0, 0], lone);
    send({ type: "release", i: 0 });
    vi.runAllTimers();
    expect(last().done).toBe(true);
    expect(at(0)).toEqual(lone);
    // the lone concept moved out of the book's way (book 60 + concept 46 of room, give or take)
    const [x, y] = at(4);
    expect(Math.hypot(x - lone[0], y - lone[1])).toBeGreaterThan(90);
    for (const j of far) expect(at(j)).toEqual([before[j * 2], before[j * 2 + 1]]);
  });

  it("parts what it passes through, which closes up again behind it", () => {
    const before = graph(5);
    const lone: [number, number] = [before[8], before[9]];
    // right through the lone concept and well past it
    dragTo(0, [0, 0], [lone[0] + 400, lone[1]], 40);
    let farthest = 0;
    for (const m of messages.slice(-40))
      farthest = Math.max(farthest, Math.hypot(m.xy[8] - lone[0], m.xy[9] - lone[1]));
    vi.runAllTimers();
    // it stepped aside as the book came through, and is back about where it was (the book's concepts,
    // on its other side now, push it a little)
    expect(farthest).toBeGreaterThan(40);
    expect(Math.hypot(at(4)[0] - lone[0], at(4)[1] - lone[1])).toBeLessThan(25);
    for (const j of far) expect(at(j)).toEqual([before[j * 2], before[j * 2 + 1]]);
    send({ type: "release", i: 0 });
    vi.runAllTimers();
  });

  it("held while the layout is still settling, lets the layout carry on round it", () => {
    layOut(6, 1);
    send({ type: "drag", i: 0, x: 50, y: 50 });
    vi.runAllTimers();
    expect(last().gen).toBe(6);
    expect(last().done).toBe(true);
    expect(at(0)).toEqual([50, 50]);
    send({ type: "release", i: 0 });
    vi.runAllTimers();
    expect(vi.getTimerCount()).toBe(0);
  });
});
