import { requirePartnerPageWith } from "@/server/partners/auth";
import { listTeam } from "@/server/partners/team";
import { PortalShell } from "@/components/partner/PortalShell";
import { TeamManager } from "@/components/partner/TeamManager";

export default async function PartnerTeamPage() {
  const partner = await requirePartnerPageWith("team.read");
  const { seats, invites } = await listTeam(partner.id);

  return (
    <PortalShell
      partner={partner}
      title="Team"
      subtitle="Who can sign into your portal, and what each of them can do."
    >
        <p className="max-w-readable text-sm text-brand-ink/55">
          A deactivated seat keeps its history — that is how the audit log still names who
          did what.
        </p>
        <TeamManager seats={seats} invites={invites} />
    </PortalShell>
  );
}
