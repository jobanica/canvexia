import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { AppShell } from "@/components/AppShell";
import { currentShift, listShifts, takeXReading } from "@/server/pharmacy/shifts";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDateTime } from "@/lib/money";
import { OpenShiftForm, CloseShiftForm } from "./ShiftPanel";

export const dynamic = "force-dynamic";

/**
 * The till: open it, read it mid-shift, close it.
 *
 * Before this, a pharmacy could ring up sales all day with no record of who was
 * on the register, what cash it started with, or whether the drawer was over or
 * short — and no Z-reading, which a registered POS is required to produce.
 */
export default async function ShiftPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const open = await currentShift(staff.pharmacyId);
  // The same print setting the receipt obeys — one switch for the whole till.
  const printing = await pharmacyDb(staff.pharmacyId, (tx) =>
    tx.pharmacy.findUnique({
      where: { id: staff.pharmacyId },
      select: { autoPrintReceipt: true, receiptPaperMm: true },
    }),
  );
  const [shifts, x] = await Promise.all([
    listShifts(staff.pharmacyId),
    open
      ? takeXReading({
          pharmacyId: staff.pharmacyId,
          staffId: staff.staffId,
          from: open.openedAt,
          to: new Date(),
          shiftId: open.id,
        })
      : null,
  ]);

  const canSell = can(staff.role, "sell");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Till</h1>
        <p className="mt-1 mb-8 text-sm text-slate-500">
          Open the drawer at the start of the day, close it at the end. Closing
          cuts the Z-reading.
        </p>

        {canSell &&
          (open && x ? (
            <>
              {/*
                THE X-READING: the same summary as a Z, taken without closing
                anything off. A cashier halfway through a shift needs to know
                what the drawer should hold; being unable to ask without ending
                the day is how a discrepancy gets found twelve hours late.
              */}
              <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
                <p className="text-sm font-semibold">X-reading, so far</p>
                <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                  <Line label="Sales" value={String(x.totals.salesCount)} />
                  <Line label="Voided" value={String(x.totals.voidedCount)} />
                  <Line label="Gross" value={peso(x.totals.grossCentavos)} />
                  <Line label="Discounts" value={peso(x.totals.discountCentavos)} />
                  <Line label="Net" value={peso(x.totals.netCentavos)} strong />
                  <Line label="VAT" value={peso(x.totals.vatCentavos)} />
                  <Line label="VAT-exempt (SC/PWD)" value={peso(x.totals.vatExemptCentavos)} />
                  <Line label="Cash taken" value={peso(x.totals.cashCentavos)} strong />
                  <Line label="GCash" value={peso(x.totals.gcashCentavos)} />
                  <Line label="Card" value={peso(x.totals.cardCentavos)} />
                  <Line label="Maya" value={peso(x.totals.mayaCentavos)} />
                  {x.totals.otherCentavos > 0 && (
                    <Line label="Other tender" value={peso(x.totals.otherCentavos)} />
                  )}
                </div>
              </section>

              <CloseShiftForm
                shiftId={open.id}
                openedAt={open.openedAt}
                openingCashCentavos={open.openingCashCentavos}
                cashSoFarCentavos={x.totals.cashCentavos}
                autoPrint={printing?.autoPrintReceipt ?? true}
                receiptPaperMm={printing?.receiptPaperMm ?? 58}
              />
            </>
          ) : (
            <OpenShiftForm />
          ))}

        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Past shifts
          </h2>
          {shifts.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
              No shifts yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
                <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Opened</th>
                    <th className="px-4 py-2 font-medium">Cashier</th>
                    <th className="px-4 py-2 text-right font-medium">Sales</th>
                    <th className="px-4 py-2 text-right font-medium">Net</th>
                    <th className="px-4 py-2 text-right font-medium">Drawer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {shifts.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2">
                        {manilaDateTime(s.openedAt)}
                        {s.status === "open" && (
                          <span className="ml-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">
                            open
                          </span>
                        )}
                        {s.notes && <p className="text-xs text-slate-500">{s.notes}</p>}
                      </td>
                      <td className="px-4 py-2 text-slate-300">{s.staffName ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.salesCount ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {s.netCentavos === null ? "—" : peso(s.netCentavos)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {s.overShortCentavos === null ? (
                          "—"
                        ) : s.overShortCentavos === 0 ? (
                          <span className="text-emerald-300">balanced</span>
                        ) : (
                          <span className={s.overShortCentavos < 0 ? "text-red-300" : "text-amber-300"}>
                            {peso(Math.abs(s.overShortCentavos))}{" "}
                            {s.overShortCentavos < 0 ? "short" : "over"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b border-white/10 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
