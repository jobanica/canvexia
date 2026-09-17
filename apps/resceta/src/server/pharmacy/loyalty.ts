import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";

/**
 * The loyalty programme's two numbers.
 *
 * OFF BY DEFAULT, and off means an earn rate of zero. A programme nobody
 * configured must not quietly start accruing a liability the owner has not
 * agreed to — so `on` requires both an earn rate AND a redemption value, since
 * points that can be earned and never spent are worse than no points at all.
 */
export interface LoyaltySettings {
  on: boolean;
  pointsPerPeso: number;
  centavosPerPoint: number;
}

export async function loyaltySettings(pharmacyId: string): Promise<LoyaltySettings> {
  const row = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacy.findFirst({
      where: { id: pharmacyId },
      select: { loyaltyPointsPerPeso: true, loyaltyCentavosPerPoint: true },
    }),
  );
  const pointsPerPeso = row?.loyaltyPointsPerPeso ?? 0;
  const centavosPerPoint = row?.loyaltyCentavosPerPoint ?? 0;
  return {
    on: pointsPerPeso > 0 && centavosPerPoint > 0,
    pointsPerPeso,
    centavosPerPoint,
  };
}
