import type { Prisma } from "@prisma/client";

/**
 * A partner's monthly statement, computed from the ledger.
 *
 * DERIVED FIRST, FROZEN SECOND, and that order is the point. `PartnerLedgerEntry`
 * is append-only — a refund is another row, never an edit — and each row carries
 * the share percentage that applied when the payment settled. So a past month
 * recomputes to the same numbers every time, and renegotiating a partner's rate
 * cannot rewrite statements already issued. A stored table is a cache of that,
 * not the source of it.
 *
 * `partner_statements` therefore holds only what computation CANNOT produce: the
 * moment the month was frozen, and the payout status HQ edits afterwards.
 *
 * Asia/Manila. Every merchant, partner and peso in this system is in one time
 * zone, and "the 1st" has to mean the 1st there — computing month boundaries in
 * UTC puts eight hours of 31 December into January's statement.
 */
export const MANILA_OFFSET_MINUTES = 8 * 60;

/** "2026-06". Sortable, and the id a month is addressed by. */
export type MonthKey = string;

export function monthKeyOf(instant: Date): MonthKey {
  const manila = new Date(instant.getTime() + MANILA_OFFSET_MINUTES * 60_000);
  return `${manila.getUTCFullYear()}-${String(manila.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The UTC instants bounding a Manila month: [start, nextStart). */
export function monthBounds(month: MonthKey): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const startManila = Date.UTC(y, m - 1, 1, 0, 0, 0);
  const endManila = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0);
  return {
    start: new Date(startManila - MANILA_OFFSET_MINUTES * 60_000),
    end: new Date(endManila - MANILA_OFFSET_MINUTES * 60_000),
  };
}

/**
 * The month before this one.
 *
 * Explicit rather than "now minus a day", which is the arithmetic that put the
 * freeze job an hour and a month out of place: Vercel Cron is UTC-only, Manila
 * is UTC+8, and "yesterday" lands in a different month depending on which side
 * of 16:00 UTC the job fires. Subtracting from the KEY has no time zone in it
 * at all, and rolls January back to the previous December for free.
 */
export function previousMonth(month: MonthKey): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The last N month keys ending with the month `asOf` falls in, oldest first. */
export function recentMonths(asOf: Date, count: number): MonthKey[] {
  const [y, m] = monthKeyOf(asOf).split("-").map(Number);
  const out: MonthKey[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export interface StatementLine {
  productId: string;
  merchantId: string;
  kind: string;
  grossCentavos: number;
  partnerCentavos: number;
  hqCentavos: number;
  /** The rate that applied WHEN IT SETTLED, not today's. */
  sharePct: number;
  occurredAt: Date;
}

export interface Statement {
  month: MonthKey;
  partnerId: string;
  lines: StatementLine[];
  grossCentavos: number;
  partnerCentavos: number;
  hqCentavos: number;
  /** Distinct merchants that settled anything this month. */
  merchantCount: number;
  /** Null until HQ freezes and marks it. */
  frozenAt: Date | null;
  payoutStatus: "pending" | "paid" | "overdue" | null;
  paidAt: Date | null;
}

/**
 * Compute one month from the ledger.
 *
 * Takes a transaction client and never opens one — the caller owns the scope,
 * and for a partner-facing read that scope must be `partnerDb`, so the policy
 * on partner_ledger_entries is what limits the rows rather than the where
 * clause below.
 */
export async function computeStatement(
  tx: Prisma.TransactionClient,
  partnerId: string,
  month: MonthKey,
): Promise<Statement> {
  const { start, end } = monthBounds(month);

  const rows = await tx.partnerLedgerEntry.findMany({
    where: { partnerId, occurredAt: { gte: start, lt: end } },
    orderBy: { occurredAt: "asc" },
    select: {
      productId: true,
      merchantId: true,
      kind: true,
      grossAmount: true,
      partnerAmount: true,
      hqAmount: true,
      sharePct: true,
      occurredAt: true,
    },
  });

  const lines: StatementLine[] = rows.map((r) => ({
    productId: r.productId,
    merchantId: r.merchantId,
    kind: r.kind,
    grossCentavos: r.grossAmount,
    partnerCentavos: r.partnerAmount,
    hqCentavos: r.hqAmount,
    sharePct: r.sharePct,
    occurredAt: r.occurredAt,
  }));

  // Summed from the stored per-row splits, NOT recomputed from a percentage.
  // Re-deriving would apply today's rate to a payment settled under last
  // quarter's, which is precisely what snapshotting sharePct exists to prevent.
  const grossCentavos = lines.reduce((s, l) => s + l.grossCentavos, 0);
  const partnerCentavos = lines.reduce((s, l) => s + l.partnerCentavos, 0);
  const hqCentavos = lines.reduce((s, l) => s + l.hqCentavos, 0);

  const frozen = await tx.partnerStatement
    .findUnique({
      where: { partnerId_month: { partnerId, month } },
      select: { frozenAt: true, payoutStatus: true, paidAt: true },
    })
    .catch(() => null);

  return {
    month,
    partnerId,
    lines,
    grossCentavos,
    partnerCentavos,
    hqCentavos,
    merchantCount: new Set(lines.map((l) => `${l.productId}:${l.merchantId}`)).size,
    frozenAt: frozen?.frozenAt ?? null,
    payoutStatus: (frozen?.payoutStatus ?? null) as Statement["payoutStatus"],
    paidAt: frozen?.paidAt ?? null,
  };
}

/**
 * Freeze a month: record the totals as they stood on the 1st.
 *
 * Idempotent on (partnerId, month) — the cron can run twice, and a second run
 * must not double anything or move a status HQ has since set to paid.
 */
export async function freezeStatement(
  tx: Prisma.TransactionClient,
  partnerId: string,
  month: MonthKey,
): Promise<{ created: boolean }> {
  const existing = await tx.partnerStatement.findUnique({
    where: { partnerId_month: { partnerId, month } },
    select: { id: true },
  });
  if (existing) return { created: false };

  const s = await computeStatement(tx, partnerId, month);
  await tx.partnerStatement.create({
    data: {
      partnerId,
      month,
      grossCentavos: s.grossCentavos,
      partnerCentavos: s.partnerCentavos,
      hqCentavos: s.hqCentavos,
      merchantCount: s.merchantCount,
      frozenAt: new Date(),
      payoutStatus: "pending",
    },
  });
  return { created: true };
}
