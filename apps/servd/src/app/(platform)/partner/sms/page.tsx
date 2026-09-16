import Link from "next/link";
import { STAGES, STAGE_LABELS } from "@/lib/partners/prospect-input";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { listCampaigns, partnerSmsLimits } from "@/server/partners/sms-campaigns";
import { knownTags } from "@/server/partners/sms-audience";
import { getWallet } from "@/server/partners/sms-wallet";
import { partnerSender } from "@/server/partners/sms-send";
import { listTeam } from "@/server/partners/team";
import { PortalShell } from "@/components/partner/PortalShell";
import { Composer } from "@/components/partner/Composer";

export const metadata = { title: "SMS · CANVEXIA" };
export const dynamic = "force-dynamic";

export default async function SmsPage() {
  const partner = await requirePartnerPageWith("sms.send");

  const [campaigns, tags, wallet, sender, team, limits] = await Promise.all([
    listCampaigns(partner.id),
    knownTags(partner.id),
    getWallet(partner.id),
    partnerSender(partner.id),
    listTeam(partner.id),
    partnerSmsLimits(partner.id),
  ]);

  return (
    <PortalShell
      partner={partner}
      title="SMS"
      subtitle="Text the business owners your team has collected — the ones who agreed."
      actions={
        <>
          <Link
            href="/partner/sms/contacts"
            className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
          >
            Contacts →
          </Link>
          <Link
            href="/partner/sms/credits"
            className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
          >
            {wallet.balance.toLocaleString("en-PH")} credits
          </Link>
        </>
      }
    >
      <Composer
        tags={tags}
        stages={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
        team={team.seats
          .filter((s) => s.status === "active")
          .map((s) => ({ id: s.id, name: s.name ?? s.email }))}
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name ?? "Campaign",
          body: c.body,
          status: c.status,
          scheduledAt: c.scheduledAt,
          sentAt: c.sentAt,
          recipientCount: c.recipientCount,
          sentCount: c.sentCount,
          failedCount: c.failedCount,
          creditsSpent: c.creditsSpent,
        }))}
        balance={wallet.balance}
        senderName={sender.senderName}
        window={{ startMin: limits.windowStartMin, endMin: limits.windowEndMin }}
        cap={{ count: limits.capCount, days: limits.capDays }}
      />
    </PortalShell>
  );
}
