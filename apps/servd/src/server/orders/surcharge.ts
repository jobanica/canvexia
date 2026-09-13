import "server-only";

import { tenantDb } from "@/server/tenancy/scoped-db";
import { parsePrinterConfig } from "@/lib/printing/printer-config";
import { surchargeFor, surchargeLabel } from "@/lib/orders/surcharge";

/** The card fee this restaurant charges, in basis points. 0 = none. */
export async function cardSurchargeBp(restaurantId: string): Promise<number> {
  try {
    const r = await tenantDb(restaurantId, (tx) =>
      tx.restaurant.findFirst({ select: { printerConfig: true } }),
    );
    return parsePrinterConfig(r?.printerConfig).payments.cardSurchargeBp;
  } catch {
    return 0;
  }
}

/**
 * Add the card fee for a tender of `amount` centavos onto an order, and report
 * back what was actually charged.
 *
 * The fee is worked out here and never taken from the client — a number that
 * decides what a customer is charged does not travel through a browser.
 *
 * It returns 0 unless the fee was successfully written to the order, and that
 * ordering matters. The surcharge lives in a column that ships as a hand-run
 * migration, so on a database that hasn't had it yet the write fails. Charging
 * the fee anyway would leave the payment larger than the order it belongs to —
 * every reconciliation between the dashboard, closed tickets and accounting
 * would drift by the fee, which is the exact bug this app has already had once.
 * Better to not charge the fee than to charge money that nothing accounts for.
 */
export async function applyCardSurcharge(
  restaurantId: string,
  orderId: string,
  method: string,
  amount: number,
): Promise<{ fee: number; label: string | null }> {
  const bp = await cardSurchargeBp(restaurantId);
  const fee = surchargeFor(method, amount, bp);
  if (fee <= 0) return { fee: 0, label: null };

  const label = surchargeLabel(bp);
  try {
    await tenantDb(restaurantId, async (tx) => {
      // Accumulated, not replaced: a bill settled by two card tenders carries
      // the fee on each of them.
      const current = await tx.order.findFirst({
        where: { id: orderId },
        select: { surchargeAmount: true },
      });
      const res = await tx.order.updateMany({
        where: { id: orderId },
        data: { surchargeAmount: (current?.surchargeAmount ?? 0) + fee, surchargeLabel: label },
      });
      if (res.count === 0) throw new Error("Order not found");
    });
  } catch {
    // Column missing (see prisma/manual/add-pos-only-and-surcharge.sql) — the
    // sale still goes through, at the price on the menu.
    return { fee: 0, label: null };
  }
  return { fee, label };
}

/**
 * Take a fee back off an order.
 *
 * The fee has to be written before the tender is recorded — a payment must
 * never be larger than the order it settles — but that leaves a window: if the
 * settle then fails, the order is carrying a fee that nobody paid. Retry, and
 * the fee would be charged on top of itself. So a failed settle undoes it.
 */
export async function revertCardSurcharge(
  restaurantId: string,
  orderId: string,
  fee: number,
): Promise<void> {
  if (fee <= 0) return;
  try {
    await tenantDb(restaurantId, async (tx) => {
      const current = await tx.order.findFirst({
        where: { id: orderId },
        select: { surchargeAmount: true },
      });
      const left = Math.max(0, (current?.surchargeAmount ?? 0) - fee);
      await tx.order.updateMany({
        where: { id: orderId },
        data: { surchargeAmount: left, surchargeLabel: left > 0 ? undefined : null },
      });
    });
  } catch {
    /* nothing was written in the first place */
  }
}

/** What's already been added to an order. Null column reads as nothing. */
export async function surchargeOnOrder(restaurantId: string, orderId: string): Promise<number> {
  try {
    const o = await tenantDb(restaurantId, (tx) =>
      tx.order.findFirst({ where: { id: orderId }, select: { surchargeAmount: true } }),
    );
    return o?.surchargeAmount ?? 0;
  } catch {
    return 0;
  }
}

/** Surcharges for a batch of orders, for the cashier board's running totals. */
export async function surchargeMap(
  restaurantId: string,
  orderIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderIds.length === 0) return out;
  try {
    const rows = await tenantDb(restaurantId, (tx) =>
      tx.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, surchargeAmount: true },
      }),
    );
    for (const r of rows) if (r.surchargeAmount) out.set(r.id, r.surchargeAmount);
  } catch {
    /* not migrated yet — no order carries a surcharge */
  }
  return out;
}
