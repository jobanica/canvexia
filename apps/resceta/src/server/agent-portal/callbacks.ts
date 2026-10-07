import "server-only";
import type { Prisma } from "@prisma/client";
import type { PortalCallback } from "@servd/core/agent-kit";
import { recordCallback, setCallbackOutcome } from "@servd/db";

type Tx = Prisma.TransactionClient;

/**
 * Apply one portal callback to a pharmacy, once. The customer id the portal
 * knows is the pharmacy id — Resceta sent it in customer.signed_up.
 *
 * Payment is recorded, not enforced: dispensing is gated on the FDA licence
 * (D36), and a confirmed payment does not change that.
 */
export async function applyPortalCallback(tx: Tx, slug: string, cb: PortalCallback) {
  if (!(await recordCallback(tx, slug, cb))) return "duplicate" as const;
  const pharmacyId = cb.data.external_customer_id;
  const pharmacy = await tx.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true } });
  if (!pharmacy) {
    await setCallbackOutcome(tx, cb.event_id, "unknown_pharmacy");
    return "unknown_pharmacy" as const;
  }
  if (cb.type === "contract.signed") {
    await tx.pharmacy.update({ where: { id: pharmacyId }, data: { contractSignedAt: new Date(cb.data.signed_at) }, select: { id: true } });
    await setCallbackOutcome(tx, cb.event_id, "applied");
    return "applied" as const;
  }
  const payment = await tx.rescetaManualPayment.findFirst({ where: { pharmacyId, bankReference: cb.data.bank_reference } });
  if (!payment) {
    await setCallbackOutcome(tx, cb.event_id, "unknown_payment");
    return "unknown_payment" as const;
  }
  const now = new Date();
  const status = cb.type === "payment.confirmed" ? "confirmed" : cb.type === "payment.rejected" ? "rejected" : "reversed";
  await tx.rescetaManualPayment.update({
    where: { id: payment.id },
    data: { status, reason: cb.type === "payment.confirmed" ? null : cb.data.reason, decidedAt: now },
    select: { id: true },
  });
  const activation = await tx.rescetaManualPayment.findFirst({
    where: { pharmacyId, type: "activation", status: "confirmed" },
    select: { decidedAt: true },
  });
  await tx.pharmacy.update({
    where: { id: pharmacyId },
    data: { activationPaidAt: activation ? (activation.decidedAt ?? now) : null },
    select: { id: true },
  });
  await setCallbackOutcome(tx, cb.event_id, "applied");
  return "applied" as const;
}
