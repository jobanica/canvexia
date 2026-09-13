import { describe, it, expect } from "vitest";
import { parseMenuText, reviewedMenuSchema } from "@/server/menu/menu-scan";

/**
 * The AI menu parser is deliberately tolerant of how the model wraps its JSON,
 * and deliberately strict about what it will hand back. It's now shared by the
 * admin import and the public DIY builder, so a regression here would hit both.
 */
describe("parseMenuText", () => {
  const good = JSON.stringify({
    categories: [
      { name: "Mains", items: [{ name: "Adobo", description: "", price: 180 }] },
    ],
  });

  it("reads a clean JSON object", () => {
    const res = parseMenuText(good);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.categories[0].items[0].name).toBe("Adobo");
  });

  it("digs the object out of surrounding prose or a code fence", () => {
    const res = parseMenuText("Here you go:\n```json\n" + good + "\n```\nHope that helps!");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.categories[0].items).toHaveLength(1);
  });

  it("fails cleanly on unparseable output instead of throwing", () => {
    expect(parseMenuText("I couldn't read that photo, sorry.").ok).toBe(false);
    expect(parseMenuText("{ not json at all ").ok).toBe(false);
  });

  it("drops categories that came back with no items", () => {
    const res = parseMenuText(
      JSON.stringify({
        categories: [
          { name: "Empty", items: [] },
          { name: "Drinks", items: [{ name: "Iced Tea", description: "", price: 60 }] },
        ],
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.categories).toHaveLength(1);
      expect(res.categories[0].name).toBe("Drinks");
    }
  });

  it("treats a parse with nothing usable as a failure", () => {
    expect(parseMenuText(JSON.stringify({ categories: [] })).ok).toBe(false);
  });

  // An unreadable price must not abort the whole scan — the owner fixes it in
  // the review step, which is the entire point of not writing straight through.
  it("falls back to 0 for a price it couldn't read", () => {
    const res = parseMenuText(
      JSON.stringify({
        categories: [{ name: "Mains", items: [{ name: "Sinigang", price: "???" }] }],
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.categories[0].items[0].price).toBe(0);
  });
});

describe("reviewedMenuSchema", () => {
  it("accepts a corrected draft", () => {
    const parsed = reviewedMenuSchema.safeParse({
      categories: [{ name: "Mains", items: [{ name: "Adobo", price: 180 }] }],
    });
    expect(parsed.success).toBe(true);
  });

  // The browser sends this back after the owner edits it, so it is re-checked
  // server-side — a client edit is no more trusted than the model's output.
  it("rejects a negative price the client sent back", () => {
    const parsed = reviewedMenuSchema.safeParse({
      categories: [{ name: "Mains", items: [{ name: "Adobo", price: -5 }] }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an empty draft", () => {
    expect(reviewedMenuSchema.safeParse({ categories: [] }).success).toBe(false);
  });
});
