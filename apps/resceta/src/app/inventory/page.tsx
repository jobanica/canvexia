import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listWriteoffs, writeoffCandidates, writeoffSummary } from "@/server/pharmacy/writeoffs";
import { REASON_LABEL, type WriteoffReason } from "@/lib/pharmacy/writeoff-input";
import { parseRange } from "@/lib/pharmacy/range";
import { RangeFilter } from "@/components/RangeFilter";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate, manilaDateTime, manilaExpiry } from "@/lib/money";
import { WriteoffForm, batchLabel } from "./WriteoffForm";

export const dynamic = "force-dynamic";

/**
 * Stock that left without being sold, and the screen that makes it leave.
 *
 * Before this, the only way stock could go down was a sale. Expired batches sat
 * on the shelf in the system forever — excluded from what is sellable, never
 * actually removed — so the shelf and the screen drifted apart permanently and
 * "what did we lose to expiry this year" had no answer.
 *
 * DONATIONS ARE BROKEN OUT because a pharmacy is asked about them separately:
 * medicine given to a barangay health centre is a different line in the books
 * from medicine that spoiled.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; reason?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const sp = await searchParams;
  const range = parseRange(sp);
  const reason = sp.reason;
  const canWrite = can(staff.role, "manageStock");

  const [batches, rows, summary] = await Promise.all([
    canWrite ? writeoffCandidates(staff.pharmacyId) : Promise.resolve([]),
    listWriteoffs(staff.pharmacyId, {
      reason,
      from: range.start,
      to: range.end,
    }),
    writeoffSummary(staff.pharmacyId, range.start, range.end),
  ]);

  const now = new Date();
  const total = summary.reduce((t, s) => t + s.costCentavos, 0);
  const donated = summary.find((s) => s.reason === "donated");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Stock adjustments</h1>
            <p className="mt-1 text-sm text-slate-500">
              Expired, damaged, donated, lost and recalled — what left the shelf
              without being sold.
            </p>
          </div>
          <RangeFilter range={range} path="/inventory" />
        </div>

        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Written off
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{peso(total)}</p>
            <p className="mt-0.5 text-xs text-slate-500">at cost, in this window</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Donated
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900">
              {peso(donated?.costCentavos ?? 0)}
            </p>
            <p className="mt-0.5 text-xs text-emerald-800">
              {donated?.units ?? 0} units given away
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">By reason</p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              {summary.length === 0 && <li>Nothing in this window.</li>}
              {summary.map((s) => (
                <li key={s.reason} className="flex justify-between">
                  <Link
                    href={`/inventory?from=${range.from}&to=${range.to}&reason=${s.reason}`}
                    className="underline"
                  >
                    {REASON_LABEL[s.reason as WriteoffReason] ?? s.reason}
                  </Link>
                  <span className="tabular-nums">{peso(s.costCentavos)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {canWrite && (
          <div className="mb-8">
            <WriteoffForm
              batches={batches.map((b) => ({
                id: b.id,
                label: batchLabel({
                  productName: b.product.name,
                  lotNumber: b.lotNumber,
                  expiryDate: b.expiryDate,
                  quantity: b.quantity,
                  costCentavos: b.costCentavos,
                  unit: b.product.unit,
                }),
                quantity: b.quantity,
                expired: !!b.expiryDate && b.expiryDate.getTime() < now.getTime(),
              }))}
            />
          </div>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {reason ? `${REASON_LABEL[reason as WriteoffReason] ?? reason} only` : "Everything"}
            </h2>
            {reason && (
              <Link
                href={`/inventory?from=${range.from}&to=${range.to}`}
                className="text-xs text-slate-500 underline"
              >
                Show all reasons
              </Link>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Nothing written off in this window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">Lot</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 text-right font-medium">At cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((w) => (
                    <tr key={w.id}>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {manilaDateTime(w.createdAt)}
                      </td>
                      <td className="px-4 py-2">{w.productName}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">
                        {w.lotNumber ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{w.quantity}</td>
                      <td className="px-4 py-2">
                        {REASON_LABEL[w.reason as WriteoffReason] ?? w.reason}
                        {w.recipient && (
                          <span className="ml-2 text-xs text-emerald-700">→ {w.recipient}</span>
                        )}
                        {w.notes && <p className="text-xs text-slate-500">{w.notes}</p>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {peso(w.totalCostCentavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="mt-6 text-xs text-slate-400">
          Dates shown in Manila time. Expiry dates are the month printed on the
          pack — {manilaExpiry(now)} is this month, {manilaDate(now)} is today.
        </p>
      </main>
    </AppShell>
  );
}
