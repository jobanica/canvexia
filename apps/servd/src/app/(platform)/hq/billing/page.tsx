import Link from "next/link";
import { hqCan } from "@servd/core";
import { requireHqPage } from "@/server/hq/auth";
import {
  LEDGER_KINDS,
  getPassthrough,
  getRunState,
  listStatements,
  previewRun,
  searchLedger,
} from "@/server/hq/billing";
import { systemDb } from "@/server/tenancy/scoped-db";
import { HqShell } from "@/components/hq/HqShell";
import { peso } from "@/components/canvexia/Cards";
import {
  MarkPaid,
  NewAdjustment,
  PassthroughForm,
  RunStatements,
} from "@/components/hq/BillingForms";

const TABS = ["run", "statements", "ledger", "adjustments", "costs"] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string): v is Tab => (TABS as readonly string[]).includes(v);

function date(d: Date | null) {
  return d ? d.toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—";
}

export default async function HqBillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireHqPage("billing.run");
  const sp = await searchParams;
  const tab: Tab = sp.tab && isTab(sp.tab) ? sp.tab : "run";
  const canAdjust = hqCan(user.role, "billing.adjust");

  const run = await getRunState();
  const partners = await systemDb((tx) =>
    tx.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  );

  const preview = tab === "run" ? await previewRun(sp.month || run.nextMonth) : [];
  const statements =
    tab === "statements"
      ? await listStatements({ month: sp.month, partnerId: sp.partner, status: sp.status })
      : null;
  const ledger =
    tab === "ledger"
      ? await searchLedger({
          partnerId: sp.partner,
          merchantId: sp.merchant,
          kind: sp.kind,
          from: sp.from,
          to: sp.to,
        })
      : [];
  const passthrough = tab === "costs" ? await getPassthrough() : null;

  const previewTotals = preview.reduce(
    (a, r) => ({
      gross: a.gross + r.grossCentavos,
      partner: a.partner + r.partnerCentavos,
      hq: a.hq + r.hqCentavos,
    }),
    { gross: 0, partner: 0, hq: 0 },
  );

  return (
    <HqShell user={user} title="Billing" subtitle="Statements, the ledger, and what things cost.">
      <nav className="flex flex-wrap gap-1.5 border-b border-brand-ink/10 pb-3">
        {TABS.filter((t) => t !== "adjustments" || canAdjust).map((t) => (
          <Link
            key={t}
            href={`/hq/billing?tab=${t}`}
            className={`rounded-full px-3.5 py-1.5 text-sm capitalize ${
              t === tab ? "bg-brand-ink font-semibold text-white" : "text-brand-ink/60 hover:bg-brand-ink/[0.04]"
            }`}
          >
            {t}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "run" && (
          <>
            <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
              <h2 className="font-heading text-lg font-bold">The monthly run</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-brand-ink/45">Next close</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{run.nextMonth}</dd>
                  <dd className="text-xs text-brand-ink/45">Scheduled 09:00 Manila on the 1st</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-brand-ink/45">Last run</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {run.lastRun
                      ? `${date(run.lastRun.startedAt)} · ${run.lastRun.ok ? "ok" : "had failures"}`
                      : "Never"}
                  </dd>
                  {!run.lastRun && (
                    // Read from cron_runs, not inferred from the newest
                    // statement's frozenAt: a run that fired and produced
                    // nothing looks identical to one that never fired.
                    <dd className="text-xs text-brand-ink/45">
                      No run has ever been recorded.
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-brand-ink/45">Scheduled job</dt>
                  <dd className={`mt-0.5 text-sm font-semibold ${run.cronConfigured ? "" : "text-guava"}`}>
                    {run.cronConfigured ? "Authenticated" : "CRON_SECRET not set"}
                  </dd>
                  {!run.cronConfigured && (
                    <dd className="text-xs text-guava">
                      Every scheduled firing returns 401 until it is.
                    </dd>
                  )}
                </div>
              </dl>

              <div className="mt-4 border-t border-brand-ink/10 pt-4">
                <RunStatements
                  month={run.nextMonth}
                  eligible={run.eligible}
                  alreadyFrozen={run.alreadyFrozen}
                />
                <p className="mt-2 text-xs text-brand-ink/45">
                  Idempotent: closing a month twice cannot double anything or move a status you
                  have already set to paid.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-ink/10 px-5 py-4">
                <h2 className="font-heading text-lg font-bold">
                  Preview {sp.month || run.nextMonth}
                </h2>
                <span className="text-xs text-brand-ink/45">
                  Computed, not frozen. The same function a run calls.
                </span>
              </div>
              {preview.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                  No approved operators to bill.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Partner</th>
                      <th className="px-3 py-3 text-right font-semibold">Lines</th>
                      <th className="px-3 py-3 text-right font-semibold">Merchants</th>
                      <th className="px-3 py-3 text-right font-semibold">Gross</th>
                      <th className="px-3 py-3 text-right font-semibold">Partner</th>
                      <th className="px-5 py-3 text-right font-semibold">HQ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-ink/[0.06]">
                    {preview.map((r) => (
                      <tr key={r.partnerId}>
                        <td className="px-5 py-3">
                          <Link href={`/hq/partners/${r.partnerId}`} className="font-semibold">
                            {r.partnerName}
                          </Link>
                          {r.frozen && (
                            <span className="ml-2 rounded-full bg-brand-ink/5 px-2 py-0.5 text-[0.6rem] font-semibold uppercase text-brand-ink/50">
                              closed
                            </span>
                          )}
                          {r.error && <span className="block text-xs text-guava">{r.error}</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.lines}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.merchantCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{peso(r.grossCentavos)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{peso(r.partnerCentavos)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{peso(r.hqCentavos)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-brand-ink/10 font-semibold">
                    <tr>
                      <td className="px-5 py-3" colSpan={3}>
                        Total
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(previewTotals.gross)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{peso(previewTotals.partner)}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{peso(previewTotals.hq)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}

        {tab === "statements" && statements && (
          <>
            <form className="flex flex-wrap items-end gap-2 rounded-tile border border-brand-ink/10 bg-white p-4">
              <input type="hidden" name="tab" value="statements" />
              <label className="text-xs font-semibold text-brand-ink/70">
                Month
                <select name="month" defaultValue={sp.month ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
                  <option value="">Any</option>
                  {statements.months.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-brand-ink/70">
                Partner
                <select name="partner" defaultValue={sp.partner ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
                  <option value="">Any</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-brand-ink/70">
                Status
                <select name="status" defaultValue={sp.status ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
                  <option value="">Any</option>
                  <option value="pending">Pending</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <button className="min-h-[38px] rounded-full bg-brand-ink px-4 text-sm font-semibold text-white">Filter</button>
            </form>

            <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
              {statements.rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                  No statements. Close a month from the Run tab.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Month</th>
                        <th className="px-3 py-3 font-semibold">Partner</th>
                        <th className="px-3 py-3 text-right font-semibold">Gross</th>
                        <th className="px-3 py-3 text-right font-semibold">Partner</th>
                        <th className="px-3 py-3 text-right font-semibold">HQ</th>
                        <th className="px-3 py-3 font-semibold">State</th>
                        <th className="px-5 py-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-ink/[0.06]">
                      {statements.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="px-5 py-3 tabular-nums">
                            <Link href={`/hq/billing/${r.id}`} className="font-semibold">{r.month}</Link>
                          </td>
                          <td className="px-3 py-3">{r.partnerName}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{peso(r.grossCentavos)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{peso(r.partnerCentavos)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{peso(r.hqCentavos)}</td>
                          <td className="px-3 py-3 text-xs">
                            {r.payoutStatus === "paid" ? (
                              <span className="text-brand-ink/50">
                                {r.direction === "payout" ? "Sent" : "Paid"} {date(r.paidAt)}
                                {r.note && <span className="block text-brand-ink/35">{r.note}</span>}
                              </span>
                            ) : r.overdueDays !== null ? (
                              <span className="font-semibold text-guava">
                                {r.direction === "payout" ? "Payout" : "Invoice"} {r.overdueDays}d overdue
                              </span>
                            ) : (
                              <span className="text-brand-ink/60">
                                {r.direction === "payout" ? "Payout due" : "Invoice due"}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <MarkPaid id={r.id} direction={r.direction} paid={r.payoutStatus === "paid"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
                Overdue is computed from the freeze date and the {statements.overdueDays}-day
                threshold, not read from a column nothing sets.
              </p>
            </div>
          </>
        )}

        {tab === "ledger" && (
          <>
            <form className="flex flex-wrap items-end gap-2 rounded-tile border border-brand-ink/10 bg-white p-4">
              <input type="hidden" name="tab" value="ledger" />
              <label className="text-xs font-semibold text-brand-ink/70">
                Partner
                <select name="partner" defaultValue={sp.partner ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
                  <option value="">Any</option>
                  {partners.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </label>
              <label className="text-xs font-semibold text-brand-ink/70">
                Kind
                <select name="kind" defaultValue={sp.kind ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
                  <option value="">Any</option>
                  {LEDGER_KINDS.map((k) => (<option key={k} value={k}>{k}</option>))}
                </select>
              </label>
              <label className="text-xs font-semibold text-brand-ink/70">
                Merchant
                <input name="merchant" defaultValue={sp.merchant ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-brand-ink/70">
                From
                <input type="date" name="from" defaultValue={sp.from ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-brand-ink/70">
                To
                <input type="date" name="to" defaultValue={sp.to ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm" />
              </label>
              <button className="min-h-[38px] rounded-full bg-brand-ink px-4 text-sm font-semibold text-white">Search</button>
              <a
                href={`/hq/billing/ledger/export?${new URLSearchParams(
                  Object.entries(sp).filter(([k, v]) => v && k !== "tab") as [string, string][],
                ).toString()}`}
                className="min-h-[38px] rounded-full border border-brand-ink/15 px-4 text-sm font-semibold leading-[38px]"
              >
                Export CSV
              </a>
            </form>

            <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
              {ledger.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                  No ledger entries. Nothing has settled yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                      <tr>
                        <th className="px-5 py-3 font-semibold">When</th>
                        <th className="px-3 py-3 font-semibold">Partner</th>
                        <th className="px-3 py-3 font-semibold">Merchant</th>
                        <th className="px-3 py-3 font-semibold">Kind</th>
                        <th className="px-3 py-3 text-right font-semibold">Gross</th>
                        <th className="px-3 py-3 text-right font-semibold">Partner</th>
                        <th className="px-5 py-3 text-right font-semibold">HQ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-ink/[0.06]">
                      {ledger.map((r) => (
                        <tr key={r.id}>
                          <td className="px-5 py-3 tabular-nums text-xs">{date(r.occurredAt)}</td>
                          <td className="px-3 py-3">{r.partnerName}</td>
                          <td className="px-3 py-3 font-mono text-xs">{r.productId}:{r.merchantId}</td>
                          <td className="px-3 py-3">
                            {r.kind}
                            {r.adjustmentReason && (
                              <span className="block text-xs text-brand-ink/45">
                                {r.adjustmentReason} — {r.actorEmail}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{peso(r.grossAmount)}</td>
                          <td className="px-3 py-3 text-right tabular-nums">{peso(r.partnerAmount)}</td>
                          <td className="px-5 py-3 text-right tabular-nums">{peso(r.hqAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "adjustments" && canAdjust && <NewAdjustment partners={partners} />}

        {tab === "costs" && passthrough && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {passthrough.costs.map((c) => (
                <PassthroughForm key={c.channel} {...c} />
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
              <h2 className="border-b border-brand-ink/10 px-5 py-4 font-heading text-lg font-bold">
                Usage, last {passthrough.months.length} months
              </h2>
              {passthrough.usage.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
                  Nothing recorded. Usage is written by whatever sends — no SMS or email has gone
                  out through this platform yet.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Month</th>
                      <th className="px-3 py-3 font-semibold">Partner</th>
                      <th className="px-3 py-3 font-semibold">Channel</th>
                      <th className="px-3 py-3 text-right font-semibold">Units</th>
                      <th className="px-3 py-3 text-right font-semibold">Cost</th>
                      <th className="px-5 py-3 text-right font-semibold">Charged</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-ink/[0.06]">
                    {passthrough.usage.map((u, i) => (
                      <tr key={`${u.partnerId}-${u.month}-${u.channel}-${i}`}>
                        <td className="px-5 py-3 tabular-nums">{u.month}</td>
                        <td className="px-3 py-3">{u.partnerName}</td>
                        <td className="px-3 py-3 uppercase">{u.channel}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{u.units.toLocaleString("en-PH")}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {u.costCentavos === null ? <span className="text-brand-ink/30">rate unset</span> : peso(u.costCentavos)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {u.chargeCentavos === null ? <span className="text-brand-ink/30">—</span> : peso(u.chargeCentavos)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
                Both rates start at zero because nobody has told this codebase what the providers
                charge. A plausible default would be read off this screen as fact and invoiced.
              </p>
            </div>
          </>
        )}
      </div>
    </HqShell>
  );
}
