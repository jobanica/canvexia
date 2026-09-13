import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Every merchant on the platform, and which partner owns it.
 *
 * The only view in the product that deliberately crosses partners, which is why
 * it runs through systemDb and lives behind the HQ guard. A partner asking "who
 * else is on this platform" gets nothing; HQ has to be able to answer it.
 *
 * The number that matters most here is the unassigned count. A merchant with a
 * null partnerId belongs to nobody, and since Phase 1 that is not a cosmetic
 * gap: partner-scoped queries correctly refuse to return it, so it is invisible
 * to every portal and absent from every statement. It should be zero after the
 * house-partner backfill, and anything above zero is a merchant nobody is being
 * paid for.
 */

export interface MerchantDirectoryRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  partnerId: string | null;
  partnerName: string | null;
  planName: string | null;
  /** Whether a login exists — a demo storefront has none. */
  live: boolean;
  createdAt: Date;
}

export interface PartnerChoice {
  id: string;
  name: string;
  status: string;
  tier: string;
  revenueSharePct: number;
}

export interface MerchantDirectory {
  merchants: MerchantDirectoryRow[];
  /** Approved partners only — the valid targets for a move. */
  partners: PartnerChoice[];
  unassigned: number;
  total: number;
}

export async function getMerchantDirectory(opts?: {
  partnerId?: string | null;
  query?: string | null;
  limit?: number;
}): Promise<MerchantDirectory> {
  const limit = Math.min(opts?.limit ?? 200, 500);
  const query = opts?.query?.trim() || null;

  try {
    return await systemDb(async (tx) => {
      const partners = await tx.partner.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, status: true, tier: true, revenueSharePct: true },
      });
      const nameById = new Map(partners.map((p) => [p.id, p.name]));

      const where: Record<string, unknown> = {};
      if (opts?.partnerId === "__unassigned__") {
        where.partnerId = null;
      } else if (opts?.partnerId) {
        where.partnerId = opts.partnerId;
      }
      if (query) {
        where.OR = [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
        ];
      }

      const rows = await tx.restaurant.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          partnerId: true,
          createdAt: true,
          plan: { select: { name: true } },
          _count: { select: { staff: true } },
        },
      });

      const total = await tx.restaurant.count();
      const unassigned = await tx.restaurant.count({ where: { partnerId: null } });

      return {
        merchants: rows.map((r) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
          status: r.status,
          partnerId: r.partnerId,
          partnerName: r.partnerId ? (nameById.get(r.partnerId) ?? "— unknown partner —") : null,
          planName: r.plan?.name ?? null,
          live: r._count.staff > 0,
          createdAt: r.createdAt,
        })),
        partners: partners.filter((p) => p.status === "approved"),
        unassigned,
        total,
      };
    });
  } catch (e) {
    // Same best-effort posture as the rest of the super-admin queries: the
    // columns ship as hand-run migrations, and a directory that renders empty
    // beats a back office that 500s on a database one migration behind.
    console.error("getMerchantDirectory failed", e);
    return { merchants: [], partners: [], unassigned: 0, total: 0 };
  }
}
