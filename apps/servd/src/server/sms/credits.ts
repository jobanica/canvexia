import "server-only";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Adjusts a restaurant's SMS credit balance and records a ledger entry, in one
 * transaction. Positive `change` = credits sold by the platform; negative =
 * credits consumed by sends. Throws if a debit would go negative.
 *
 * This is how the platform resells SMS: you hold the provider account, restaurants
 * draw down a metered balance.
 */
export async function adjustCredits(
  restaurantId: string,
  change: number,
  reason: string,
): Promise<number> {
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { smsCreditBalance: true },
    });
    const balanceAfter = restaurant.smsCreditBalance + change;
    if (balanceAfter < 0) throw new Error("Insufficient SMS credits");

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { smsCreditBalance: balanceAfter },
      select: { id: true },
    });
    await tx.smsCreditLedger.create({
      data: { restaurantId, change, reason, balanceAfter },
    });
    return balanceAfter;
  });
}
