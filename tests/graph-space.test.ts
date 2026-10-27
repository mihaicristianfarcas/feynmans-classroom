// Finding the graph's items by place: the one under the pointer (from the grid, whatever the zoom's
// slop and whichever items are shown), and the nearest one an arrow key's way.
import { describe, expect, it } from "vitest";
import { Grid, nextInDirection } from "../web/src/components/graph/space.ts";

const item = (id: string, x: number, y: number, r = 10) => ({ id, x, y, r });

describe("the item under the pointer", () => {
  const items = [item("a", 0, 0), item("b", 30, 0), item("big", 380, 380, 40), item("unplaced", Number.NaN, 0)];
  const grid = new Grid<(typeof items)[number]>();
  grid.build(items);

  it("is the one whose circle holds the point, the nearest of two", () => {
    expect(grid.at(2, 1, 0)?.id).toBe("a");
    expect(grid.at(26, 0, 6)?.id).toBe("b");
    expect(grid.at(15, 0, 6)?.id).toBe("a");
  });

  it("reaches as far as the slop past a circle, and no further", () => {
    expect(grid.at(0, 15, 6)?.id).toBe("a");
    expect(grid.at(0, 17, 6)).toBeNull();
    // a big circle across a cell's edge is found from the next cell
    expect(grid.at(418, 380, 0)?.id).toBe("big");
  });

  it("leaves out the items not shown, and those not yet placed", () => {
    expect(grid.at(2, 1, 0, (it) => it.id !== "a")).toBeNull();
    expect(grid.at(Number.NaN, 0, 6)).toBeNull();
  });
});

describe("the arrow keys", () => {
  const here = item("here", 0, 0);
  const items = [
    here,
    item("right", 100, 0),
    item("far right", 300, 0),
    item("right, off to the side", 90, 80),
    item("left", -50, 0),
    item("down", 0, 120),
  ];

  it("move to the nearest item that way, the more in line the better", () => {
    expect(nextInDirection(items, here, "ArrowRight")?.id).toBe("right");
    expect(nextInDirection(items, here, "ArrowLeft")?.id).toBe("left");
    expect(nextInDirection(items, here, "ArrowDown")?.id).toBe("down");
  });

  it("go nowhere when nothing lies that way, or for other keys", () => {
    expect(nextInDirection(items, here, "ArrowUp")).toBeNull();
    expect(nextInDirection(items, here, "Enter")).toBeNull();
  });
});
