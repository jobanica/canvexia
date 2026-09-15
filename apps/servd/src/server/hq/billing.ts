import "server-only";
import {
  computeStatement,
  monthKeyOf,
  previousMonth,
  recentMonths,
  type MonthKey,
  type Statement,
} from "@servd/db";
import { systemDb } from "@/server/tenancy/scoped-db";
import { settlementOf } from "@/lib/hq/health";

/**
 * Billing, from HQ's side.
 *
 * THE STATEMENT RUN IS NOT THE SOURCE OF THE NUMBERS. `partner_ledger_entries`
 * is append-only and each row carries the share that applied when the payment
 * settled, so a month recomputes to the same totals every time. Freezing
 * records only what computation cannot produce: when the month was closed and
 * the payout status HQ edits afterwards. That is what makes a preview safe —
 * it is the same function, without the write.
 */

export interface RunState {
  /** The month a run would close: the one before the current Manila month. */
  nextMonth: MonthKey;
  lastRun: {
    startedAt: Date;
    finishedAt: Date | null;
    ok: boolean | null;
    detail: unknown;
  } | null;
  /** Whether the cron can authenticate at all. */
  cronConfigured: boolean;
  /** Partners the run would consider. */
  eligible: number;
  /** Of those, how many already have a frozen statement for that month. */
  alreadyFrozen: number;
}

export interface PreviewRow {
  partnerId: string;
  partnerName: string;
  grossCentavos: number;
  partnerCentavos: number;
  hqCentavos: number;
  merchantCount: number;
  lines: number;
  frozen: boolean;
  error: string | null;
}

/** Approved operators are what the freeze job iterates. Resellers take no cut. */
const ELIGIBLE = { status: "approved", tier: "operator" } as const;

export async function getRunState(asOf: Date = new Date()): Promise<RunState> {
  const nextMonth = previousMonth(monthKeyOf(asOf));

  return systemDb(async (tx) => {
    const [lastRun, partners, frozen] = await Promise.all([
      tx.cronRun
        .findFirst({
          where: { job: "freeze-statements" },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true, finishedAt: true, ok: true, detail: true },
        })
        .catch(() => null),
      tx.partner.count({ where: ELIGIBLE }),
      tx.partnerStatement.count({ where: { month: nextMonth } }).catch(() => 0),
    ]);

    return {
      nextMonth,
      lastRun,
      // Read here rather than assumed: this was unset on the project until H6,
      // which is why every scheduled firing since the job shipped returned 401
      // and partner_statements has no rows.
      cronConfigured: !!process.env.CRON_SECRET,
      eligible: partners,
      alreadyFrozen: frozen,
    };
  });
}

/**
 * Compute a month for every eligible partner WITHOUT freezing it.
 *
 * The brief's "Preview this month". It is the same `computeStatement` the
 * freeze calls, so the preview cannot disagree with what a run would produce —
 * which is the only property that makes a preview worth showing.
 */
