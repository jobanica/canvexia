/**
 * Tiers, fees, and finding a city by typing part of its name.
 *
 * Pure. The city list itself comes from the database (`territories`), which is
 * seeded from `packages/db/prisma/territories.mjs` — this module is the rules
 * that apply to whatever list it is handed, so the finder can be tested without
 * one and the seed can be edited without touching code.
 */

export type Tier = "small" | "mid" | "large" | "hq";
export type TerritoryStatus = "available" | "reserved" | "taken" | "hq";

export const TIER_FEE: Record<Tier, number> = {
  small: 29000,
  mid: 49000,
  large: 79000,
  hq: 0,
};

export const TIER_LABEL: Record<Tier, string> = {
  small: "Small city",
  mid: "Mid city",
  large: "Large city",
  hq: "HQ",
};

export interface Territory {
  name: string;
  province: string;
  slug: string;
  tier: Tier;
  licenseFee: number;
  status: TerritoryStatus;
}

/**
 * What a city costs when it is not in the list.
 *
 * Every Philippine city that nobody classified is `small`. Defaulting UP would
 * quote a stranger ₱79,000 for a town of forty thousand people, and they would
 * close the tab rather than write in to correct it.
 */
export const UNLISTED_TIER: Tier = "small";

/** Fold accents and case so "Parañaque" matches "paranaque". */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Cities matching what has been typed, best first.
 *
 * Prefix matches rank above substring ones, so typing "ca" offers Caloocan and
 * Calamba before Bacoor — a finder that surfaces the middle of a word first
 * feels broken even when it is technically matching.
 */
export function searchTerritories(
  all: Territory[],
  query: string,
  limit = 8,
): Territory[] {
  const q = fold(query);
  if (!q) return [];
  const scored: { t: Territory; rank: number }[] = [];
  for (const t of all) {
    const name = fold(t.name);
    if (name.startsWith(q)) scored.push({ t, rank: 0 });
    else if (name.includes(q)) scored.push({ t, rank: 1 });
    else if (fold(t.province).startsWith(q)) scored.push({ t, rank: 2 });
  }
  scored.sort((a, b) => a.rank - b.rank || a.t.name.localeCompare(b.t.name));
  return scored.slice(0, limit).map((s) => s.t);
}

export interface CityQuote {
  name: string;
  tier: Tier;
  licenseFee: number;
  status: TerritoryStatus;
  /** True when the city is not in the seeded list and fell back to small. */
  unlisted: boolean;
  /** True when it cannot be applied for at all. */
  closed: boolean;
}

/**
 * What to show someone who typed a city name.
 *
 * An unlisted city gets a real quote rather than "not found": the waitlist
 * takes free text precisely so HQ learns where demand is, and a blank answer
 * teaches people their city does not count.
 */
export function quoteCity(all: Territory[], typed: string): CityQuote | null {
  const q = fold(typed);
  if (!q) return null;

  const exact = all.find((t) => fold(t.name) === q);
  if (exact) {
    return {
      name: exact.name,
      tier: exact.tier,
      licenseFee: exact.licenseFee,
      status: exact.status,
      unlisted: false,
      closed: exact.status !== "available",
    };
  }

  return {
    name: typed.trim(),
    tier: UNLISTED_TIER,
    licenseFee: TIER_FEE[UNLISTED_TIER],
    status: "available",
    unlisted: true,
    closed: false,
  };
}
