import { notFound } from "next/navigation";
import { DEFAULT_OPT_OUT_TEXT, minutesToLabel } from "@servd/core";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { PortalShell } from "@/components/partner/PortalShell";
import { SmsSettings } from "@/components/partner/SmsSettings";

export const metadata = { title: "SMS settings · CANVEXIA" };
export const dynamic = "force-dynamic";

export default async function SmsSettingsPage() {
  const partner = await requirePartnerPageWith("sms.send");
  // The screen is admin-only, and so are the actions behind it. Hidden rather
  // than disabled, like everything else in this portal.
  if (partner.user.role !== "admin") notFound();

  const row = await systemDb((tx) =>
    tx.partner.findUnique({
      where: { id: partner.id },
      select: {
        smsSenderName: true,
        smsSenderStatus: true,
        smsOptOutText: true,
        smsWindowStartMin: true,
        smsWindowEndMin: true,
        smsCapCount: true,
        smsCapDays: true,
        smsAutoWelcome: true,
        smsAutoWelcomeText: true,
        smsAutoVisitDays: true,
        smsAutoVisitText: true,
        smsAutoTrialDays: true,
        smsAutoTrialText: true,
      },
    }),
  );
  if (!row) notFound();

  return (
    <PortalShell
      partner={partner}
      title="SMS settings"
      subtitle="How your texts go out, and when they don't."
    >
      <SmsSettings
        settings={{
          senderName: row.smsSenderName ?? "",
          senderStatus: row.smsSenderStatus,
          optOutText: row.smsOptOutText ?? "",
          optOutPlaceholder: DEFAULT_OPT_OUT_TEXT,
          windowStart: minutesToLabel(row.smsWindowStartMin),
          windowEnd: minutesToLabel(row.smsWindowEndMin),
          capCount: row.smsCapCount,
          capDays: row.smsCapDays,
          autoWelcome: row.smsAutoWelcome,
          autoWelcomeText: row.smsAutoWelcomeText ?? "",
          autoVisitDays: row.smsAutoVisitDays,
          autoVisitText: row.smsAutoVisitText ?? "",
          autoTrialDays: row.smsAutoTrialDays,
          autoTrialText: row.smsAutoTrialText ?? "",
        }}
      />
    </PortalShell>
  );
}
