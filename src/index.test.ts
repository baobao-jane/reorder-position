import { describe, expect, it } from "vitest";
import {
  canMoveDown,
  canMoveUp,
  getPositionChanges,
  moveAndReposition,
  moveSelected,
  needsRebalance,
  repositionOrdered,
  sortByPosition,
  type SortableItem,
} from "./index";

type Item = SortableItem<string>;

/** Builds a desc list: the first id gets the largest position. */
const list = (...ids: string[]): Item[] =>
  ids.map((id, index) => ({ id, sortPosition: ids.length - 1 - index }));

const ids = (items: readonly Item[]) => items.map((item) => item.id);
const selection = (...selected: string[]) => new Set(selected);

describe("sortByPosition", () => {
  it("sorts desc by default and asc on request", () => {
    const items = [
      { id: "a", sortPosition: 1 },
      { id: "b", sortPosition: 3 },
      { id: "c", sortPosition: 2 },
    ];
    expect(ids(sortByPosition(items))).toEqual(["b", "c", "a"]);
    expect(ids(sortByPosition(items, "asc"))).toEqual(["a", "c", "b"]);
  });

  it("keeps input order for equal positions", () => {
    const items = [
      { id: "a", sortPosition: 1 },
      { id: "b", sortPosition: 1 },
    ];
    expect(ids(sortByPosition(items))).toEqual(["a", "b"]);
  });
});

describe("getPositionChanges", () => {
  it("returns changed and newly added items only", () => {
    const before = list("a", "b");
    const after = [
      { id: "a", sortPosition: 1 },
      { id: "b", sortPosition: 5 },
      { id: "c", sortPosition: 9 },
    ];
    expect(getPositionChanges(before, after)).toEqual([
      { id: "b", sortPosition: 5 },
      { id: "c", sortPosition: 9 },
    ]);
  });
});

