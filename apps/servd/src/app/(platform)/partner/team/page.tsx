import Link from "next/link";
import { requirePartnerPageWith, partnerAllows } from "@/server/partners/auth";
import { listTeam } from "@/server/partners/team";
import { getEmailStatus } from "@/server/email/provider";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { PortalShell } from "@/components/partner/PortalShell";
import { TeamManager } from "@/components/partner/TeamManager";

export default async function PartnerTeamPage() {
  // `team.manage` — the A7 permission — rather than the old `team.read`
  // capability. An ops_manager holds it; that is the point of the role.
  const partner = await requirePartnerPageWith("team.manage");
  const [{ seats, invites }, email, user] = await Promise.all([
    listTeam(partner.id),
    // Whether invitations can be emailed at all. A partner admin cannot change
    // this — it is one platform provider — so the banner tells them what it
    // means for them, and only HQ gets pointed at the screen that fixes it.
    getEmailStatus(),
    getCurrentUser(),
  ]);

  return (
    <PortalShell
      partner={partner}
      title="Team"
      subtitle="Who can sign into your portal, and what each of them can do."
      actions={
        // Hidden, not disabled, for an ops manager: they run the team and do
        // not decide what the team is allowed to do.
        <>
          {partnerAllows(partner, "hr.view_own") && (
            <Link
              href="/partner/team/scorecard"
              className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
            >
              Scorecard →
            </Link>
          )}
          {partnerAllows(partner, "team.permissions") && (
            <Link
              href="/partner/team/permissions"
              className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
            >
              Permissions →
            </Link>
          )}
        </>
      }
    >
        <p className="max-w-readable text-sm text-brand-ink/55">
          A deactivated seat keeps its history — that is how the audit log still names who
          did what.
        </p>
        <TeamManager
          seats={seats}
          invites={invites}
          emailConfigured={email.configured}
          canConfigureEmail={user?.kind === "super"}
        />
    </PortalShell>
  );
}
