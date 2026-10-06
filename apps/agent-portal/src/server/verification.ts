import "server-only";
import { staffDb, type Tx } from "@/server/scoped-db";
import { writeAudit } from "@/server/audit";
import { staffActor, type SignedInStaff } from "@/server/auth";
import { loadSettings } from "@/server/settings";
import { queueCallback, flushCallbacksQuietly } from "@/server/callbacks";
import { commissionsForPayment, monthsOverlap, payableFromFor, planReversal } from "@/lib/commission";

/**
 * The verification queue's three decisions. Each is ONE transaction under the
 * caller's own role, so the database enforces what a verifier may do (confirm
 * and reject a submitted payment) and what only an admin may (reverse).
 */
export type Decision = { ok: true } | { ok: false; error: string };

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

async function lockPayment(tx: Tx, paymentId: string) {
  // Row locks first, in a fixed order (payment, then its customer), so two
  // verifiers on the same customer serialise instead of both passing the
  // "already confirmed for that month" check.
  const rows = await tx.$queryRaw<{ referralId: string }[]>`
    select "referralId" from agent_payments where id = ${paymentId} for update`;
  if (rows.length === 0) return null;
  await tx.$queryRaw`select id from agent_referrals where id = ${rows[0].referralId} for update`;
  return tx.agentPayment.findUnique({
    where: { id: paymentId },
    include: { referral: { include: { rule: true, product: { select: { id: true } } } } },
  });
}

export async function confirmPayment(staff: SignedInStaff, paymentId: string, now = new Date()): Promise<Decision> {
  const result = await staffDb(staff.role, async (tx): Promise<Decision> => {
    const payment = await lockPayment(tx, paymentId);
    if (!payment) return { ok: false, error: "Payment not found." };
    if (payment.status !== "submitted") return { ok: false, error: `This payment is already ${payment.status}.` };
    const referral = payment.referral;
    const rule = referral.rule;
    if (!rule) {
      return { ok: false, error: "This customer has no commission rule. An admin must attach one before confirming." };
    }

    const siblings = await tx.agentPayment.findMany({
      where: { referralId: referral.id, status: "confirmed", id: { not: payment.id } },
      select: { type: true, billingMonthStart: true, monthsCovered: true },
    });
    if (payment.type === "activation") {
      if (siblings.some((p) => p.type === "activation")) {
        return { ok: false, error: "This customer's activation is already confirmed." };
      }
      // The product must not take an activation before the contract is signed;
      // the portal refuses to confirm one either, so a product that skipped
      // the check cannot activate an unsigned customer.
      const contracts = await tx.agentContract.count({ where: { referralId: referral.id } });
      if (contracts === 0) return { ok: false, error: "The customer has not signed the subscription agreement yet." };
    } else {
      if (!payment.billingMonthStart) return { ok: false, error: "This monthly payment has no billing month." };
      const start = monthKey(payment.billingMonthStart);
      const clash = siblings.find(
        (p) => p.type === "monthly" && p.billingMonthStart &&
          monthsOverlap(start, payment.monthsCovered, monthKey(p.billingMonthStart), p.monthsCovered),
      );
      if (clash) {
        return { ok: false, error: `A confirmed payment already covers ${monthKey(clash.billingMonthStart!)}.` };
      }
    }

    const settings = await loadSettings(tx);
    let agentRecentlyActive = true;
    if (referral.agentId && settings.residual_requires_active_agent) {
      const since = new Date(now.getTime() - settings.active_agent_window_days * 86_400_000);
      agentRecentlyActive =
        (await tx.agentReferral.count({ where: { agentId: referral.agentId, signedUpAt: { gte: since } } })) > 0;
    }

    const engine = commissionsForPayment({
      rule,
      settings,
      paidMonthsBefore: referral.paidMonths,
      payment: { type: payment.type, monthsCovered: payment.monthsCovered },
      hasAgent: !!referral.agentId,
      agentRecentlyActive,
      confirmedAt: now,
    });

    await tx.agentPayment.update({
      where: { id: payment.id },
      data: { status: "confirmed", reviewedBy: staff.email, reviewedAt: now },
    });
    await tx.agentReferral.update({
      where: { id: referral.id },
      data: { paidMonths: engine.paidMonthsAfter, status: "active" },
    });
    if (engine.rows.length > 0) {
      await tx.agentCommission.createMany({
        data: engine.rows.map((r) => ({
          ...r,
          agentId: referral.agentId!,
          referralId: referral.id,
          paymentId: payment.id,
          ruleId: rule.id,
        })),
      });
    }
    if (engine.releaseHeldActivation) {
      await tx.agentCommission.updateMany({
        where: { referralId: referral.id, kind: "activation", status: "pending_release" },
        data: { status: "approved", payableFrom: payableFromFor(now) },
      });
    }
    await queueCallback(tx, referral.product.id, "payment.confirmed", {
      external_customer_id: referral.externalCustomerId,
      bank_reference: payment.bankReference,
      payment_type: payment.type,
      months_covered: payment.monthsCovered,
      billing_month_start: payment.billingMonthStart ? monthKey(payment.billingMonthStart) : null,
      amount: payment.amount,
    });
    await writeAudit(tx, staffActor(staff), {
      action: "payment.confirm",
      entity: "agent_payment",
      entityId: payment.id,
      before: { status: "submitted", paidMonths: referral.paidMonths },
      after: {
        status: "confirmed",
        paidMonths: engine.paidMonthsAfter,
        commissions: engine.rows.map((r) => ({ kind: r.kind, n: r.paidMonthNumber, amount: r.amount, status: r.status })),
        releasedActivation: engine.releaseHeldActivation,
      },
    });
    return { ok: true };
  });
  if (result.ok) await flushCallbacksQuietly();
  return result;
}

