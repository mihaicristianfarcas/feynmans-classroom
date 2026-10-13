// FSRS-6 scheduling: stability, retrievability, intervals and replaying a review log.
import { describe, expect, it } from "vitest";
import { forgetting, intervalDays, replay, retrievability, review } from "../shared/fsrs.ts";

const DAY = 86400000;
describe("FSRS-6", () => {
  it("defines stability as the interval at which recall falls to 90%", () => {
    expect(forgetting(10, 10)).toBeCloseTo(0.9, 6);
    expect(intervalDays(10, 0.9)).toBeCloseTo(10, 6);
    expect(intervalDays(10, 0.95)).toBeLessThan(10);
  });
  it("walks a new card through the learning steps", () => {
    const t = Date.UTC(2026, 0, 1);
    const a = review(null, 3, t);
    expect(a.phase).toBe("learning");
    expect(a.due - t).toBe(10 * 60000);
    const b = review(a, 3, a.due);
    expect(b.phase).toBe("review");
    expect(b.due - b.last).toBeGreaterThanOrEqual(DAY);
  });
  it("Easy graduates at once with a longer interval than Good would", () => {
    const t = Date.UTC(2026, 0, 1);
    const easy = review(null, 4, t);
    expect(easy.phase).toBe("review");
    expect(easy.due - t).toBeGreaterThan(3 * DAY);
  });
  it("a lapse sends a card to relearning and lowers stability", () => {
    const t = Date.UTC(2026, 0, 1);
    let s = replay([
      { ts: t, rating: 3 },
      { ts: t + 600000, rating: 3 },
    ])!;
    const before = s.s;
    s = review(s, 1, s.due);
    expect(s.phase).toBe("relearning");
    expect(s.lapses).toBe(1);
    expect(s.s).toBeLessThan(before);
  });
  it("intervals grow with successful reviews", () => {
    const t = Date.UTC(2026, 0, 1);
    let s = replay([
      { ts: t, rating: 3 },
      { ts: t + 600000, rating: 3 },
    ])!;
    const gaps: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = review(s, 3, s.due);
      gaps.push(s.due - s.last);
    }
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    expect(retrievability(s, s.due)).toBeCloseTo(0.9, 1);
  });
});
