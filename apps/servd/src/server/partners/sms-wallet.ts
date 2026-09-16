import "server-only";
import { isLow, lowBalanceThreshold } from "@servd/core";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * The partner's prepaid SMS wallet.
 *
 * EVERY MOVEMENT WRITES A LEDGER ROW, in the same transaction as the balance
 * change. The balance is what a send reads; the ledger is what anybody asking
 * "where did 400 credits go" reads, and the two are written together precisely
 * so that question always has an answer.
 *
 * `sms_credit_ledger` is the same table the merchant side uses — A8.0 gave it a
 * partner axis rather than creating a second ledger, because two ledgers means
 * two places to reconcile the aggregator's invoice against.
 */

export interface WalletView {
  balance: number;
  lastTopUpCredits: number;
  threshold: number;
  low: boolean;
}

export async function getWallet(partnerId: string): Promise<WalletView> {
  try {
    const row = await systemDb((tx) =>
      tx.smsWallet.findUnique({
        where: { partnerId },
        select: { balanceCredits: true, lastTopUpCredits: true },
      }),
    );
    const balance = row?.balanceCredits ?? 0;
    const last = row?.lastTopUpCredits ?? 0;
    return {
      balance,
      lastTopUpCredits: last,
      threshold: lowBalanceThreshold(last),
      low: isLow(balance, last),
    };
  } catch {
    // A wallet that cannot be read reads as empty, which BLOCKS sending. The
    // other way round would send texts nobody has paid for.
    return { balance: 0, lastTopUpCredits: 0, threshold: 50, low: true };
  }
}

export type DebitResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "insufficient"; balance: number; needed: number };

/**
 * Take credits for a send.
 *
 * THE CONDITIONAL UPDATE IS THE LOCK. `updateMany` with `balanceCredits: { gte:
 * n }` in the where clause either matches or does not, atomically — so two
 * campaigns started in the same second cannot both pass a check-then-write and
 * leave the wallet negative. The database CHECK is the second line of defence.
 *
 * Called on PROVIDER ACCEPTANCE, per the brief, not when the message is queued:
 * a message the aggregator refused was never sent and must not be paid for.
 */
export async function debit(
  partnerId: string,
  credits: number,
  reason: string,
): Promise<DebitResult> {
  if (credits <= 0) {
    const w = await getWallet(partnerId);
    return { ok: true, balance: w.balance };
  }

  try {
    return await systemDb(async (tx) => {
      const updated = await tx.smsWallet.updateMany({
        where: { partnerId, balanceCredits: { gte: credits } },
        data: { balanceCredits: { decrement: credits } },
      });
      if (updated.count === 0) {
        const row = await tx.smsWallet.findUnique({
          where: { partnerId },
          select: { balanceCredits: true },
        });
        return {
          ok: false as const,
          reason: "insufficient" as const,
          balance: row?.balanceCredits ?? 0,
          needed: credits,
        };
      }
      const after = await tx.smsWallet.findUnique({
        where: { partnerId },
        select: { balanceCredits: true },
      });
      await tx.smsCreditLedger.create({
        data: {
          partnerId,
          change: -credits,
          reason,
          balanceAfter: after?.balanceCredits ?? 0,
        },
        select: { id: true },
      });
      return { ok: true as const, balance: after?.balanceCredits ?? 0 };
    });
  } catch {
    const w = await getWallet(partnerId);
    return { ok: false, reason: "insufficient", balance: w.balance, needed: credits };
  }
}

/**
 * Give a credit back for a message the network refused.
 *
 * The brief's rule: failed messages refund. A partner should not pay for a text
 * that never arrived, and the refund is a ledger row of its own rather than a
 * silent correction of the debit — "we charged you and then gave it back" is
 * the truth, and it is the version that reconciles against the invoice.
 */
export async function refund(
  partnerId: string,
  credits: number,
  reason: string,
): Promise<void> {
  if (credits <= 0) return;
  try {
    await systemDb(async (tx) => {
      await tx.smsWallet.updateMany({
        where: { partnerId },
        data: { balanceCredits: { increment: credits } },
      });
      const after = await tx.smsWallet.findUnique({
        where: { partnerId },
        select: { balanceCredits: true },
      });
      await tx.smsCreditLedger.create({
        data: { partnerId, change: credits, reason, balanceAfter: after?.balanceCredits ?? 0 },
        select: { id: true },
      });
    });
  } catch {
    /* the send already happened; a lost refund is visible in the ledger gap */
  }
}

/**
 * Credit a paid top-up. THE ONLY PLACE CREDITS ARE CREATED.
 *
 * Idempotent on the top-up row, not on the webhook: gateways deliver the same
 * event more than once, and the second delivery must not double the balance.
 * The `status: "pending"` in the where clause is what makes that true — the
 * first settlement moves it to paid, and the second matches nothing.
 */
export async function creditTopUp(topUpId: string): Promise<boolean> {
  try {
    return await systemDb(async (tx) => {
      const claimed = await tx.smsTopUp.updateMany({
        where: { id: topUpId, status: "pending" },
        data: { status: "paid", paidAt: new Date() },
      });
      if (claimed.count === 0) return false;

      const topUp = await tx.smsTopUp.findUnique({
        where: { id: topUpId },
        select: { partnerId: true, credits: true },
      });
      if (!topUp) return false;

      await tx.smsWallet.upsert({
        where: { partnerId: topUp.partnerId },
        create: {
          partnerId: topUp.partnerId,
          balanceCredits: topUp.credits,
          lastTopUpCredits: topUp.credits,
        },
        update: {
          balanceCredits: { increment: topUp.credits },
          lastTopUpCredits: topUp.credits,
          // Cleared, so the next low-balance warning can fire.
          lowNotifiedAt: null,
        },
      });

      const after = await tx.smsWallet.findUnique({
        where: { partnerId: topUp.partnerId },
        select: { balanceCredits: true },
      });
      await tx.smsCreditLedger.create({
        data: {
          partnerId: topUp.partnerId,
          change: topUp.credits,
          reason: "sms_credits_purchase",
          balanceAfter: after?.balanceCredits ?? topUp.credits,
        },
        select: { id: true },
      });
      return true;
    });
  } catch {
    return false;
  }
}

/** The ledger, newest first. What "where did the credits go" is answered from. */
export async function ledger(
  partnerId: string,
  take = 50,
): Promise<{ id: string; change: number; reason: string; balanceAfter: number; createdAt: Date }[]> {
  try {
    return await systemDb((tx) =>
      tx.smsCreditLedger.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, change: true, reason: true, balanceAfter: true, createdAt: true },
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Whether the low-balance warning still needs sending, and mark it sent.
 *
 * ONCE PER DRAIN, not once per send: a partner on their last hundred credits
 * would otherwise get a warning per message, which is how a warning becomes
 * something people filter. `lowNotifiedAt` is cleared by a top-up.
 */
export async function claimLowBalanceNotice(partnerId: string): Promise<boolean> {
  try {
    return await systemDb(async (tx) => {
      const row = await tx.smsWallet.findUnique({
        where: { partnerId },
        select: { balanceCredits: true, lastTopUpCredits: true, lowNotifiedAt: true },
      });
      if (!row || row.lowNotifiedAt) return false;
      if (!isLow(row.balanceCredits, row.lastTopUpCredits)) return false;
      await tx.smsWallet.update({
        where: { partnerId },
        data: { lowNotifiedAt: new Date() },
        select: { partnerId: true },
      });
      return true;
    });
  } catch {
    return false;
  }
}
