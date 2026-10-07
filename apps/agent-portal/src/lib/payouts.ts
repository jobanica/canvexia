/**
 * Payouts, pure. Agents are paid once a month for commission that became
 * payable before the payout month began.
 */

/** "2026-11" → the instant 1 Nov 2026 00:00 Manila begins. */
export function periodStart(period: string): Date {
  return new Date(`${period}-01T00:00:00+08:00`);
}

/** The Manila month of an instant, "YYYY-MM". */
export function periodOf(d: Date): string {
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 7);
}

/**
 * The next payout date, Manila: this month's payout day if it is today or
 * still ahead, otherwise next month's.
 */
export function nextPayoutDate(payoutDay: number, now: Date): Date {
  const day = String(payoutDay).padStart(2, "0");
  const period = periodOf(now);
  const thisMonth = new Date(`${period}-${day}T00:00:00+08:00`);
  if (now.getTime() < thisMonth.getTime() + 86_400_000) return thisMonth;
  const [y, m] = period.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return new Date(`${next}-${day}T00:00:00+08:00`);
}

export interface PayableRow {
  id: string;
  agentId: string;
  amount: number;
}

export interface PlannedPayout {
  agentId: string;
  total: number;
  commissionIds: string[];
}

/**
 * Group what is payable by agent and decide who is paid this period.
 *
 * An agent whose net is below the minimum — or zero, or negative after a
 * reversal — gets no payout; their rows stay unattached and are picked up
 * again next period. That is what "negative balances carry forward" means:
 * nothing is written for them, the ledger simply still owes or is owed.
 */
export function planPayouts(rows: PayableRow[], minimum: number): { payouts: PlannedPayout[]; carried: { agentId: string; total: number }[] } {
  const byAgent = new Map<string, PlannedPayout>();
  for (const r of rows) {
    const p = byAgent.get(r.agentId) ?? { agentId: r.agentId, total: 0, commissionIds: [] };
    p.total += r.amount;
    p.commissionIds.push(r.id);
    byAgent.set(r.agentId, p);
  }
  const payouts: PlannedPayout[] = [];
  const carried: { agentId: string; total: number }[] = [];
  for (const p of byAgent.values()) {
    if (p.total > 0 && p.total >= minimum) payouts.push(p);
    else carried.push({ agentId: p.agentId, total: p.total });
  }
  return { payouts, carried };
}

/** A payout statement as CSV, for the agent to download. */
export function statementCsv(
  payout: { period: string; total: number; referenceNumber: string | null; method: string },
  rows: { createdAt: string; customer: string; product: string; kind: string; paidMonthNumber: number | null; amount: number }[],
): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const money = (c: number) => (c / 100).toFixed(2);
  const lines = [
    `Payout period,${esc(payout.period)}`,
    `Paid to,${esc(payout.method)}`,
    `Reference,${esc(payout.referenceNumber ?? "")}`,
    `Total (PHP),${money(payout.total)}`,
    "",
    "Date,Customer,Product,Type,Paid month,Amount (PHP)",
    ...rows.map((r) =>
      [r.createdAt, esc(r.customer), esc(r.product), r.kind, r.paidMonthNumber ?? "", money(r.amount)].join(","),
    ),
  ];
  return lines.join("\n") + "\n";
}
