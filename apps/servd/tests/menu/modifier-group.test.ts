import { describe, it, expect } from "vitest";
import { modifierGroupSchema } from "@/lib/validation/menu";

/**
 * Saving a group must leave minSelect consistent with the Required flag —
 * otherwise turning Required OFF left a stale minimum behind and diners were
 * still forced to choose an "optional" option.
 */
describe("modifierGroupSchema", () => {
  it("clears the minimum when the group is optional", () => {
    const parsed = modifierGroupSchema.parse({
      name: "Add-ons",
      required: false,
      minSelect: 1,
      maxSelect: 3,
    });
    expect(parsed.minSelect).toBe(0);
  });

  it("keeps an explicit minimum on a required group", () => {
    const parsed = modifierGroupSchema.parse({
      name: "Pick 2 sides",
      required: true,
      minSelect: 2,
      maxSelect: 2,
    });
    expect(parsed.minSelect).toBe(2);
  });

  it("forces at least one selection on a required group", () => {
    const parsed = modifierGroupSchema.parse({
      name: "Size",
      required: true,
      minSelect: 0,
      maxSelect: 1,
    });
    expect(parsed.minSelect).toBe(1);
  });

  it("still rejects max below min", () => {
    expect(() =>
      modifierGroupSchema.parse({ name: "Size", required: true, minSelect: 3, maxSelect: 1 }),
    ).toThrow();
  });
});
