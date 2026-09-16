import { notFound } from "next/navigation";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { listKiosks } from "@/server/partners/kiosk";
import { KioskDisplay } from "@/components/partner/KioskDisplay";

export const metadata = { title: "Clock-in kiosk · CANVEXIA" };
export const dynamic = "force-dynamic";

/**
 * The screen a tablet sits on all day.
 *
 * NO PortalShell, no nav, no links out. Everything on this page is either the
 * code or the lock — a sidebar on an unattended tablet in a shop is a way into
 * the operator's merchant book for whoever walks past.
 *
 * WHAT "KIOSK MODE" CAN HONESTLY BE. The brief asks for a screen that requires
 * re-auth to exit fullscreen. No browser lets a page trap fullscreen or refuse
 * to be closed — that is deliberate on the web, and any claim otherwise here
 * would be a lie in the UI. What this does instead: the display covers the
 * screen, and leaving fullscreen puts a lock over it that needs the portal
 * password to clear. Someone can still close the tab. They cannot use the
 * session behind it.
 */
export default async function KioskPage({ params }: { params: Promise<{ id: string }> }) {
  const partner = await requirePartnerPageWith("attendance.view_all");
  const { id } = await params;

  // Existence is checked here so a wrong id is a 404 rather than a screen that
  // silently shows nothing all day.
  const kiosk = (await listKiosks(partner.id)).find((k) => k.id === id);
  if (!kiosk) notFound();

  return (
    <div className="brand-canvexia min-h-screen bg-brand-ink text-white">
      <KioskDisplay kioskId={kiosk.id} label={kiosk.label} partnerName={partner.name} />
    </div>
  );
}