describe("moveSelected", () => {
  const items = list("a", "b", "c", "d", "e");

  it("moves a single item one slot", () => {
    expect(ids(moveSelected(items, selection("c"), "up"))).toEqual(["a", "c", "b", "d", "e"]);
    expect(ids(moveSelected(items, selection("c"), "down"))).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("moves a contiguous block together", () => {
    expect(ids(moveSelected(items, selection("c", "d"), "up"))).toEqual(["a", "c", "d", "b", "e"]);
  });

  it("leaves a block that is already at the edge in place", () => {
    expect(ids(moveSelected(items, selection("a", "b"), "up"))).toEqual(ids(items));
    expect(ids(moveSelected(items, selection("d", "e"), "down"))).toEqual(ids(items));
  });

  it("does not let a stuck item get overtaken by the next selected one", () => {
    expect(ids(moveSelected(items, selection("a", "c"), "up"))).toEqual(["a", "c", "b", "d", "e"]);
    expect(ids(moveSelected(items, selection("c", "e"), "down"))).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("keeps the relative order of a scattered selection when sent to an end", () => {
    expect(ids(moveSelected(items, selection("b", "d"), "top"))).toEqual(["b", "d", "a", "c", "e"]);
    expect(ids(moveSelected(items, selection("b", "d"), "bottom"))).toEqual(["a", "c", "e", "b", "d"]);
  });
});

describe("canMoveUp / canMoveDown", () => {
  const items = list("a", "b", "c", "d");

  it("is false only when every selected item is packed against the edge", () => {
    expect(canMoveUp(items, selection("a", "b"))).toBe(false);
    expect(canMoveUp(items, selection("a", "c"))).toBe(true);
    expect(canMoveDown(items, selection("c", "d"))).toBe(false);
    expect(canMoveDown(items, selection("b", "d"))).toBe(true);
  });

  it("is false with no selection", () => {
    expect(canMoveUp(items, selection())).toBe(false);
    expect(canMoveDown(items, selection())).toBe(false);
  });
});

describe("moveAndReposition", () => {
  const items = list("a", "b", "c"); // a:2 b:1 c:0

  it("places a moved item at the midpoint of its new neighbours", () => {
    const result = moveAndReposition(items, selection("c"), "up");
    expect(result.changed).toBe(true);
    expect(ids(result.items)).toEqual(["a", "c", "b"]);
    expect(getPositionChanges(items, result.items)).toEqual([{ id: "c", sortPosition: 1.5 }]);
  });

  it("steps past the ends", () => {
    const top = moveAndReposition(items, selection("c"), "top");
    expect(getPositionChanges(items, top.items)).toEqual([{ id: "c", sortPosition: 3 }]);

    const bottom = moveAndReposition(items, selection("a"), "bottom");
    expect(getPositionChanges(items, bottom.items)).toEqual([{ id: "a", sortPosition: -1 }]);
  });

  it("spreads a moved block evenly", () => {
    const four = list("a", "b", "c", "d"); // a:3 b:2 c:1 d:0
    const result = moveAndReposition(four, selection("c", "d"), "top");
    expect(ids(result.items)).toEqual(["c", "d", "a", "b"]);
    expect(getPositionChanges(four, result.items)).toEqual([
      { id: "c", sortPosition: 5 },
      { id: "d", sortPosition: 4 },
    ]);
  });

  it("does not touch selected items that could not move", () => {
    const result = moveAndReposition(items, selection("a", "c"), "up");
    expect(ids(result.items)).toEqual(["a", "c", "b"]);
    expect(getPositionChanges(items, result.items)).toEqual([{ id: "c", sortPosition: 1.5 }]);
  });

  it("reports a no-op move", () => {
    const result = moveAndReposition(items, selection("a"), "up");
    expect(result.changed).toBe(false);
    expect(getPositionChanges(items, result.items)).toEqual([]);
  });

  it("supports asc order", () => {
    const asc = [
      { id: "a", sortPosition: 0 },
      { id: "b", sortPosition: 1 },
      { id: "c", sortPosition: 2 },
    ];
    const result = moveAndReposition(asc, selection("c"), "up", { order: "asc" });
    expect(ids(result.items)).toEqual(["a", "c", "b"]);
    expect(getPositionChanges(asc, result.items)).toEqual([{ id: "c", sortPosition: 0.5 }]);
  });

  it("works with numeric ids", () => {
    const numeric = [
      { id: 10, sortPosition: 1 },
      { id: 20, sortPosition: 0 },
    ];
    const result = moveAndReposition(numeric, new Set([20]), "up");
    expect(result.items.map((item) => item.id)).toEqual([20, 10]);
  });

  it("rebalances once repeated bisection runs out of precision", () => {
    let current = list("a", "b", "c");
    let rebalancedAt = -1;

    // Moving the last item up each time keeps halving the gap under "a".
    for (let i = 0; i < 100 && rebalancedAt < 0; i++) {
      const last = current[current.length - 1].id;
      const result = moveAndReposition(current, selection(last), "up");
      if (result.rebalanced) rebalancedAt = i;
      current = result.items;
    }

    expect(rebalancedAt).toBeGreaterThan(20);
    expect(current.map((item) => item.sortPosition)).toEqual([2, 1, 0]);
    expect(needsRebalance(current)).toBe(false);
  });

  it("rebalances when positions grow past maxAbsPosition", () => {
    const result = moveAndReposition(items, selection("c"), "top", { maxAbsPosition: 2 });
    expect(result.rebalanced).toBe(true);
    expect(result.items).toEqual([
      { id: "c", sortPosition: 2 },
      { id: "a", sortPosition: 1 },
      { id: "b", sortPosition: 0 },
    ]);
  });
});

describe("repositionOrdered", () => {
  const items = list("a", "b", "c", "d", "e"); // a:4 ... e:0

  it("only repositions the dragged item", () => {
    const byId = new Map(items.map((item) => [item.id, item]));
    const dragged = ["a", "c", "d", "b", "e"].map((id) => byId.get(id)!);
    const result = repositionOrdered(dragged);

    expect(result.rebalanced).toBe(false);
    expect(ids(result.items)).toEqual(["a", "c", "d", "b", "e"]);
    expect(getPositionChanges(items, result.items)).toEqual([{ id: "b", sortPosition: 0.5 }]);
  });

  it("produces a valid order for a full reversal", () => {
    const result = repositionOrdered([...items].reverse());
    expect(ids(sortByPosition(result.items))).toEqual(["e", "d", "c", "b", "a"]);
    expect(needsRebalance(result.items)).toBe(false);
  });

  it("assigns a position to items with an invalid one", () => {
    const withNaN = [
      { id: "a", sortPosition: 2 },
      { id: "x", sortPosition: Number.NaN },
      { id: "b", sortPosition: 1 },
    ];
    const result = repositionOrdered(withNaN);
    expect(result.items[1]).toEqual({ id: "x", sortPosition: 1.5 });
  });
});
