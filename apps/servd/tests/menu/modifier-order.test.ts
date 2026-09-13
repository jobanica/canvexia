import { describe, it, expect } from "vitest";
import { sortModifierGroups } from "@/lib/menu/modifier-order";

/**
 * The reported bug: the same three groups came out as Size → Flavour → Add-ons
 * on one dish and Flavour → Add-ons → Size on the next. The order used to come
 * off the item↔group link, whose sortOrder nothing ever wrote — so every row
 * tied at 0 and the database returned whatever order suited it, per item.
 */

const g = (id: string, name: string, sortOrder: number | null = null) => ({
  id,
  name,
  sortOrder,
});

const SIZE = g("size", "Size", 0);
const FLAVOUR = g("flavour", "Flavour", 1);
const ADDONS = g("addons", "Add-ons", 2);

describe("sortModifierGroups", () => {
  it("uses the order set on the Modifiers page", () => {
    expect(sortModifierGroups([ADDONS, SIZE, FLAVOUR]).map((x) => x.id)).toEqual([
      "size",
      "flavour",
      "addons",
    ]);
  });

  it("gives every item the SAME order, whatever order they arrive in", () => {
    // This is the whole bug. Two items holding the same groups in different
    // row order must produce one sequence.
    const itemA = sortModifierGroups([SIZE, FLAVOUR, ADDONS]).map((x) => x.id);
    const itemB = sortModifierGroups([FLAVOUR, ADDONS, SIZE]).map((x) => x.id);
    const itemC = sortModifierGroups([ADDONS, SIZE, FLAVOUR]).map((x) => x.id);
    expect(itemA).toEqual(itemB);
    expect(itemB).toEqual(itemC);
  });

  it("puts an unordered group last, not first", () => {
    // A group nobody has placed yet shouldn't shove itself above Size and
    // rearrange a menu the owner was happy with.
    const fresh = g("new", "Extra rice");
    expect(sortModifierGroups([fresh, SIZE, FLAVOUR]).map((x) => x.id)).toEqual([
      "size",
      "flavour",
      "new",
    ]);
  });

  it("is deterministic when nothing has an order at all", () => {
    // Before the migration runs, every group is null. Falling back to name
    // still gives one answer rather than a different one per item.
    const a = g("b", "Beta");
    const b = g("a", "Alpha");
    expect(sortModifierGroups([a, b]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(sortModifierGroups([b, a]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("breaks an exact tie on id, so two groups sharing a position don't flip", () => {
    const x = g("zzz", "Same", 3);
    const y = g("aaa", "Same", 3);
    expect(sortModifierGroups([x, y]).map((x) => x.id)).toEqual(["aaa", "zzz"]);
    expect(sortModifierGroups([y, x]).map((x) => x.id)).toEqual(["aaa", "zzz"]);
  });

  it("doesn't mutate the caller's array", () => {
    const list = [ADDONS, SIZE];
    sortModifierGroups(list);
    expect(list.map((x) => x.id)).toEqual(["addons", "size"]);
  });

  it("handles an empty list and a single group", () => {
    expect(sortModifierGroups([])).toEqual([]);
    expect(sortModifierGroups([SIZE]).map((x) => x.id)).toEqual(["size"]);
  });
});
