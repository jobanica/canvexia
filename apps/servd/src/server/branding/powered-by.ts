import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { hasFeature } from "@/server/billing/feature-gate";
import { servdBranding, NO_SERVD_BRANDING, type ServdBranding } from "@/lib/branding/powered-by";

export type { ServdBranding };

/**
 * Whether this restaurant's customer-facing pages carry Servd's name.
 *
 * Runs on public routes where there's no session — a diner scanning a QR or
 * opening an ordering link — so it reads through systemDb, scoped to the one
 * restaurantId it was handed.
 *
 * Best-effort by construction: if either lookup fails, the answer is the
 * unbranded one. A badge is not worth a storefront failing to render, and
 * erring towards NOT stamping somebody's page is the safe direction to be
 * wrong in.
 */
export async function getServdBranding(restaurantId: string): Promise<ServdBranding> {
  try {
    const [row, ownsWhiteLabel] = await Promise.all([
      systemDb((tx) =>
        tx.restaurant.findFirst({
          where: { id: restaurantId },
          select: { createdAt: true, partnerId: true },
        }),
      ),
      hasFeature(restaurantId, "whiteLabel"),
    ]);

    // The owning partner's contracted brand mode. Read separately and
    // best-effort: it ships as a hand-run migration, and a storefront must not
    // fail to render because a column is one migration behind. Absent reads as
    // "powered_by", which is the pre-CANVEXIA answer.
    let partnerBrandMode: string | null = null;
    if (row?.partnerId) {
      try {
        const partner = await systemDb((tx) =>
          tx.partner.findUnique({
            where: { id: row.partnerId as string },
            select: { brandMode: true },
          }),
        );
        partnerBrandMode = partner?.brandMode ?? null;
      } catch {
        /* brandMode not migrated yet — treat as powered_by */
      }
    }

    return servdBranding({ createdAt: row?.createdAt ?? null, ownsWhiteLabel, partnerBrandMode });
  } catch {
    return NO_SERVD_BRANDING;
  }
}
