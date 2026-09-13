import { describe, it, expect } from "vitest";
import { computeHours, grossPay } from "@/lib/hr/hours";

describe("computeHours", () => {
  it("returns zero for an open entry", () => {
    expect(computeHours(new Date(), null).hours).toBe(0);
  });
  it("subtracts the break", () => {
    const inT = new Date("2026-06-14T09:00:00Z");
    const outT = new Date("2026-06-14T17:00:00Z"); // 8h
    const h = computeHours(inT, outT, 30); // minus 30m = 7.5h
    expect(h.hours).toBe(7.5);
    expect(h.overtime).toBe(0);
  });
  it("flags overtime beyond 8h", () => {
    const inT = new Date("2026-06-14T08:00:00Z");
    const outT = new Date("2026-06-14T18:30:00Z"); // 10.5h
    const h = computeHours(inT, outT, 0);
    expect(h.hours).toBe(10.5);
    expect(h.regular).toBe(8);
    expect(h.overtime).toBe(2.5);
  });
});

describe("grossPay", () => {
  it("hourly = rate × hours (centavos)", () => {
    expect(grossPay("hourly", 10000, 7.5)).toBe(75000); // ₱100/hr × 7.5
  });
  it("monthly = flat rate regardless of hours", () => {
    expect(grossPay("monthly", 2500000, 999)).toBe(2500000);
  });
});
