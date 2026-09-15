import Link from "next/link";
import { monthKeyOf } from "@servd/db";
import { requirePartnerPageWith, partnerAllows } from "@/server/partners/auth";
import { getScorecard } from "@/server/partners/scorecard";
import { recentMonths } from "@/lib/partners/scorecard";
import { PortalShell } from "@/components/partner/PortalShell";
import { Scorecard } from "@/components/partner/Scorecard";

export const metadata = { title: "Scorecard · CANVEXIA" };

/**
 * Targets and the scorecard.
 *
 * `hr.view_own` is the floor: everybody can see their own row, which is what
 * makes a target something a person can work towards rather than something
 * they are measured by in private. Seeing EVERYONE needs `hr.view_all`, and
 * that is enforced by the query — the filter is applied in `getScorecard`, not
 * by hiding rows the server already sent.
 */
export default async function PartnerScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const partner = await requirePartnerPageWith("hr.view_own");
  const q = await searchParams;

  const current = monthKeyOf(new Date());
  const months = recentMonths(current, 6);
  const month = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : current;

  const seesEveryone = partnerAllows(partner, "hr.view_all");
  const rows = await getScorecard(partner.id, month, {
    // A seat without hr.view_all gets exactly one row: its own. Filtered in the
    // QUERY, so nobody else's numbers are in the payload.
    onlyUserId: seesEveryone ? undefined : (partner.user.id ?? "none"),
  });

  return (
    <PortalShell
      partner={partner}
      title="Scorecard"
      subtitle={seesEveryone ? "How the team is tracking." : "How you are tracking."}
      actions={
        <Link
          href="/partner/team"
          className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
        >
          ← Team
        </Link>
      }
    >
      <Scorecard
        rows={rows}
        month={month}
        months={months}
        canSetTargets={partnerAllows(partner, "hr.set_targets")}
        isSelfOnly={!seesEveryone}
      />
    </PortalShell>
  );
}
