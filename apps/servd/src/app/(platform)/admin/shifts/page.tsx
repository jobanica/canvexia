import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { listShiftHistory } from "@/server/orders/shift-history";
import { formatPeso } from "@/lib/money";
import { manilaShortDateTime, manilaTime } from "@/lib/time/manila";
import { methodLabel } from "@/lib/orders/shift-breakdown";
import { SHIFT_RETENTION_HOURS } from "@/lib/orders/shift-retention";
import { orderTypeLabelWithEmoji } from "@/lib/orders/order-type";

/**
 * Every shift that's been worked, and what each one took.
 *
 * There was no such record. A Z-report existed only while the shift was open,
 * so a figure that went missing — or a shift that ended before anyone printed
 * it — left nothing to check against but the dashboard, which answers a
 * different question and is not the cashier's drawer.
 *
 * Totals are recomputed from each shift's own payments every time this loads,
 * not read from something stamped at closing time. A stored total can't be
 * re-derived once it's wrong, and this page exists because one was.
 */
export default async function ShiftsPage() {
  const { restaurantId } = await requireAdminPage();
  const shifts = await listShiftHistory(restaurantId);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Shift history</h1>
        <p className="text-sm text-plum-ink/50">
          Every transaction on each turn at the till — counter and online, by how the food went
          out — and what should have been in the drawer at the end of it.
        </p>
        <p className="mt-1 text-xs text-plum-ink/40">
          Kept for {SHIFT_RETENTION_HOURS} hours, then cleared. Your orders, payments and
          accounting are never deleted — only this shift log.
        </p>
      </div>

      {shifts.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center text-sm text-plum-ink/45">
          No shifts recorded yet. One opens by itself the first time a cashier settles an order.
        </p>
      ) : (
        <ul className="space-y-3">
          {shifts.map((s) => (
            <li key={s.id} className="min-w-0 rounded-tile border border-plum-ink/10 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-plum-ink/10 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-heading font-bold text-plum-ink">
                    {s.cashier}
                    {s.open && (
                      <span className="rounded-full bg-mango/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-ink">
                        On now
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-plum-ink/50">
                    {manilaShortDateTime(s.openedAt)}
                    {" → "}
                    {s.closedAt ? manilaTime(s.closedAt) : "still open"}
                    {/* A shift nobody signed out of is worth flagging: the
                        closing figures are whatever it had when it lapsed. */}
                    {s.closedReason?.startsWith("auto_") && (
                      <span className="text-guava"> · not signed out</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-xl font-extrabold tabular-nums text-plum-ink">
                    {formatPeso(s.breakdown.total)}
                  </p>
                  <p className="text-[11px] text-plum-ink/45">
                    {s.breakdown.count} transaction{s.breakdown.count === 1 ? "" : "s"}
                  </p>
                  {/* Online money is a real sale that was never in anyone's
                      till. Naming the split here stops it being read as a
                      shortfall when the drawer is counted. */}
                  {s.breakdown.onlineTotal > 0 && (
                    <p className="text-[11px] text-plum-ink/45">
                      {formatPeso(s.breakdown.counterTotal)} counter ·{" "}
                      {formatPeso(s.breakdown.onlineTotal)} online
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
                    By payment method
                  </p>
                  {s.breakdown.byMethod.length === 0 ? (
                    <p className="text-sm text-plum-ink/45">Nothing taken.</p>
                  ) : (
                    <ul className="space-y-0.5 text-sm">
                      {s.breakdown.byMethod.map((m) => (
                        <li key={m.key} className="flex justify-between gap-2">
                          <span className="truncate text-plum-ink/70">
                            {m.label} ({m.count})
                          </span>
                          <span className="tabular-nums font-medium">{formatPeso(m.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
                    Cash drawer
                  </p>
                  <ul className="space-y-0.5 text-sm">
                    <li className="flex justify-between gap-2">
                      <span className="text-plum-ink/70">Cash collected</span>
                      <span className="tabular-nums">{formatPeso(s.cashCollected)}</span>
                    </li>
                    {s.cashOutTotal > 0 && (
                      <li className="flex justify-between gap-2">
                        <span className="text-plum-ink/70">Cash taken out</span>
                        <span className="tabular-nums">−{formatPeso(s.cashOutTotal)}</span>
                      </li>
                    )}
                    <li className="flex justify-between gap-2 border-t border-plum-ink/10 pt-0.5 font-bold">
                      <span>Expected in drawer</span>
                      <span className="tabular-nums">{formatPeso(s.expectedCash)}</span>
                    </li>
                  </ul>
                  {s.breakdown.onlineTotal > 0 && (
                    <p className="mt-1 text-[11px] text-plum-ink/45">
                      Online payments aren&apos;t counted here — nobody put them in the till.
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-plum-ink/40">
                    By order type
                  </p>
                  {s.breakdown.byOrderType.length === 0 ? (
                    <p className="text-sm text-plum-ink/45">Nothing taken.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {s.breakdown.byOrderType.map((t) => (
                        <li
                          key={t.key}
                          className="rounded-full bg-plum-ink/5 px-2.5 py-1 text-xs text-plum-ink/70"
                        >
                          {orderTypeLabelWithEmoji(t.key as never)}{" "}
                          <span className="font-semibold text-plum-ink">
                            {formatPeso(t.amount)}
                          </span>{" "}
                          <span className="text-plum-ink/40">×{t.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Every transaction, so a shift total can be checked against the
                  tickets that made it rather than taken on faith. */}
              {s.transactions.length > 0 && (
                <details className="group border-t border-plum-ink/10">
                  <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-semibold text-plum-ink/60">
                    Show all {s.transactions.length} transactions
                    <span className="ml-1 inline-block transition group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                  <div className="overflow-x-auto border-t border-plum-ink/5 px-4 pb-4">
                    <table className="w-full text-left text-xs">
                      <thead className="text-plum-ink/45">
                        <tr>
                          <th className="py-1.5">Ticket</th>
                          <th>Time</th>
                          <th>Type</th>
                          <th>Method</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.transactions.map((t, i) => (
                          <tr key={`${t.orderId}-${i}`} className="border-t border-plum-ink/5">
                            <td className="py-1.5 font-medium text-plum-ink">{t.label}</td>
                            <td className="whitespace-nowrap text-plum-ink/55">{t.at}</td>
                            <td className="whitespace-nowrap text-plum-ink/70">
                              {orderTypeLabelWithEmoji(t.orderType)}
                            </td>
                            <td className="whitespace-nowrap text-plum-ink/70">
                              {methodLabel(t.method)}
                              {/* Only when the method name doesn't already say
                                  so — "Card (online) · online" is just noise. */}
                              {!t.counter && !methodLabel(t.method).includes("online") && (
                                <span className="text-plum-ink/35"> · online</span>
                              )}
                            </td>
                            <td className="text-right font-semibold tabular-nums">
                              {formatPeso(t.amount)}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-plum-ink/15 font-bold">
                          <td className="py-2" colSpan={4}>Total</td>
                          <td className="text-right tabular-nums">
                            {formatPeso(s.breakdown.total)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