export async function previewRun(month: MonthKey): Promise<PreviewRow[]> {
  return systemDb(async (tx) => {
    const partners = await tx.partner.findMany({
      where: ELIGIBLE,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    const out: PreviewRow[] = [];
    for (const p of partners) {
      try {
        const s = await computeStatement(tx, p.id, month);
        out.push({
          partnerId: p.id,
          partnerName: p.name,
          grossCentavos: s.grossCentavos,
          partnerCentavos: s.partnerCentavos,
          hqCentavos: s.hqCentavos,
          merchantCount: s.merchantCount,
          lines: s.lines.length,
          frozen: s.frozenAt !== null,
          error: null,
        });
      } catch (e) {
        // One partner failing must not hide the other twenty. The brief asks
        // for errors listed per partner, and this is that list.
        out.push({
          partnerId: p.id,
          partnerName: p.name,
          grossCentavos: 0,
          partnerCentavos: 0,
          hqCentavos: 0,
          merchantCount: 0,
          lines: 0,
          frozen: false,
          error: e instanceof Error ? e.message : "could not compute",
        });
      }
    }
    return out;
  });
}

export interface StatementRow {
  id: string;
  partnerId: string;
  partnerName: string;
  collectionMode: string;
  month: string;
  grossCentavos: number;
  partnerCentavos: number;
  hqCentavos: number;
  merchantCount: number;
  payoutStatus: string;
  frozenAt: Date;
  paidAt: Date | null;
  note: string | null;
  /** Computed, not read — see the note on settlementOf. */
  overdueDays: number | null;
  direction: "payout" | "invoice";
}

export async function listStatements(
  opts: { month?: string; partnerId?: string; status?: string } = {},
  asOf: Date = new Date(),
): Promise<{ rows: StatementRow[]; months: string[]; overdueDays: number }> {
  return systemDb(async (tx) => {
    const [rows, program] = await Promise.all([
      tx.partnerStatement
        .findMany({
          where: {
            ...(opts.month ? { month: opts.month } : {}),
            ...(opts.partnerId ? { partnerId: opts.partnerId } : {}),
          },
          orderBy: [{ month: "desc" }, { frozenAt: "desc" }],
          select: {
            id: true,
            partnerId: true,
            month: true,
            grossCentavos: true,
            partnerCentavos: true,
            hqCentavos: true,
            merchantCount: true,
            payoutStatus: true,
            frozenAt: true,
            paidAt: true,
            note: true,
            partner: { select: { name: true, collectionMode: true } },
          },
        })
        .catch(() => []),
      tx.programSetting
        .findUnique({ where: { id: "program" }, select: { overdueDays: true } })
        .catch(() => null),
    ]);

    const overdueDays = program?.overdueDays ?? 15;

    const mapped: StatementRow[] = rows.map((r) => {
      const state = settlementOf(
        {
          collectionMode: r.partner.collectionMode,
          latestStatement: {
            month: r.month,
            payoutStatus: r.payoutStatus,
            frozenAt: r.frozenAt,
            partnerCentavos: r.partnerCentavos,
          },
        },
        overdueDays,
        asOf,
      );
      return {
        id: r.id,
        partnerId: r.partnerId,
        partnerName: r.partner.name,
        collectionMode: r.partner.collectionMode,
        month: r.month,
        grossCentavos: r.grossCentavos,
        partnerCentavos: r.partnerCentavos,
        hqCentavos: r.hqCentavos,
        merchantCount: r.merchantCount,
        payoutStatus: r.payoutStatus,
        frozenAt: r.frozenAt,
        paidAt: r.paidAt,
        note: r.note,
        overdueDays: state.kind === "overdue" ? state.days : null,
        direction:
          r.partner.collectionMode === "hq_collects" ? "payout" : "invoice",
      };
    });

    const filtered = opts.status
      ? mapped.filter((r) =>
          opts.status === "overdue"
            ? r.overdueDays !== null
            : opts.status === "paid"
              ? r.payoutStatus === "paid"
              : r.payoutStatus === "pending" && r.overdueDays === null,
        )
      : mapped;

    return {
      rows: filtered,
      months: [...new Set(mapped.map((r) => r.month))].sort().reverse(),
      overdueDays,
    };
  });
}

/** One statement, with its per-merchant lines, recomputed from the ledger. */
export async function getStatement(
  id: string,
): Promise<
  (StatementRow & { statement: Statement; partnerSharePct: number }) | null
> {
  return systemDb(async (tx) => {
    const row = await tx.partnerStatement.findUnique({
      where: { id },
      select: {
        id: true,
        partnerId: true,
        month: true,
        grossCentavos: true,
        partnerCentavos: true,
        hqCentavos: true,
        merchantCount: true,
        payoutStatus: true,
        frozenAt: true,
        paidAt: true,
        note: true,
        partner: {
          select: { name: true, collectionMode: true, revenueSharePct: true },
        },
      },
    });
    if (!row) return null;

    const program = await tx.programSetting
      .findUnique({ where: { id: "program" }, select: { overdueDays: true } })
      .catch(() => null);

    // RECOMPUTED, not read off the frozen row. If the two ever disagree that is
    // worth seeing, and the screen shows both — a frozen total that no longer
    // matches the ledger means somebody backdated a row.
    const statement = await computeStatement(tx, row.partnerId, row.month);

    const state = settlementOf(
      {
        collectionMode: row.partner.collectionMode,
        latestStatement: {
          month: row.month,
          payoutStatus: row.payoutStatus,
          frozenAt: row.frozenAt,
          partnerCentavos: row.partnerCentavos,
        },
      },
      program?.overdueDays ?? 15,
      new Date(),
    );

    return {
      id: row.id,
      partnerId: row.partnerId,
      partnerName: row.partner.name,
      collectionMode: row.partner.collectionMode,
      month: row.month,
      grossCentavos: row.grossCentavos,
      partnerCentavos: row.partnerCentavos,
      hqCentavos: row.hqCentavos,
      merchantCount: row.merchantCount,
      payoutStatus: row.payoutStatus,
      frozenAt: row.frozenAt,
      paidAt: row.paidAt,
      note: row.note,
      overdueDays: state.kind === "overdue" ? state.days : null,
      direction:
        row.partner.collectionMode === "hq_collects" ? "payout" : "invoice",
      statement,
      partnerSharePct: row.partner.revenueSharePct,
    };
  });
}

// ----------------------------------------------------------------------------
// The ledger explorer.
// ----------------------------------------------------------------------------

export interface LedgerFilter {
  partnerId?: string;
  merchantId?: string;
  kind?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface LedgerRow {
  id: string;
  partnerId: string;
  partnerName: string;
  productId: string;
  merchantId: string;
  kind: string;
  providerRef: string;
  grossAmount: number;
  partnerAmount: number;
  hqAmount: number;
  sharePct: number;
  occurredAt: Date;
  adjustmentReason: string | null;
  actorEmail: string | null;
}

export const ADJUSTMENT_KINDS = [
  "credit",
  "debit",
  "refund",
  "waiver",
] as const;
export const LEDGER_KINDS = [
  "subscription",
  "addon",
  "feature",
  "activation",
  "referral",
  ...ADJUSTMENT_KINDS,
] as const;

export async function searchLedger(f: LedgerFilter = {}): Promise<LedgerRow[]> {
  const take = Math.min(f.limit ?? 500, 2000);
  return systemDb(async (tx) => {
    // The partner name is looked up separately, because `partnerLedgerEntry`
    // carries `partnerId` as a bare column with NO Prisma relation — the same
    // table holds `merchantId`, which cannot be a foreign key at all since the
    // table it points at depends on `productId` (D29). Adding a relation for
    // one and not the other would suggest the two columns work the same way.
    const [rows, partners] = await Promise.all([
      tx.partnerLedgerEntry
        .findMany({
          where: {
            ...(f.partnerId ? { partnerId: f.partnerId } : {}),
            ...(f.merchantId ? { merchantId: { contains: f.merchantId } } : {}),
            ...(f.kind ? { kind: f.kind } : {}),
            ...(f.from || f.to
              ? {
                  occurredAt: {
                    ...(f.from
                      ? { gte: new Date(`${f.from}T00:00:00+08:00`) }
                      : {}),
                    // Inclusive of the whole end day, Manila. A `lt` on the date
                    // itself silently drops everything that settled on the last
                    // day somebody asked for.
                    ...(f.to ? { lt: new Date(`${f.to}T00:00:00+08:00`) } : {}),
                  },
                }
              : {}),
          },
          orderBy: { occurredAt: "desc" },
          take,
          select: {
            id: true,
            partnerId: true,
            productId: true,
            merchantId: true,
            kind: true,
            providerRef: true,
            grossAmount: true,
            partnerAmount: true,
            hqAmount: true,
            sharePct: true,
            occurredAt: true,
            adjustmentReason: true,
            actorEmail: true,
          },
        })
        .catch(() => []),
      tx.partner.findMany({ select: { id: true, name: true } }),
    ]);

    const nameBy = new Map(partners.map((p) => [p.id, p.name]));

    return rows.map((r) => ({
      id: r.id,
      partnerId: r.partnerId,
      partnerName: nameBy.get(r.partnerId) ?? "(deleted partner)",
      productId: r.productId,
      merchantId: r.merchantId,
      kind: r.kind,
      providerRef: r.providerRef,
      grossAmount: r.grossAmount,
      partnerAmount: r.partnerAmount,
      hqAmount: r.hqAmount,
      sharePct: r.sharePct,
      occurredAt: r.occurredAt,
      adjustmentReason: r.adjustmentReason,
      actorEmail: r.actorEmail,
    }));
  });
}

// ----------------------------------------------------------------------------
// Pass-through costs.
// ----------------------------------------------------------------------------

export interface CostConfig {
  channel: string;
  /** Centavos per 1000 units — fractional per-unit costs are why. */
  unitCostCentavos: number;
  marginPct: number;
  note: string | null;
}

export interface UsageRow {
  partnerId: string;
  partnerName: string;
  month: string;
  channel: string;
  units: number;
  /** Null when the channel's rate has not been entered. */
  costCentavos: number | null;
  chargeCentavos: number | null;
}

export async function getPassthrough(months = 6): Promise<{
  costs: CostConfig[];
  usage: UsageRow[];
  months: string[];
}> {
  const window = recentMonths(new Date(), months);

  return systemDb(async (tx) => {
    const [costs, usage] = await Promise.all([
      tx.passthroughCost
        .findMany({ orderBy: { channel: "asc" } })
        .catch(() => [] as CostConfig[]),
      tx.passthroughUsage
        .findMany({
          where: { month: { in: window } },
          orderBy: [{ month: "desc" }, { channel: "asc" }],
          select: {
            partnerId: true,
            month: true,
            channel: true,
            units: true,
            partner: { select: { name: true } },
          },
        })
        .catch(() => []),
    ]);

    const rateBy = new Map(costs.map((c) => [c.channel, c]));

    return {
      costs,
      months: window,
      usage: usage.map((u) => {
        const rate = rateBy.get(u.channel);
        // NULL, not zero, when nobody has entered a rate. A ₱0 cost read off
        // this screen would be invoiced to a partner as fact.
        const cost =
          rate && rate.unitCostCentavos > 0
            ? Math.round((u.units * rate.unitCostCentavos) / 1000)
            : null;
        return {
          partnerId: u.partnerId,
          partnerName: u.partner.name,
          month: u.month,
          channel: u.channel,
          units: u.units,
          costCentavos: cost,
          chargeCentavos:
            cost === null
              ? null
              : Math.round(cost * (1 + (rate?.marginPct ?? 0) / 100)),
        };
      }),
    };
  });
}
