import "server-only";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";

/**
 * What a partner sees when they log in.
 *
 * The program was once an affiliate scheme — a referral link, a commission
 * accruing on somebody else's invoices, a payout waiting to be approved — and
 * then a flat arrangement where a partner set up as many restaurants as they
 * liked, billed them whatever they wanted, and the platform took no cut.
 *
 * CANVEXIA reintroduces a share, but only forward: partners on the `reseller`
 * and `affiliate` tiers keep the zero-cut terms they signed, and only an
 * `operator` carries a percentage. The dashboard therefore cannot assume either
 * story — `Partner.revenueSharePct` is the answer for a given partner, and 0 is
 * a legitimate value rather than a missing one. See docs/canvexia/decisions.md
 * (D2) for why that line exists and where it falls.
 *
 * Which means the dashboard is a work list, not an earnings statement: the
 * previews they've built and the accounts they've set up.
 */

export interface PartnerAccountRow {
  id: string;
  name: string;
  slug: string;
  /**
   * Whether this is still a demo being pitched, or a real account with a login.
   *
   * Read off whether a staff row exists, NOT off restaurant.status: a demo is
   * created `active` as well, because its ordering page has to work while the
   * partner is showing it to a prospect. Conversion is what adds the login, so
   * that's the only honest signal.
   */
  converted: boolean;
  createdAt: string;
}

export interface PartnerDashboard {
  /** Restaurants this partner has set up, newest first. */
  accounts: PartnerAccountRow[];
}

/**
 * Partner portal data.
 *
 * Reads through partnerDb(), not systemDb(). That is the whole point of the
 * change: systemDb sets app.is_super_admin, which switches every tenant policy
 * OFF, so the old version's isolation was one `where` clause in this file. Lose
 * that clause — in a refactor, in a new query added next to it — and a partner
 * is reading every restaurant on the platform. Now the database refuses
 * regardless.
 *
 * The `where` clause is still here, and deliberately. Belt and braces: if
 * prisma/rls.sql has not been run on a database, partnerDb sets a session
 * variable no policy reads, and without this clause the query would return
 * everything. Migration lag is a real state in this codebase, and the failure
 * mode of guessing wrong here is "one partner sees every merchant on the
 * platform". RLS is the guarantee; this line is what holds while a database is
 * catching up.
 *
 * Keyed on partnerId — ownership — not demoPartnerId, which records who built
 * the storefront and does not move when HQ reassigns a merchant.
 */
export async function getPartnerDashboard(partnerId: string): Promise<PartnerDashboard> {
  try {
    const rows = await partnerDb(partnerId, (tx) =>
      tx.restaurant.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          name: true,
          displayName: true,
          slug: true,
          createdAt: true,
          _count: { select: { staff: true } },
        },
      }),
    );
    return {
      accounts: rows.map((r) => ({
        id: r.id,
        name: r.displayName || r.name,
        slug: r.slug,
        converted: r._count.staff > 0,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch {
    // partnerId column not migrated yet — an empty list, not a broken page.
    return { accounts: [] };
  }
}

/**
 * The onboarding video the super-admin sets for partners.
 *
 * Read on its own rather than through the old program-settings bundle, which
 * existed to carry commission rates and bonus tiers and went with them.
 */
export async function getPartnerTrainingUrl(): Promise<string | null> {
  try {
    const row = await systemDb((tx) =>
      tx.programSetting.findUnique({
        where: { id: "program" },
        select: { partnerTrainingUrl: true },
      }),
    );
    return row?.partnerTrainingUrl?.trim() || null;
  } catch {
    return null;
  }
}
