import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The partner list, for super-admin.
 *
 * It used to carry each partner's payable and paid commission, and a list of
 * payout batches waiting to be approved. There is no commission now — a partner
 * sets restaurants up and bills them directly — so what's left is who they are,
 * whether they're approved, and how many restaurants they've actually set up,
 * which is the only number that says whether a partner is working out.
 */

export interface PartnerOverviewRow {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
  createdAt: Date;
  /** Restaurants this partner has set up. */
  accounts: number;
  /**
   * How many of those became real accounts rather than staying a demo.
   *
   * Counted by whether a login exists. A demo is created `active` too — its
   * ordering page has to work while it's being pitched — so restaurant status
   * would report every demo as live.
   */
  live: number;
}

export async function getPartnersOverview(): Promise<{ partners: PartnerOverviewRow[] }> {
  try {
    return await systemDb(async (tx) => {
      const partners = await tx.partner.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, status: true, tier: true, createdAt: true },
      });

      // How many restaurants each partner has set up, and how many went live.
      // Best-effort: demoPartnerId ships in a manual migration, and a partner
      // list with no counts beats no partner list.
      let accountsBy = new Map<string, number>();
      let liveBy = new Map<string, number>();
      try {
        const rows = await tx.restaurant.findMany({
          where: { demoPartnerId: { not: null } },
          select: { demoPartnerId: true, _count: { select: { staff: true } } },
        });
        accountsBy = rows.reduce((m, r) => {
          const k = r.demoPartnerId!;
          return m.set(k, (m.get(k) ?? 0) + 1);
        }, new Map<string, number>());
        liveBy = rows
          .filter((r) => r._count.staff > 0)
          .reduce((m, r) => {
            const k = r.demoPartnerId!;
            return m.set(k, (m.get(k) ?? 0) + 1);
          }, new Map<string, number>());
      } catch {
        /* demoPartnerId not migrated yet */
      }

      return {
        partners: partners.map((p) => ({
          ...p,
          accounts: accountsBy.get(p.id) ?? 0,
          live: liveBy.get(p.id) ?? 0,
        })),
      };
    });
  } catch {
    return { partners: [] };
  }
}
