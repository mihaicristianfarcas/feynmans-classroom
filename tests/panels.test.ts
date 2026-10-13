// Side panels' widths (web/src/lib/usePanel.ts): what a drag or a key leaves, and what's kept between visits.
import { beforeEach, describe, expect, it } from "vitest";
import { fitWidth, savedWidth } from "../web/src/lib/usePanel.ts";

const sizes = { initial: 300, min: 220, max: 520 };
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  },
});

describe("side panels", () => {
  beforeEach(() => store.clear());
  it("keeps a width between the narrowest and the widest", () => {
    expect(fitWidth(380.4, sizes)).toBe(380);
    expect(fitWidth(900, sizes)).toBe(520);
    expect(fitWidth(150, sizes)).toBe(220);
  });
  it("closes a panel dragged well past its narrowest width", () => {
    expect(fitWidth(109, sizes)).toBe(0);
    expect(fitWidth(0, sizes)).toBe(0);
    expect(fitWidth(-40, sizes)).toBe(0);
  });
  it("opens at the default width until one is kept, or closed if it starts closed", () => {
    expect(savedWidth("links", sizes)).toBe(300);
    expect(savedWidth("legend", sizes, true)).toBe(0);
  });
  it("keeps the width you set, and a closed panel as 0", () => {
    store.set("classroom-panel-links", "410");
    expect(savedWidth("links", sizes)).toBe(410);
    store.set("classroom-panel-legend", "0");
    expect(savedWidth("legend", sizes)).toBe(0);
  });
  it("brings a kept width back within the sizes, and ignores one it can't read", () => {
    store.set("classroom-panel-links", "2000");
    expect(savedWidth("links", sizes)).toBe(520);
    store.set("classroom-panel-links", "wide");
    expect(savedWidth("links", sizes)).toBe(300);
  });
});
