import { monthKeyOf, describeRule } from "@servd/db";
import { requirePartnerPageWith, partnerAllows } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { draftCommission } from "@/server/partners/commissions";
import { recentMonths } from "@/lib/partners/scorecard";
import { PortalShell } from "@/components/partner/PortalShell";
import { CommissionsView } from "@/components/partner/CommissionsView";

export const metadata = { title: "Commissions · CANVEXIA" };

/**
 * Commissions.
 *
 * `commissions.view_own` is the floor — everyone sees their own, which is the
 * point of the feature. `commissions.manage` (admin only) adds everybody
 * else's, the rules editor and mark-as-paid. A seat without manage is filtered
 * in the QUERY, not by hiding rows the server already sent.
 */
export default async function PartnerCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const partner = await requirePartnerPageWith("commissions.view_own");
  const q = await searchParams;

  const current = monthKeyOf(new Date());
  const months = recentMonths(current, 6);
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : current;
  const manages = partnerAllows(partner, "commissions.manage");
  const me = partner.user.id;

  const [statements, rules, seats] = await Promise.all([
    systemDb((tx) =>
      tx.commissionStatement
        .findMany({
          where: {
            partnerId: partner.id,
            month,
            ...(manages ? {} : { partnerUserId: me ?? "none" }),
          },
          select: {
            id: true,
            partnerUserId: true,
            totalCentavos: true,
            paidAt: true,
            paidReference: true,
            lines: {
              select: {
                id: true,
                merchantName: true,
                merchantId: true,
                ruleType: true,
                ruleValue: true,
                basisCentavos: true,
                amountCentavos: true,
              },
            },
          },
        })
        .catch(() => []),
    ),
    manages
      ? systemDb((tx) =>
          tx.commissionRule
            .findMany({
              where: { partnerId: partner.id, endsAt: null },
              select: {
                id: true,
                partnerUserId: true,
                type: true,
                value: true,
                appliesTo: true,
                productId: true,
              },
            })
            .catch(() => []),
        )
      : Promise.resolve([]),
    systemDb((tx) =>
      tx.partnerUser.findMany({
        where: { partnerId: partner.id, status: "active" },
        select: { id: true, name: true, email: true },
        orderBy: { email: "asc" },
      }),
    ),
  ]);

  // The CURRENT month has no frozen statement yet, so it is drafted live. The
  // same function the cron uses, so the preview cannot disagree with what
  // lands on the 1st.
  const preview =
    month === current && me && statements.length === 0
      ? await draftCommission(partner.id, me, month)
      : null;

  return (
    <PortalShell
      partner={partner}
      title="Commissions"
      subtitle={manages ? "What your team has earned." : "What you have earned."}
    >
      <CommissionsView
        month={month}
        months={months}
        current={current}
        statements={statements.map((s) => ({
          ...s,
          name:
            seats.find((u) => u.id === s.partnerUserId)?.name ??
            seats.find((u) => u.id === s.partnerUserId)?.email ??
            "Someone",
        }))}
        preview={preview}
        rules={rules.map((r) => ({
          ...r,
          description: describeRule(r as never),
          name:
            seats.find((u) => u.id === r.partnerUserId)?.name ??
            seats.find((u) => u.id === r.partnerUserId)?.email ??
            "Someone",
        }))}
        seats={seats.map((s) => ({ id: s.id, name: s.name ?? s.email }))}
        canManage={manages}
      />
    </PortalShell>
  );
}
