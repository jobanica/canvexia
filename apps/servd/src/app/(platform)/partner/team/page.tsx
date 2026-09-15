import { requirePartnerPageWith } from "@/server/partners/auth";
import { listTeam } from "@/server/partners/team";
import { PortalNav } from "@/components/partner/PortalNav";
import { TeamManager } from "@/components/partner/TeamManager";

export default async function PartnerTeamPage() {
  const partner = await requirePartnerPageWith("team.read");
  const { seats, invites } = await listTeam(partner.id);

  return (
    <>
      <PortalNav partner={partner} />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-heading text-2xl font-bold">Team</h1>
        <p className="mt-1 max-w-readable text-sm text-brand-ink/55">
          Who can sign into your portal, and what each of them can do. A deactivated seat
          keeps its history — that is how the audit log still names who did what.
        </p>
        <TeamManager seats={seats} invites={invites} />
      </div>
    </>
  );
}
