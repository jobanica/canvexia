import Link from "next/link";
import { PARTNER_USER_ROLES } from "@servd/core";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { permissionGrid } from "@/server/partners/permissions";
import { seatCountsByRole } from "@/server/partners/permissions-actions";
import { PortalShell } from "@/components/partner/PortalShell";
import { PermissionGrid } from "@/components/partner/PermissionGrid";

export const metadata = { title: "Permissions · CANVEXIA" };

/**
 * The permission grid. Admin only, and the one screen that can change what
 * every other screen does.
 *
 * `team.permissions`, not `team.manage`: an ops manager runs the team and does
 * not decide what the team is allowed to do. If they could, every denial in
 * their own row — the revenue, the brand, the payout details — would be
 * advisory, because they could grant themselves any of it.
 */
export default async function PartnerPermissionsPage() {
  const partner = await requirePartnerPageWith("team.permissions");

  const [cells, seatCounts] = await Promise.all([
    permissionGrid(partner.id, PARTNER_USER_ROLES),
    seatCountsByRole(partner.id),
  ]);

  return (
    <PortalShell
      partner={partner}
      title="Permissions"
      subtitle="What each role can do in your portal."
      actions={
        <Link
          href="/partner/team"
          className="rounded-full border border-brand-ink/15 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-ink/65 hover:bg-brand-surface"
        >
          ← Team
        </Link>
      }
    >
      <PermissionGrid cells={cells} seatCounts={seatCounts} />
    </PortalShell>
  );
}
