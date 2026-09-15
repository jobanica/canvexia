import { notFound } from "next/navigation";
import { requirePartnerPageWith } from "@/server/partners/auth";
import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaDayKey, todaySession, visitsForDay } from "@/server/partners/attendance";
import { myMerchants } from "@/server/partners/my-day";
import { FieldApp } from "@/components/partner/FieldApp";

export const metadata = { title: "Field — CANVEXIA" };

/**
 * The field screen.
 *
 * Deliberately NOT inside PortalShell. This is the installed app: a sidebar,
 * a top bar and a bottom nav on a 390px screen leave about half of it for the
 * three controls somebody is actually here to tap, and the shell's chrome is
 * for a person browsing rather than working.
 */
export default async function PartnerAttendancePage() {
  const partner = await requirePartnerPageWith("attendance.checkin");
  if (!partner.user.id) notFound(); // a legacy login has no seat to check in

  const dayKey = manilaDayKey();
  const [session, visits, merchants, prospects] = await Promise.all([
    todaySession(partner.id, partner.user.id, dayKey),
    visitsForDay(partner.id, dayKey, { partnerUserId: partner.user.id }),
    myMerchants(partner.id, partner.user.id),
    systemDb((tx) =>
      tx.prospect
        .findMany({
          where: {
            partnerId: partner.id,
            assignedToId: partner.user.id,
            stage: { notIn: ["lost"] },
          },
          select: { id: true, businessName: true },
          orderBy: { businessName: "asc" },
          take: 200,
        })
        .catch(() => [] as { id: string; businessName: string }[]),
    ),
  ]);

  // Prospects first: the list is used standing in front of somebody, and the
  // common case is a prospect rather than a merchant already signed.
  const subjects = [
    ...prospects.map((p) => ({
      id: p.id,
      name: p.businessName,
      type: "prospect" as const,
      productId: "",
    })),
    ...merchants.map((m) => ({
      id: m.id,
      name: m.name,
      type: "merchant" as const,
      productId: m.productId,
    })),
  ];

  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      <FieldApp
        session={session}
        visits={visits}
        subjects={subjects}
        name={partner.user.name ?? partner.user.email}
      />
    </div>
  );
}
