import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";
import { ladderProgress, parseMilestones, type MilestoneProgress } from "@servd/core";
import { settlementOf, type SettlementState } from "@/lib/hq/health";

/**
 * One partner, everything HQ needs about them.
 *
 * `systemDb` because /hq crosses partners by design — see the note in
 * server/hq/overview.ts.
 *
 * WHAT IS DELIBERATELY NOT RETURNED: `payoutDetailsEnc` and `taxInfoEnc`. They
 * are encrypted at rest and the brief's rule is that payout details are
 * displayed masked in HQ exactly as they are in the portal. The way to
 * guarantee that is not to select them — a field that never reaches the
 * component cannot be rendered by a component written later. `payoutMethod`
 * (the word "GCash", not a number) is enough to say whether details exist.
 */

export interface PartnerDetail {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
  isHouse: boolean;
  revenueSharePct: number;
  collectionMode: string;
  brandMode: string;
  slug: string | null;
  territory: string | null;
  territoryId: string | null;

  legalName: string | null;
  businessName: string | null;
  tin: string | null;
  address: string | null;
  contactMobile: string | null;

  agreementPath: string | null;
  agreementUploadedAt: Date | null;
  licenseFeePaidCentavos: number | null;
  licenseFeePaidAt: Date | null;
  licenseFeeRef: string | null;

  licenseStartedAt: Date | null;
  exclusivityExpiresAt: Date | null;
  milestones: { steps: MilestoneProgress[]; current: MilestoneProgress | null };
  enabledProducts: string[] | null;

  /** "GCash" / "bank", or null. Never the account number — see the note above. */
  payoutMethod: string | null;
  /** Whether encrypted payout details exist at all. */
  hasPayoutDetails: boolean;

  merchants: { total: number; paying: number; mrrCentavos: number };
  seats: { id: string; email: string; name: string | null; role: string; status: string }[];
  statements: {
    id: string;
    month: string;
    grossCentavos: number;
    partnerCentavos: number;
    hqCentavos: number;
    payoutStatus: string;
    frozenAt: Date;
    paidAt: Date | null;
  }[];
  settlement: SettlementState;
  activity: {
    id: string;
    action: string;
    entityType: string;
    actorType: string | null;
    actorEmail: string | null;
    reason: string | null;
    createdAt: Date;
  }[];
  createdAt: Date;
}

export async function getPartnerDetail(
  id: string,
  asOf: Date = new Date(),
): Promise<PartnerDetail | null> {
  return systemDb(async (tx) => {
    const p = await tx.partner.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        tier: true,
        isHouse: true,
        revenueSharePct: true,
        collectionMode: true,
        brandMode: true,
        slug: true,
        territory: true,
        territoryId: true,
        legalName: true,
        businessName: true,
        tin: true,
        address: true,
        contactMobile: true,
        agreementPath: true,
        agreementUploadedAt: true,
        licenseFeePaidCentavos: true,
        licenseFeePaidAt: true,
        licenseFeeRef: true,
        licenseStartedAt: true,
        exclusivityExpiresAt: true,
        milestones: true,
        enabledProducts: true,
        payoutMethod: true,
        // The ENCRYPTED blob is selected only to answer "is there one", and is
        // reduced to a boolean below before it leaves this function.
        payoutDetailsEnc: true,
        createdAt: true,
      },
    });
    if (!p) return null;

    const [restaurants, pharmacies, seats, statements, activity, program] = await Promise.all([
      tx.restaurant.findMany({
        where: { partnerId: id },
        select: {
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, plan: { select: { priceMonthly: true } } },
          },
        },
      }),
      tx.pharmacy.count({ where: { partnerId: id } }),
      tx.partnerUser
        .findMany({
          where: { partnerId: id },
          orderBy: { invitedAt: "asc" },
          select: { id: true, email: true, name: true, role: true, status: true },
        })
        .catch(() => []),
      tx.partnerStatement
        .findMany({
          where: { partnerId: id },
          orderBy: { month: "desc" },
          take: 12,
          select: {
            id: true,
            month: true,
            grossCentavos: true,
            partnerCentavos: true,
            hqCentavos: true,
            payoutStatus: true,
            frozenAt: true,
            paidAt: true,
          },
        })
        .catch(() => []),
      // The Activity tab. Filters on partnerId, which is exactly why
      // writeHqAudit sets it on every HQ action ABOUT a partner — an action
      // missing from the tab that claims to show every action on this partner
      // is a gap nobody would notice until they needed it.
      tx.auditLog
        .findMany({
          where: { partnerId: id },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            action: true,
            entityType: true,
            actorType: true,
            actorEmail: true,
            reason: true,
            createdAt: true,
          },
        })
        .catch(() => []),
      tx.programSetting
        .findUnique({ where: { id: "program" }, select: { overdueDays: true } })
        .catch(() => null),
    ]);

    const paying = restaurants.filter((r) => {
      const s = r.subscriptions[0];
      return s?.status === "active" && (s.plan?.priceMonthly ?? 0) > 0;
    });
    const mrr = paying.reduce((sum, r) => sum + (r.subscriptions[0]!.plan?.priceMonthly ?? 0), 0);

    const latest = statements[0] ?? null;

    return {
      ...p,
      payoutDetailsEnc: undefined,
      hasPayoutDetails: !!p.payoutDetailsEnc,
      enabledProducts: Array.isArray(p.enabledProducts)
        ? (p.enabledProducts as string[])
        : null,
      milestones: ladderProgress(
        parseMilestones(p.milestones),
        paying.length,
        p.licenseStartedAt,
        asOf,
      ),
      merchants: {
        total: restaurants.length + pharmacies,
        paying: paying.length,
        mrrCentavos: mrr,
      },
      seats,
      statements,
      settlement: settlementOf(
        {
          collectionMode: p.collectionMode,
          latestStatement: latest
            ? {
                month: latest.month,
                payoutStatus: latest.payoutStatus,
                frozenAt: latest.frozenAt,
                partnerCentavos: latest.partnerCentavos,
              }
            : null,
        },
        program?.overdueDays ?? 15,
        asOf,
      ),
      activity,
    } as PartnerDetail;
  });
}

/**
 * Mask payout details for display.
 *
 * The brief: "payout details entered by partners are displayed masked here
 * too". This function exists so there is ONE answer to what masked means, and
 * so the HQ screen cannot quietly show more than the portal does. It never sees
 * an account number — it is told only whether one exists and what kind.
 */
export function maskedPayout(method: string | null, hasDetails: boolean): string {
  if (!method && !hasDetails) return "Not set";
  if (!hasDetails) return `${method} — details not entered`;
  return `${method ?? "Account"} •••• (entered by the partner)`;
}
