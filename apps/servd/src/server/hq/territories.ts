import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { toCsv } from "@/lib/hq/csv";

/**
 * The 143 Philippine cities a partner can license, and who holds each.
 *
 * `systemDb` because /hq crosses partners by design.
 *
 * NO MAP. The brief asks for one "using the coordinates already in the seed" —
 * there are none. `packages/db/prisma/territories.mjs` is `[name, province,
 * region]` and the table has no lat/lng. A map of 143 cities with no
 * coordinates is an empty map, which is worse than the table it would replace,
 * so the screen is a filterable table and geocoding is a follow-up.
 */

/** Fees are whole PESOS here, unlike every money column elsewhere. */
export const TIER_FEE: Record<string, number> = {
  small: 29000,
  mid: 49000,
  large: 79000,
  hq: 0,
};

export const TIERS = ["small", "mid", "large", "hq"] as const;
export const TERRITORY_STATUSES = ["available", "reserved", "taken", "hq"] as const;

export interface TerritoryRow {
  id: string;
  name: string;
  province: string;
  region: string;
  slug: string;
  tier: string;
  licenseFee: number;
  status: string;
  assignable: boolean;
  parentId: string | null;
  parentName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  childCount: number;
  /** Waitlist applicants whose free-text city matches this one. */
  applicants: number;
}

export async function listTerritories(): Promise<TerritoryRow[]> {
  return systemDb(async (tx) => {
    const [rows, partners, waitlist] = await Promise.all([
      tx.territory.findMany({
        orderBy: [{ region: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          province: true,
          region: true,
          slug: true,
          tier: true,
          licenseFee: true,
          status: true,
          assignable: true,
          parentId: true,
          partnerId: true,
        },
      }),
      tx.partner.findMany({ select: { id: true, name: true } }),
      tx.partnerWaitlist.findMany({ select: { city: true } }).catch(() => []),
    ]);

    const partnerName = new Map(partners.map((p) => [p.id, p.name]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const children = new Map<string, number>();
    for (const r of rows) {
      if (r.parentId) children.set(r.parentId, (children.get(r.parentId) ?? 0) + 1);
    }

    // The waitlist stores the city as FREE TEXT — a city not in this table is a
    // real signal about where demand is, which is why it is not a foreign key.
    // Matching by name is therefore best-effort by design, not by neglect.
    const applicants = new Map<string, number>();
    for (const w of waitlist) {
      const k = w.city.trim().toLowerCase();
      if (k) applicants.set(k, (applicants.get(k) ?? 0) + 1);
    }

    return rows.map((r) => ({
      ...r,
      parentName: r.parentId ? (byId.get(r.parentId)?.name ?? null) : null,
      partnerName: r.partnerId ? (partnerName.get(r.partnerId) ?? null) : null,
      childCount: children.get(r.id) ?? 0,
      applicants: applicants.get(r.name.trim().toLowerCase()) ?? 0,
    }));
  });
}

const EXPORT_HEADERS = [
  "slug",
  "name",
  "province",
  "region",
  "tier",
  "licenseFee",
  "status",
  "partner",
] as const;

/**
 * Export every territory as CSV.
 *
 * SLUG FIRST, and it is the import key. Exporting the uuid would make the file
 * unreadable and tempt somebody to edit one; the slug is unique, stable and
 * meaningful, so a round trip through a spreadsheet matches rows correctly even
 * after a name is corrected.
 *
 * `partner` is exported for context and IGNORED on import — assignment is an
 * action with a history row behind it, not a column somebody edits in Excel.
 */
export async function exportTerritoriesCsv(): Promise<string> {
  const rows = await listTerritories();
  return toCsv(
    EXPORT_HEADERS,
    rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      province: r.province,
      region: r.region,
      tier: r.tier,
      licenseFee: r.licenseFee,
      status: r.status,
      partner: r.partnerName ?? "",
    })),
  );
}

export interface ImportPlan {
  create: { slug: string; name: string; province: string; region: string; tier: string; licenseFee: number }[];
  update: { slug: string; changes: Record<string, string | number> }[];
  errors: { line: number; message: string }[];
  /** Territories in the database that the file does not mention. Never deleted. */
  untouched: number;
}

/**
 * Work out what a CSV would do, without doing it.
 *
 * A PLAN, shown before anything is written. An import that silently rewrote 143
 * rows because a column was misspelled is not recoverable from a screen, and
 * this is reference data that decides who owns a city.
 *
 * NOTHING IS EVER DELETED. A row missing from the file means the file is
 * partial — which is the normal case when somebody exports, edits three lines
 * and re-imports — not that the city has ceased to exist.
 */
export function planImport(
  rows: readonly Record<string, string>[],
  existing: readonly { slug: string; name: string; province: string; region: string; tier: string; licenseFee: number }[],
): ImportPlan {
  const bySlug = new Map(existing.map((e) => [e.slug, e]));
  const plan: ImportPlan = { create: [], update: [], errors: [], untouched: 0 };
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const line = i + 2; // +1 for the header, +1 because people count from one
    const slug = (row.slug ?? "").trim().toLowerCase();
    const name = (row.name ?? "").trim();

    if (!slug && !name) return; // a blank line in the middle of a file
    if (!slug) {
      plan.errors.push({ line, message: `"${name}" has no slug. The slug is the import key.` });
      return;
    }
    if (seen.has(slug)) {
      plan.errors.push({ line, message: `${slug} appears twice in this file.` });
      return;
    }
    seen.add(slug);

    const tier = (row.tier ?? "").trim().toLowerCase();
    if (tier && !(TIERS as readonly string[]).includes(tier)) {
      plan.errors.push({ line, message: `${slug}: "${tier}" is not a tier.` });
      return;
    }

    const rawFee = (row.licenseFee ?? "").trim().replace(/[,₱\s]/g, "");
    const fee = rawFee === "" ? null : Number(rawFee);
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
      plan.errors.push({ line, message: `${slug}: "${row.licenseFee}" is not a fee.` });
      return;
    }

    const current = bySlug.get(slug);
    if (!current) {
      if (!name) {
        plan.errors.push({ line, message: `${slug} is new and needs a name.` });
        return;
      }
      plan.create.push({
        slug,
        name,
        province: (row.province ?? "").trim(),
        region: (row.region ?? "").trim(),
        tier: tier || "small",
        // The tier's own fee when the column is blank — the seed's rule, so a
        // file with no fee column does the expected thing rather than zeroing.
        licenseFee: fee ?? TIER_FEE[tier || "small"] ?? 0,
      });
      return;
    }

    const changes: Record<string, string | number> = {};
    if (name && name !== current.name) changes.name = name;
    const province = (row.province ?? "").trim();
    if (province && province !== current.province) changes.province = province;
    const region = (row.region ?? "").trim();
    if (region && region !== current.region) changes.region = region;
    if (tier && tier !== current.tier) changes.tier = tier;
    if (fee !== null && fee !== current.licenseFee) changes.licenseFee = fee;
    if (Object.keys(changes).length > 0) plan.update.push({ slug, changes });
  });

  plan.untouched = existing.filter((e) => !seen.has(e.slug)).length;
  return plan;
}
