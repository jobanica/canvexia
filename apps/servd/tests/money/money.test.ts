import { describe, it, expect } from "vitest";
import {
  pesosToCentavos,
  centavosToPesos,
  formatPeso,
  formatDelta,
} from "@/lib/money";

describe("money", () => {
  it("converts pesos to integer centavos without float drift", () => {
    expect(pesosToCentavos("250")).toBe(25000);
    expect(pesosToCentavos("19.99")).toBe(1999);
    expect(pesosToCentavos(0.1)).toBe(10);
  });

  it("round-trips centavos <-> pesos", () => {
    expect(centavosToPesos(25000)).toBe(250);
  });

  it("rejects invalid amounts", () => {
    expect(() => pesosToCentavos("abc")).toThrow();
  });

  it("formats pesos and deltas for display", () => {
    expect(formatPeso(25000)).toBe("₱250.00");
    expect(formatPeso(-1999)).toBe("-₱19.99");
    expect(formatDelta(3000)).toBe("+₱30.00");
    expect(formatDelta(-1000)).toBe("-₱10.00");
    expect(formatDelta(0)).toBe("");
  });
});
