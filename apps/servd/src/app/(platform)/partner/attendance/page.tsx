import { notFound } from "next/navigation";
import { PRODUCTS } from "@servd/core";
import { partnerAllows, requirePartnerPageWith } from "@/server/partners/auth";
import { provisionableProducts } from "@/server/products";
import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaDayKey, todaySession, visitsForDay } from "@/server/partners/attendance";
import { myMerchants } from "@/server/partners/my-day";
import { kioskRequired } from "@/server/partners/kiosk";
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
export default async function PartnerAttendancePage({
  searchParams,
}: {
  // `?kiosk=&code=` arrives when somebody points their phone's own camera app
  // at the kiosk screen rather than using the in-app scanner. Both paths end in
  // the same server check — nothing here is trusted beyond being a string.
  searchParams: Promise<{ kiosk?: string; code?: string }>;
}) {
  const partner = await requirePartnerPageWith("attendance.checkin");
  if (!partner.user.id) notFound(); // a legacy login has no seat to check in

  const q = await searchParams;
  const scanned =
    q.kiosk && q.code ? { kioskId: String(q.kiosk), code: String(q.code) } : null;

  const dayKey = manilaDayKey();
  const [session, visits, merchants, prospects, mustUseKiosk] = await Promise.all([
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
    kioskRequired(partner.id, partner.user.id),
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

  // For a business added on the spot. Same list the pipeline's own add form
  // offers, so a prospect created in the field is indistinguishable from one
  // typed at a desk.
  const products = provisionableProducts().map((id) => ({ id, name: PRODUCTS[id].name }));

  /**
   * `pipeline.write`, not `attendance.checkin`.
   *
   * Sales holds both by default, so this is on for the people it is for.
   * Support holds attendance.checkin and explicitly "has no pipeline at all" —
   * they check in and answer for merchants that already exist, and should not
   * be creating pipeline rows from a phone.
   */
  const canAddNew = partnerAllows(partner, "pipeline.write");

  return (
    <div className="brand-canvexia min-h-screen bg-brand-surface text-brand-ink">
      <FieldApp
        session={session}
        visits={visits}
        subjects={subjects}
        products={products}
        canAddNew={canAddNew}
        name={partner.user.name ?? partner.user.email}
        kioskRequired={mustUseKiosk}
        scanned={scanned}
      />
    </div>
  );
}
