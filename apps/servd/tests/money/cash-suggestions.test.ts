import { describe, it, expect } from "vitest";
import { cashSuggestions, formatPeso } from "@/lib/money";

/**
 * Notes a customer is likely to be holding, offered as taps at checkout so the
 * counter knows the change before they arrive. The field it replaces was
 * free-text, and in practice nobody filled it in.
 */

describe("cashSuggestions", () => {
  it("always offers the exact amount first — plenty of people pay exactly", () => {
    expect(cashSuggestions(46500)[0]).toBe(46500);
  });

  it("offers round notes above the bill", () => {
    const out = cashSuggestions(46500); // ₱465.00
    expect(out).toContain(46500);
    // ₱500 and ₱1000 are the notes someone would actually hand over.
    expect(out).toContain(50000);
    expect(out).toContain(100000);
  });

  it("never suggests less than the bill — that isn't paying", () => {
    for (const total of [100, 4999, 46500, 123456, 999999]) {
      for (const s of cashSuggestions(total)) {
        expect(s, `${formatPeso(total)} → ${formatPeso(s)}`).toBeGreaterThanOrEqual(total);
      }
    }
  });

  it("keeps the list short enough to tap without reading", () => {
    for (const total of [100, 46500, 123456, 987654]) {
      expect(cashSuggestions(total).length).toBeLessThanOrEqual(4);
    }
  });

  it("never repeats an amount", () => {
    for (const total of [2000, 5000, 10000, 46500]) {
      const out = cashSuggestions(total);
      expect(new Set(out).size).toBe(out.length);
    }
  });

  // An exact multiple of a note shouldn't offer that same note twice — the
  // bill IS the note.
  it("handles a bill that is already a round note", () => {
    const out = cashSuggestions(10000); // exactly ₱100
    expect(out[0]).toBe(10000);
    expect(new Set(out).size).toBe(out.length);
    expect(out.every((n) => n >= 10000)).toBe(true);
  });

  it("returns something usable for a zero bill", () => {
    expect(cashSuggestions(0)[0]).toBe(0);
  });
});
