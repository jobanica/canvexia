import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { payroll } from "@/server/pharmacy/hr";
import { PAY_TYPE_LABEL } from "@/lib/pharmacy/hr";
import { parseRange } from "@/lib/pharmacy/range";
import { RangeFilter } from "@/components/RangeFilter";
import { peso } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * The payroll register.
 *
 * WHAT THIS IS NOT: a filing. It computes gross pay from the punch log and the
 * rate on each employment record, and it does not compute SSS, PhilHealth,
 * Pag-IBIG or withholding tax — those are rate tables that change, and a
 * half-built version of them would be wrong in a way nobody notices until an
 * assessment. The screen says so rather than showing a "net" figure that is
 * really a gross one wearing the wrong label.
 *
 * A MONTHLY RATE IS THE PERIOD'S RATE. Prorating would need a working-days
 * calendar and holiday rules; instead the period is stated at the top, and the
 * person running payroll picks a period that matches how they pay.
 */
export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  await requireStaff("manageStaff");

  const range = parseRange(await searchParams);
  const rows = await payroll(staff.pharmacyId, range);
  const total = rows.reduce((t, r) => t + r.grossCentavos, 0);
  const problems = rows.filter((r) => r.unpairedDays > 0);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payroll register</h1>
            <p className="mt-1 text-sm text-slate-500">
              {range.from} to {range.to} · {range.days} days
            </p>
          </div>
          <RangeFilter range={range} path="/hr/payroll" />
        </div>

        {/*
          Said plainly and above the numbers. A register that silently omits
          statutory deductions and calls the result "net" is worse than one that
          does not try.
        */}
        <p className="mb-6 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-200">
          <strong>Gross pay only.</strong> SSS, PhilHealth, Pag-IBIG and
          withholding tax are not computed here — their tables change, and a
          half-built version would be wrong in a way nobody notices. Use this to
          work out what is owed, then apply your deductions.
        </p>

        {problems.length > 0 && (
          <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {problems.length} employee{problems.length === 1 ? " has" : "s have"} days clocked in
            and never clocked out. Those count as zero hours — fix them on the
            timesheet before paying anybody hourly.
          </p>
        )}

        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            Nobody on the payroll.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
              <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Basis</th>
                  <th className="px-4 py-2 text-right font-medium">Days</th>
                  <th className="px-4 py-2 text-right font-medium">Hours</th>
                  <th className="px-4 py-2 text-right font-medium">Late</th>
                  <th className="px-4 py-2 text-right font-medium">Gross</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((r) => (
                  <tr key={r.employee.id}>
                    <td className="px-4 py-2">
                      {r.employee.fullName}
                      {r.unpairedDays > 0 && (
                        <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-200">
                          {r.unpairedDays} unclosed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-300">
                      {PAY_TYPE_LABEL[r.employee.payType]} ·{" "}
                      {peso(r.employee.payRateCentavos)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.daysPresent}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.totalHours}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-300">
                      {r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">
                      {peso(r.grossCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-white/[0.06] font-semibold">
                  <td className="px-4 py-2" colSpan={5}>
                    Total gross for the period
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{peso(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
