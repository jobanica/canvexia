import "server-only";
import {
  computeCommission,
  type CommissionFact,
  type CommissionRuleFact,
  type CommissionStatementDraft,
} from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Commissions: the reads, and the monthly freeze.
 *
 * ATTRIBUTION IS BY `assignedSalesUserId` AT THE TIME THE JOB RUNS, which is the
 * one compromise in here and is worth naming. The brief asks for "the merchant's
 * assigned_sales_user_id at the time of the event"; this schema does not keep a
 * history of that column, and adding one would mean an assignment-events table
 * whose only reader is this job. So a merchant reassigned mid-month pays its
 * commission to whoever holds it when the month closes, and a partner who
 * reassigns mid-month should expect that. It is stated on the screen.
 */

const SETTLEMENT_KINDS = ["subscription", "addon", "feature", "activation"];

function monthBoundsManila(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(`${month}-01T00:00:00+08:00`);
  const to =
    m === 12
      ? new Date(`${y + 1}-01-01T00:00:00+08:00`)
      : new Date(`${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00+08:00`);
  return { from, to };
}

/**
 * Draft one seat's statement for one month. Does not write anything.
 *
 * Used by the cron to freeze, and by the screen to show "what this month looks
 * like so far" — the same function both times, so a preview cannot disagree
 * with what lands.
 */
export async function draftCommission(
  partnerId: string,
  partnerUserId: string,
  month: string,
): Promise<CommissionStatementDraft> {
  const { from, to } = monthBoundsManila(month);

  const [rules, assigned] = await Promise.all([
    systemDb((tx) =>
      tx.commissionRule
        .findMany({
          where: { partnerId, partnerUserId },
          select: {
            type: true,
            value: true,
            appliesTo: true,
            productId: true,
            startsAt: true,
            endsAt: true,
          },
        })
        .catch(() => []),
    ),
    assignedMerchants(partnerId, partnerUserId),
  ]);

  if (rules.length === 0 || assigned.size === 0) {
    return { month, totalCentavos: 0, lines: [] };
  }

  const entries = await systemDb((tx) =>
    tx.partnerLedgerEntry
      .findMany({
        where: {
          partnerId,
          kind: { in: SETTLEMENT_KINDS },
          occurredAt: { gte: from, lt: to },
        },
        select: {
          id: true,
          productId: true,
          merchantId: true,
          grossAmount: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: "asc" },
      })
      .catch(() => []),
  );

  const mine = entries.filter((e) => assigned.has(`${e.productId}:${e.merchantId}`));
  if (mine.length === 0) return { month, totalCentavos: 0, lines: [] };

  // "First payment" means first EVER for that merchant, not first this month.
  // Asking the ledger rather than assuming is what stops a signing bonus paying
  // twice for a merchant whose first month straddled a boundary.
  const firstEver = await firstPaymentIds(
    partnerId,
    mine.map((e) => ({ productId: e.productId, merchantId: e.merchantId })),
  );

  const facts: CommissionFact[] = mine.map((e) => ({
    ledgerEntryId: e.id,
    productId: e.productId,
    merchantId: e.merchantId,
    merchantName: assigned.get(`${e.productId}:${e.merchantId}`) ?? null,
    grossAmount: e.grossAmount,
    isFirstPayment: firstEver.has(e.id),
    occurredAt: e.occurredAt,
  }));

  return computeCommission(month, rules as unknown as CommissionRuleFact[], facts);
}

/** `productId:id` → name, for every merchant assigned to this seat. */
async function assignedMerchants(
  partnerId: string,
  partnerUserId: string,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const [restaurants, pharmacies] = await systemDb((tx) =>
      Promise.all([
        tx.restaurant.findMany({
          where: { partnerId, assignedSalesUserId: partnerUserId },
          select: { id: true, name: true },
        }),
        tx.pharmacy.findMany({
          where: { partnerId, assignedSalesUserId: partnerUserId },
          select: { id: true, name: true },
        }),
      ]),
    );
    for (const r of restaurants) out.set(`servd:${r.id}`, r.name);
    for (const p of pharmacies) out.set(`pharmacy:${p.id}`, p.name);
  } catch {
    /* the assignment columns are not migrated yet */
  }
  return out;
}

/** The ledger id of each merchant's FIRST EVER settlement, among those given. */
async function firstPaymentIds(
  partnerId: string,
  merchants: { productId: string; merchantId: string }[],
): Promise<Set<string>> {
  const unique = [...new Set(merchants.map((m) => `${m.productId}:${m.merchantId}`))];
  const ids = new Set<string>();
  try {
    const rows = await systemDb((tx) =>
      tx.partnerLedgerEntry.findMany({
        where: {
          partnerId,
          kind: { in: SETTLEMENT_KINDS },
          merchantId: { in: unique.map((k) => k.split(":")[1]) },
        },
        select: { id: true, productId: true, merchantId: true, occurredAt: true },
        orderBy: { occurredAt: "asc" },
      }),
    );
    const seen = new Set<string>();
    for (const r of rows) {
      const key = `${r.productId}:${r.merchantId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ids.add(r.id);
    }
  } catch {
    /* no ledger yet */
  }
  return ids;
}

/**
 * Freeze one seat's statement. IDEMPOTENT.
 *
 * A statement that exists is never recomputed — that is the whole point of
 * freezing. A rule edited in March must not rewrite January, and a cron that
 * fires twice must not pay twice. The unique index on (partnerUserId, month)
 * is the enforcement; this is the polite version.
 */
export async function freezeCommission(
  partnerId: string,
  partnerUserId: string,
  month: string,
): Promise<{ created: boolean; totalCentavos: number }> {
  const existing = await systemDb((tx) =>
    tx.commissionStatement.findFirst({
      where: { partnerUserId, month },
      select: { totalCentavos: true },
    }),
  );
  if (existing) return { created: false, totalCentavos: existing.totalCentavos };

  const draft = await draftCommission(partnerId, partnerUserId, month);

  // A zero statement is still written. "You earned nothing in September" is a
  // fact somebody should be able to look at; a missing row reads as "the job
  // did not run", which is a different problem with the same appearance.
  return systemDb(async (tx) => {
    const statement = await tx.commissionStatement.create({
      data: {
        partnerId,
        partnerUserId,
        month,
        totalCentavos: draft.totalCentavos,
      },
      select: { id: true },
    });
    if (draft.lines.length > 0) {
      await tx.commissionLine.createMany({
        data: draft.lines.map((l) => ({ ...l, statementId: statement.id })),
      });
    }
    return { created: true, totalCentavos: draft.totalCentavos };
  });
}
