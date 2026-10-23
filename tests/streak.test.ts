// The streak: a missed day breaks it; a pause passes over the days away (neither counting them nor
// breaking on them), even after it has ended; pausing isn't studying; a pause runs 1–30 days from today.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "classroom-streak-"));
process.env.DATA_DIR = dir;

const DAY = 86400000;
let V: typeof import("../server/vault/index.ts");
let J: typeof import("../server/learn/journey.ts");

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The day `n` days from today (a day starts at 4 am). */
const day = (n: number) => {
  const d = new Date(Date.now() - 4 * 3600000);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};
const studied = (daysAgo: number) =>
  V.logActivity({ type: "note", ts: Date.now() - daysAgo * DAY, text: "Wrote a note" });

beforeAll(async () => {
  V = await import("../server/vault/index.ts");
  V.initVault();
  J = await import("../server/learn/journey.ts");
});

describe("the streak", () => {
  it("is broken by a day without study", () => {
    for (const n of [6, 5, 4, 0]) studied(n);
    expect(J.journey().streak).toBe(1);
    expect(J.journey().pausedUntil).toBeNull();
  });

  it("passes over the days of a pause, even one that has ended, without counting them", () => {
    V.logActivity({ type: "pause", ts: Date.now() - 3 * DAY, text: "Paused", data: { from: day(-3), until: day(-1) } });
    const j = J.journey();
    expect(j.streak).toBe(4); // 6, 5, 4 and today
    expect(j.pausedUntil).toBeNull();
    expect(j.days[day(-3)]).toBeUndefined(); // pausing isn't studying
  });

  it("pauses from today for the days asked, 1 to 30", () => {
    const before = J.journey().days[day(0)].events;
    const j = J.pauseStreak(7);
    expect(j.pausedUntil).toBe(day(6));
    expect(j.days[day(0)].events).toBe(before);
    expect(V.activity().at(-1)).toMatchObject({ type: "pause", data: { from: day(0), until: day(6) } });
    expect(V.activity().at(-1)?.text).toMatch(/^Paused the streak until /);
    expect(J.pauseStreak(0).pausedUntil).toBe(day(6));
    expect(V.activity().at(-1)?.data).toEqual({ from: day(0), until: day(0) });
    expect(J.pauseStreak(99).pausedUntil).toBe(day(29));
  });
});
