import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { campaignStats } from "@/server/partners/sms-analytics";
import { PortalShell } from "@/components/partner/PortalShell";

export const metadata = { title: "Campaign · CANVEXIA" };
export const dynamic = "force-dynamic";

/**
 * One campaign, and what it did.
 *
 * `delivered` is shown as "not reported" rather than as a number, because the
 * aggregator has never been wired to send delivery receipts. Printing zero
 * would read as "nothing arrived"; printing the sent count would be a claim
 * nobody can support. See docs/canvexia/sms-provider.md.
 */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const partner = await requirePartnerPageWith("sms.send");
  const { id } = await params;

  const campaign = await systemDb((tx) =>
    tx.smsCampaign.findFirst({
      where: { id, partnerId: partner.id },
      select: { id: true, name: true, body: true, status: true, sentAt: true, scheduledAt: true },
    }),
  ).catch(() => null);
  if (!campaign) notFound();

  const stats = await campaignStats(partner.id, campaign.id);

  return (
    <PortalShell
      partner={partner}
      title={campaign.name ?? "Campaign"}
      subtitle={campaign.status}
      actions={
        <Link
          href="/partner/sms"
          className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
        >
          ← SMS
        </Link>
      }
    >
      <div className="space-y-4">
        <p className="whitespace-pre-wrap rounded-tile border border-brand-ink/10 bg-white p-5 text-sm">
          {campaign.body}
        </p>

        {stats && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Sent" value={stats.sent.toLocaleString("en-PH")} />
            <Stat
              label="Delivered"
              value="not reported"
              note="The network doesn't send us receipts yet."
            />
            <Stat label="Failed" value={stats.failed.toLocaleString("en-PH")} note="Refunded" />
            <Stat label="Replies" value={stats.replies.toLocaleString("en-PH")} />
            <Stat label="Opted out after" value={stats.optOuts.toLocaleString("en-PH")} />
            <Stat
              label="Credits"
              value={stats.credits.toLocaleString("en-PH")}
            />
            <Stat
              label="Moved to trial or paid"
              value={stats.conversions.toLocaleString("en-PH")}
              note="Within 14 days"
            />
          </div>
        )}
      </div>
    </PortalShell>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-brand-ink/40">{note}</p>}
    </div>
  );
}
