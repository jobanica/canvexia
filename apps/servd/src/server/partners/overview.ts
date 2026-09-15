import "server-only";
import { ladderProgress, parseMilestones, type MilestoneProgress } from "@servd/core";
import { partnerDb, systemDb } from "@/server/tenancy/scoped-db";
import { buildAttention, type AttentionItem } from "@/lib/partners/attention";
import { listPartnerMerchants, isPaying, mrrCentavos, type PartnerMerchant } from "./merchants";

/**
 * Everything the Overview screen shows, in one read.
 *
 * The money here is a LIVE VIEW, not a statement. It multiplies today's plan
 * prices by today's active merchants; a statement is computed from the ledger,
 * where each row carries the share percentage that applied when the payment
 * settled. The two will disagree mid-month and that is correct — the copy on the
 * page says which is which, because a partner who reads this as "what I will be
 * paid" and gets a different number has been misled by us, not by arithmetic.
 */
export interface PartnerOverview {
  merchants: PartnerMerchant[];
  payingCount: number;
  mrrCentavos: number;
  partnerShareCentavos: number;
  hqShareCentavos: number;
  /** "payout" when HQ collects and pays out; "invoice" when the partner collects. */
  settlementDirection: "payout" | "invoice";
  milestones: { steps: MilestoneProgress[]; current: MilestoneProgress | null };
  licenseStartedAt: Date | null;
  exclusivityExpiresAt: Date | null;
  attention: AttentionItem[];
  /** Last 6 months, oldest first. */
  series: { month: string; merchants: number; mrrCentavos: number }[];
  onboarding: { steps: Record<string, boolean>; dismissedAt: string | null };
}

const MONTHS = 6;

/** "2026-06" — sortable, and the key the chart groups on. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Merchants and MRR by month, last six.
 *
 * Built from each merchant's `createdAt` and today's price, which makes it a
 * GROWTH curve and not a revenue history: a merchant who upgraded last week
 * appears at the new price in every past month. Reconstructing the real history
 * needs the ledger, and that is A4's job. The chart is labelled accordingly
 * rather than quietly implying it is audited.
 */
function buildSeries(merchants: readonly PartnerMerchant[], asOf: Date) {
  const out: { month: string; merchants: number; mrrCentavos: number }[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i + 1, 1));
    const upTo = merchants.filter((m) => m.createdAt < end);
    out.push({
      month: monthKey(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i, 1))),
      merchants: upTo.length,
      mrrCentavos: mrrCentavos(upTo),
    });
  }
  return out;
}

export async function getPartnerOverview(
  partnerId: string,
  asOf: Date = new Date(),
): Promise<PartnerOverview> {
  const merchants = await listPartnerMerchants(partnerId);

  // The partner's own row: read through partnerDb so the `partner_self` policy
  // is what scopes it, not a where clause.
  const partner = await partnerDb(partnerId, (tx) =>
    tx.partner.findFirst({
      select: {
        revenueSharePct: true,
        collectionMode: true,
        milestones: true,
        licenseStartedAt: true,
        exclusivityExpiresAt: true,
        onboardingSteps: true,
      },
    }),
  );

  const prospects = await partnerDb(partnerId, (tx) =>
    tx.prospect.findMany({
      where: { stage: { notIn: ["paid", "lost"] }, nextFollowUpAt: { not: null } },
      select: { id: true, businessName: true, nextFollowUpAt: true },
    }),
  ).catch(() => []); // prospects not migrated yet — the rest of the page still works

  const paying = merchants.filter(isPaying);
  const mrr = mrrCentavos(merchants);
  const sharePct = partner?.revenueSharePct ?? 0;
  // Floor, not round: never quote a partner a peso more than they would get.
  const partnerShare = Math.floor((mrr * sharePct) / 100);

  const steps =
    (partner?.onboardingSteps as { steps?: Record<string, boolean>; dismissedAt?: string } | null) ??
    null;

  return {
    merchants,
    payingCount: paying.length,
    mrrCentavos: mrr,
    partnerShareCentavos: partnerShare,
    hqShareCentavos: mrr - partnerShare,
    // partner_collects means the money never passes through HQ, so what is owed
    // flows the other way: HQ invoices the partner for its share.
    settlementDirection: partner?.collectionMode === "hq_collects" ? "payout" : "invoice",
    milestones: ladderProgress(
      parseMilestones(partner?.milestones),
      paying.length,
      partner?.licenseStartedAt ?? null,
      asOf,
    ),
    licenseStartedAt: partner?.licenseStartedAt ?? null,
    exclusivityExpiresAt: partner?.exclusivityExpiresAt ?? null,
    attention: buildAttention(
      merchants.map((m) => ({
        id: m.id,
        productId: m.productId,
        name: m.name,
        subscriptionStatus: m.subscriptionStatus,
        trialEndsAt: m.trialEndsAt,
        lastOrderAt: m.lastOrderAt,
        createdAt: m.createdAt,
      })),
      prospects.map((p: { id: string; businessName: string; nextFollowUpAt: Date | null }) => ({
        id: p.id,
        businessName: p.businessName,
        nextFollowUpAt: p.nextFollowUpAt,
      })),
      asOf,
    ),
    series: buildSeries(merchants, asOf),
    onboarding: { steps: steps?.steps ?? {}, dismissedAt: steps?.dismissedAt ?? null },
  };
}

/**
 * The onboarding checklist's six steps, and which are done.
 *
 * Five are DERIVED rather than ticked — a checklist a partner marks themselves
 * is a checklist that says "done" when nothing happened. Only the two a system
 * cannot observe (training watched, kickoff call booked) are stored flags.
 */
export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  href?: string;
}

export function onboardingChecklist(
  overview: PartnerOverview,
  partner: { slug: string | null; brandConfig: unknown; payoutMethod: string | null },
): OnboardingStep[] {
  const stored = overview.onboarding.steps;
  return [
    { key: "brand", label: "Set your brand", done: !!partner.brandConfig, href: "/partner/brand" },
    { key: "subdomain", label: "Confirm your subdomain", done: !!partner.slug, href: "/partner/brand" },
    { key: "payout", label: "Add payout details", done: !!partner.payoutMethod, href: "/partner/settings" },
    { key: "training", label: "Finish the training", done: !!stored.training },
    {
      key: "first_merchant",
      label: "Open your first merchant account",
      done: overview.merchants.length > 0,
      href: "/partner/merchants",
    },
    { key: "kickoff", label: "Book your HQ kickoff call", done: !!stored.kickoff },
  ];
}

/** The partner row the checklist needs, which the overview does not carry. */
export async function getPartnerProfile(partnerId: string) {
  return systemDb((tx) =>
    tx.partner.findUnique({
      where: { id: partnerId },
      select: { slug: true, brandConfig: true, payoutMethod: true, territory: true },
    }),
  );
}