export async function rejectPayment(staff: SignedInStaff, paymentId: string, reason: string): Promise<Decision> {
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "Give the customer a reason." };
  const result = await staffDb(staff.role, async (tx): Promise<Decision> => {
    const payment = await lockPayment(tx, paymentId);
    if (!payment) return { ok: false, error: "Payment not found." };
    if (payment.status !== "submitted") return { ok: false, error: `This payment is already ${payment.status}.` };
    await tx.agentPayment.update({
      where: { id: payment.id },
      data: { status: "rejected", reviewedBy: staff.email, reviewedAt: new Date(), rejectReason: why },
    });
    await queueCallback(tx, payment.referral.product.id, "payment.rejected", {
      external_customer_id: payment.referral.externalCustomerId,
      bank_reference: payment.bankReference,
      reason: why,
    });
    await writeAudit(tx, staffActor(staff), {
      action: "payment.reject",
      entity: "agent_payment",
      entityId: payment.id,
      before: { status: "submitted" },
      after: { status: "rejected", reason: why },
    });
    return { ok: true };
  });
  if (result.ok) await flushCallbacksQuietly();
  return result;
}

/**
 * Admin only (the database refuses a verifier). Writes a matching negative row
 * for every commission the payment earned — see planReversal for what happens
 * to rows already paid out — and takes the paid months back off the customer.
 */
export async function reversePayment(staff: SignedInStaff, paymentId: string, reason: string, now = new Date()): Promise<Decision> {
  if (staff.role !== "admin") return { ok: false, error: "Only an admin can reverse a payment." };
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "A reason is required." };
  const result = await staffDb("admin", async (tx): Promise<Decision> => {
    const payment = await lockPayment(tx, paymentId);
    if (!payment) return { ok: false, error: "Payment not found." };
    if (payment.status !== "confirmed") return { ok: false, error: "Only a confirmed payment can be reversed." };

    const originals = await tx.agentCommission.findMany({
      where: { paymentId: payment.id },
      select: { id: true, amount: true, status: true, kind: true, payoutId: true, agentId: true, referralId: true, ruleId: true, paidMonthNumber: true },
    });
    const plan = planReversal(
      originals.map((c) => ({ ...c, inPayout: c.payoutId !== null })),
      now,
    );

    await tx.agentPayment.update({
      where: { id: payment.id },
      data: { status: "reversed", reversedBy: staff.email, reversedAt: now, reverseReason: why },
    });
    if (plan.markReversed.length) {
      await tx.agentCommission.updateMany({ where: { id: { in: plan.markReversed } }, data: { status: "reversed" } });
    }
    for (const r of plan.reversals) {
      const o = originals.find((c) => c.id === r.reversesId)!;
      await tx.agentCommission.create({
        data: {
          agentId: o.agentId,
          referralId: o.referralId,
          paymentId: payment.id,
          ruleId: o.ruleId,
          kind: "reversal",
          paidMonthNumber: o.paidMonthNumber,
          amount: r.amount,
          status: r.status,
          payableFrom: r.payableFrom,
          reversesId: o.id,
        },
      });
    }
    if (payment.type === "monthly") {
      await tx.agentReferral.update({
        where: { id: payment.referralId },
        data: { paidMonths: Math.max(0, payment.referral.paidMonths - payment.monthsCovered) },
      });
    }
    await queueCallback(tx, payment.referral.product.id, "payment.reversed", {
      external_customer_id: payment.referral.externalCustomerId,
      bank_reference: payment.bankReference,
      reason: why,
    });
    await writeAudit(tx, staffActor(staff), {
      action: "payment.reverse",
      entity: "agent_payment",
      entityId: payment.id,
      before: { status: "confirmed", paidMonths: payment.referral.paidMonths },
      after: { status: "reversed", reason: why, reversals: plan.reversals.map((r) => ({ of: r.reversesId, amount: r.amount, status: r.status })) },
    });
    return { ok: true };
  });
  if (result.ok) await flushCallbacksQuietly();
  return result;
}
