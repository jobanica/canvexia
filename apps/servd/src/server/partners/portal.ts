import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * What a partner sees when they log in.
 *
 * The program used to be an affiliate scheme: a referral link, a commission
 * accruing on somebody else's invoices, a payout waiting to be approved. All of
 * that is gone. A partner now gets one thing — they can set up as many
 * restaurants as they like — and what they charge those restaurants is entirely
 * between them and the restaurant. Servd never sees it and never takes a cut,
 * so there is nothing to accrue and nothing to pay out.
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
 * Partner portal data — strictly filtered by partnerId (app-level isolation),
 * exactly as the old dashboard was.
 */
export async function getPartnerDashboard(partnerId: string): Promise<PartnerDashboard> {
  try {
    const rows = await systemDb((tx) =>
      tx.restaurant.findMany({
        where: { demoPartnerId: partnerId },
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
    // demoPartnerId column not migrated yet — an empty list, not a broken page.
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
