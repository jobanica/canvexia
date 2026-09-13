import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The partner list, for super-admin.
 *
 * It once carried each partner's payable and paid commission, and a list of
 * payout batches waiting to be approved; that went when the commission did.
 * CANVEXIA brings a share back for `operator`-tier partners only, so this list
 * now carries the terms alongside the counts — who they are, whether they are
 * approved, what they keep, and how many merchants they own, which is still the
 * number that says whether a partner is working out.
 */

export interface PartnerOverviewRow {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
  createdAt: Date;
  // --- CANVEXIA operator terms -----------------------------------------------
  // Best-effort like the counts below: these ship as a hand-run migration, and a
  // partner list that renders without them beats a back office that 500s on a
  // database one migration behind.
  territory: string | null;
  slug: string | null;
  revenueSharePct: number;
  collectionMode: string;
  brandMode: string;
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
      // Two queries rather than one with every column: the operator fields ship
      // as a hand-run migration, so naming them in the main select would make a
      // database that is one migration behind fail to list partners at all —
      // exactly the failure mode the rest of this file already guards against.
      const partners = await tx.partner.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, status: true, tier: true, createdAt: true },
      });

      let termsBy = new Map<
        string,
        Pick<
          PartnerOverviewRow,
          "territory" | "slug" | "revenueSharePct" | "collectionMode" | "brandMode"
        >
      >();
      try {
        const terms = await tx.partner.findMany({
          select: {
            id: true,
            territory: true,
            slug: true,
            revenueSharePct: true,
            collectionMode: true,
            brandMode: true,
          },
        });
        termsBy = new Map(terms.map(({ id, ...rest }) => [id, rest]));
      } catch {
        /* operator columns not migrated yet — fall back to the defaults below */
      }

      // How many restaurants each partner has set up, and how many went live.
      // Counted by partnerId — ownership — not demoPartnerId, which records who
      // built the storefront. Since Phase 2 those differ the moment HQ reassigns
      // a merchant, and counting by the builder would credit a partner for
      // accounts they no longer own (and are no longer paid for).
      //
      // Best-effort: partnerId ships in a manual migration, and a partner list
      // with no counts beats no partner list.
      let accountsBy = new Map<string, number>();
      let liveBy = new Map<string, number>();
      try {
        const rows = await tx.restaurant.findMany({
          where: { partnerId: { not: null } },
          select: { partnerId: true, _count: { select: { staff: true } } },
        });
        accountsBy = rows.reduce((m, r) => {
          const k = r.partnerId!;
          return m.set(k, (m.get(k) ?? 0) + 1);
        }, new Map<string, number>());
        liveBy = rows
          .filter((r) => r._count.staff > 0)
          .reduce((m, r) => {
            const k = r.partnerId!;
            return m.set(k, (m.get(k) ?? 0) + 1);
          }, new Map<string, number>());
      } catch {
        /* partnerId not migrated yet */
      }

      return {
        partners: partners.map((p) => ({
          ...p,
          territory: termsBy.get(p.id)?.territory ?? null,
          slug: termsBy.get(p.id)?.slug ?? null,
          revenueSharePct: termsBy.get(p.id)?.revenueSharePct ?? 0,
          collectionMode: termsBy.get(p.id)?.collectionMode ?? "partner_collects",
          brandMode: termsBy.get(p.id)?.brandMode ?? "powered_by",
          accounts: accountsBy.get(p.id) ?? 0,
          live: liveBy.get(p.id) ?? 0,
        })),
      };
    });
  } catch {
    return { partners: [] };
  }
}
