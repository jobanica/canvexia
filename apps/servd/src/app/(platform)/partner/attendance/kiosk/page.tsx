import Link from "next/link";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { listKiosks } from "@/server/partners/kiosk";
import { PortalShell } from "@/components/partner/PortalShell";
import { KioskManager } from "@/components/partner/KioskManager";

export const metadata = { title: "Clock-in kiosks · CANVEXIA" };
export const dynamic = "force-dynamic";

/**
 * Where a manager sets up the screens people clock in at.
 *
 * `attendance.view_all`: the permission that shows the whole team's attendance
 * is the one that decides where it can be recorded. A salesperson may use a
 * kiosk and may not create one.
 */
export default async function KioskListPage() {
  const partner = await requirePartnerPageWith("attendance.view_all");
  const kiosks = await listKiosks(partner.id);

  return (
    <PortalShell
      partner={partner}
      title="Clock-in kiosks"
      subtitle="A screen on the counter shows a code that changes every minute."
      actions={
        <Link
          href="/partner/attendance/manager"
          className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
        >
          ← Attendance
        </Link>
      }
    >
      <KioskManager kiosks={kiosks} />
    </PortalShell>
  );
}
