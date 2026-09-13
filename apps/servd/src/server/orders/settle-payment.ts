import "server-only";

import type { Prisma } from "@prisma/client";

/**
 * Ensure an order being CLOSED as paid has a matching payment record.
 *
 * Accounting, the VAT report and the end-of-shift summary all sum PAYMENT rows,
 * while the dashboard "Revenue today" keys on order.paymentStatus. Some flows
 * (merchant tablet "mark delivered / completed", rider "delivered") used to set
 * paymentStatus="paid" WITHOUT recording a payment — so those sales showed on
 * the dashboard but never in accounting. Calling this in those flows records the
 * settlement so every report agrees.
 *
 * No-op if a paid payment already exists (e.g. cashier settle, online gateway).
 * Amount = net actually owed (total − discount − gift-card credit); recorded as
 * cash/manual, matching how staff-settled orders are booked.
 */
export async function ensureSettlementPayment(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const existing = await tx.payment.findFirst({
    where: { orderId, status: "paid" },
    select: { id: true },
  });
  if (existing) return;

  const o = await tx.order.findFirst({
    where: { id: orderId },
    select: { total: true, discountAmount: true, creditApplied: true },
  });
  if (!o) return;

  const net = Math.max(0, o.total - (o.discountAmount ?? 0) - (o.creditApplied ?? 0));
  if (net <= 0) return;

  await tx.payment.create({
    data: { orderId, amount: net, method: "cash", gateway: "manual", status: "paid" },
  });
}
