import { describe, it, expect } from "vitest";
import {
  searchTerritories, quoteCity, TIER_FEE, type Territory,
} from "@/lib/territories";

const ALL: Territory[] = [
  { name: "Cebu City", province: "Cebu", slug: "cebu-city-cebu", tier: "large", licenseFee: 79000, status: "available" },
  { name: "Caloocan", province: "Metro Manila", slug: "caloocan-metro-manila", tier: "large", licenseFee: 79000, status: "available" },
  { name: "Calamba", province: "Laguna", slug: "calamba-laguna", tier: "large", licenseFee: 79000, status: "available" },
  { name: "Bacoor", province: "Cavite", slug: "bacoor-cavite", tier: "large", licenseFee: 79000, status: "available" },
  { name: "Digos", province: "Davao del Sur", slug: "digos-davao-del-sur", tier: "mid", licenseFee: 49000, status: "available" },
  { name: "Mati", province: "Davao Oriental", slug: "mati-davao-oriental", tier: "small", licenseFee: 29000, status: "available" },
  { name: "Davao City", province: "Davao del Sur", slug: "davao-city-davao-del-sur", tier: "hq", licenseFee: 0, status: "hq" },
  { name: "Parañaque", province: "Metro Manila", slug: "paranaque-metro-manila", tier: "large", licenseFee: 79000, status: "taken" },
];

describe("what a city costs", () => {
  it("answers the brief's four checks", () => {
    expect(quoteCity(ALL, "Cebu City")).toMatchObject({ tier: "large", licenseFee: 79000 });
    expect(quoteCity(ALL, "Digos")).toMatchObject({ tier: "mid", licenseFee: 49000 });
    expect(quoteCity(ALL, "Mati")).toMatchObject({ tier: "small", licenseFee: 29000 });
    expect(quoteCity(ALL, "Davao City")).toMatchObject({ tier: "hq", status: "hq", closed: true });
  });

  it("quotes an unlisted city as small rather than refusing it", () => {
    // Defaulting UP would quote a stranger ₱79,000 for a small town and they
    // would close the tab instead of writing in to correct it.
    const q = quoteCity(ALL, "Tubod");
    expect(q).toMatchObject({ tier: "small", licenseFee: 29000, unlisted: true, closed: false });
    expect(q!.name).toBe("Tubod");
  });

  it("marks a taken city closed", () => {
    expect(quoteCity(ALL, "Parañaque")).toMatchObject({ status: "taken", closed: true });
  });

  it("ignores case and accents", () => {
    expect(quoteCity(ALL, "  paranaque ")).toMatchObject({ unlisted: false, status: "taken" });
    expect(quoteCity(ALL, "CEBU CITY")).toMatchObject({ tier: "large" });
  });

  it("returns nothing for an empty box", () => {
    expect(quoteCity(ALL, "   ")).toBeNull();
  });
});

describe("the city finder", () => {
  it("ranks prefix matches above matches in the middle of a word", () => {
    // Typing "ca" should offer Caloocan and Calamba before Bacoor.
    const names = searchTerritories(ALL, "ca").map((t) => t.name);
    expect(names.indexOf("Caloocan")).toBeLessThan(names.indexOf("Bacoor"));
    expect(names.indexOf("Calamba")).toBeLessThan(names.indexOf("Bacoor"));
  });

  it("finds a city by its province too", () => {
    expect(searchTerritories(ALL, "Davao del Sur").map((t) => t.name)).toContain("Digos");
  });

  it("matches through an accent", () => {
    expect(searchTerritories(ALL, "paran").map((t) => t.name)).toContain("Parañaque");
  });

  it("returns nothing on an empty query, rather than everything", () => {
    expect(searchTerritories(ALL, "")).toEqual([]);
    expect(searchTerritories(ALL, "   ")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(searchTerritories(ALL, "a", 3).length).toBeLessThanOrEqual(3);
  });

  it("still lists Davao City so the finder can say it is HQ", () => {
    // Hiding it would make people type it repeatedly and conclude the finder
    // is broken. Showing it closed answers the question.
    expect(searchTerritories(ALL, "davao").map((t) => t.name)).toContain("Davao City");
  });
});

describe("the fee table", () => {
  it("is the brief's three numbers", () => {
    expect(TIER_FEE).toMatchObject({ small: 29000, mid: 49000, large: 79000 });
  });
});
