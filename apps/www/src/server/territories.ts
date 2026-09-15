import "server-only";
import { unstable_cache } from "next/cache";
import type { Territory } from "@/lib/territories";
import { systemDb } from "./scoped-db";

/**
 * The seeded city list, for the finder and the tier cards.
 *
 * Reference data that changes when someone edits a seed file, so it is cached
 * for an hour rather than read on every page view. The list is ~143 rows and
 * the page is server-rendered, which is what lets the finder run entirely in
 * the browser afterwards — no endpoint, no request per keystroke, nothing to
 * rate-limit.
 *
 * Returns [] rather than throwing when the database is unreachable. A landing
 * page that 500s because a reference table is missing is worse than one whose
 * city finder says "type your city and we'll tell you" — and the form, which is
 * the point of the page, does not need this list at all.
 */
export const getTerritories = unstable_cache(
  async (): Promise<Territory[]> => {
    try {
      const rows = await systemDb((tx) =>
        tx.territory.findMany({
          select: { name: true, province: true, slug: true, tier: true, licenseFee: true, status: true },
          orderBy: [{ name: "asc" }],
        }),
      );
      return rows as Territory[];
    } catch {
      return [];
    }
  },
  ["www:territories"],
  { revalidate: 3600, tags: ["territories"] },
);

export interface WaitlistCity {
  city: string;
  applicants: number;
}

/**
 * Which cities people have asked for, and how many have asked.
 *
 * Counts only. No names, no emails — this is a public page, and the table it
 * reads is full of strangers' contact details. Grouped on the free-text city as
 * typed, which is why the count folds case: "tagum" and "Tagum" are one place
 * to everyone except a GROUP BY.
 *
 * Cached ten minutes, per the brief.
 */
export const getWaitlistCities = unstable_cache(
  async (): Promise<WaitlistCity[]> => {
    try {
      return await systemDb(async (tx) => {
        const rows = await tx.$queryRaw<{ city: string; applicants: bigint }[]>`
          select
            -- The spelling most people used, not an arbitrary one: min() over a
            -- case-folded group is stable and beats showing "tAgUm".
            min("city") as city,
            count(*)    as applicants
          from "partner_waitlist"
          group by lower(trim("city"))
          order by count(*) desc, min("city") asc
          limit 24
        `;
        return rows.map((r) => ({ city: r.city, applicants: Number(r.applicants) }));
      });
    } catch {
      return [];
    }
  },
  ["www:waitlist-cities"],
  { revalidate: 600, tags: ["waitlist"] },
);
