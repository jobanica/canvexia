import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { countAllSegments } from "@/server/email/audience";
import { listCampaigns } from "@/server/email/campaigns";
import { getEmailStatus } from "@/server/email/provider";
import { getTemplates } from "@/server/email/followup";
import { getFollowUpStats } from "@/server/email/followup-stats";
import { systemDb } from "@/server/tenancy/scoped-db";
import { ALL_STEPS, timingLabel } from "@/lib/email/tracks";
import { SEGMENTS } from "@/lib/email/segments";
import { manilaDateTime } from "@/lib/time/manila";
import { EmailComposer } from "@/components/super-admin/EmailComposer";
import { EmailSettingsForm } from "@/components/super-admin/EmailSettingsForm";
import {
  EmailFollowUp,
  type FollowUpStepView,
} from "@/components/super-admin/EmailFollowUp";

export const dynamic = "force-dynamic";

const SEGMENT_LABEL = new Map(SEGMENTS.map((s) => [s.key, s.label]));

/**
 * Email marketing to the founder's own leads — the restaurant owners who gave
 * an address on the DIY builder. Deliberately separate from the per-restaurant
 * SMS campaigns, which go to a tenant's diners.
 */
export default async function EmailMarketingPage() {
  await requireSuperAdminPage();

  const [counts, campaigns, status, templates, stats, setting] = await Promise.all([
    countAllSegments(),
    listCampaigns(),
    getEmailStatus(),
    getTemplates(),
    getFollowUpStats(),
    systemDb((tx) =>
      tx.platformSetting.findUnique({
        where: { id: "platform" },
        select: { emailAutomationOn: true },
      }),
    ).catch(() => null),
  ]);

  const steps: FollowUpStepView[] = ALL_STEPS.map((def) => {
    const t = templates.get(def.key);
    const s = stats.steps[def.key];
    return {
      key: def.key,
      track: def.track,
      timing: timingLabel(def.timing),
      goal: def.goal,
      subject: t?.subject ?? def.key,
      body: t?.body ?? "",
      enabled: t?.enabled ?? true,
      sent: s?.sent ?? 0,
      scheduled: s?.scheduled ?? 0,
      skipped: s?.skipped ?? 0,
      failed: s?.failed ?? 0,
      influenced: s?.influenced ?? 0,
      credited: s?.credited ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Email marketing</h1>
        <p className="text-sm text-plum-ink/50">
          Follow up with the owners who built a page at <span className="font-mono">/build</span>.
        </p>
      </div>

      <EmailFollowUp
        enabled={!!setting?.emailAutomationOn}
        steps={steps}
        totals={stats.totals}
        unavailable={stats.unavailable}
      />

      <EmailComposer counts={counts} configured={status.configured} />

      {campaigns.length > 0 && (
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-plum-ink/45">
              <tr>
                <th className="px-4 py-2">Subject</th>
                <th className="px-4 py-2">Audience</th>
                <th className="px-4 py-2">Sent</th>
                <th className="px-4 py-2">Failed</th>
                <th className="px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-plum-ink/5">
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-semibold">{c.subject}</td>
                  <td className="px-4 py-2 text-xs text-plum-ink/60">
                    {SEGMENT_LABEL.get(c.segment as never) ?? c.segment}
                  </td>
                  <td className="px-4 py-2">
                    {c.sent}/{c.recipients}
                  </td>
                  <td className={`px-4 py-2 ${c.failed > 0 ? "font-semibold text-guava" : ""}`}>
                    {c.failed}
                  </td>
                  <td className="px-4 py-2 text-xs text-plum-ink/50">
                    {c.sentAt ? manilaDateTime(c.sentAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EmailSettingsForm initial={status} />
    </div>
  );
}
