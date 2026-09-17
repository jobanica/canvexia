import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { timesheets } from "@/server/pharmacy/hr";
import { parseRange } from "@/lib/pharmacy/range";
import { RangeFilter } from "@/components/RangeFilter";
import { manilaDateTime } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Hours worked, and who was late.
 *
 * FIRST IN, LAST OUT per Manila day. Somebody who punches out for lunch and
 * back in has worked the span, not two disjoint pieces.
 *
 * AN UNPAIRED DAY IS FLAGGED, NOT ZEROED. A day clocked in and never clocked
 * out is somebody who forgot, and paying it as zero hours is a silent
 * deduction. It is shown so a human fixes it rather than the system guessing.
 */
export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  await requireStaff("manageStaff");

  const range = parseRange(await searchParams);
  const sheets = await timesheets(staff.pharmacyId, range);
  const withHours = sheets.filter((s) => s.days.length > 0);
  const unpaired = sheets.reduce((t, s) => t + s.unpairedDays, 0);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Timesheets</h1>
            <p className="mt-1 text-sm text-slate-500">
              Built from the punch log. Nothing here is editable — a correction
              is another punch.
            </p>
          </div>
          <RangeFilter range={range} path="/hr/timesheets" />
        </div>

        {unpaired > 0 && (
          <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            {unpaired} day{unpaired === 1 ? " was" : "s were"} clocked in and never clocked out.
            Those days count as zero hours until somebody clocks out — fix them
            before running payroll.
          </p>
        )}

        {withHours.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            Nobody clocked in during this window.
          </p>
        ) : (
          <div className="space-y-6">
            {withHours.map((s) => (
              <section key={s.employee.id} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-5 py-3">
                  <h2 className="font-semibold">{s.employee.fullName}</h2>
                  <p className="text-sm text-slate-500">
                    {s.daysPresent} day{s.daysPresent === 1 ? "" : "s"} ·{" "}
                    <span className="font-semibold text-white">{s.totalHours} hours</span>
                    {s.lateCount > 0 && (
                      <span className="ml-2 text-amber-300">
                        late {s.lateCount}× ({s.lateMinutes} min)
                      </span>
                    )}
                  </p>
                </header>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">Day</th>
                      <th className="px-5 py-2 font-medium">In</th>
                      <th className="px-5 py-2 font-medium">Out</th>
                      <th className="px-5 py-2 text-right font-medium">Hours</th>
                      <th className="px-5 py-2 text-right font-medium">Late</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {s.days.map((d) => (
                      <tr key={d.day} className={d.unpaired ? "bg-amber-500/10" : undefined}>
                        <td className="px-5 py-2">{d.day}</td>
                        <td className="px-5 py-2 text-slate-300">
                          {d.clockIn ? manilaDateTime(d.clockIn) : "—"}
                        </td>
                        <td className="px-5 py-2 text-slate-300">
                          {d.clockOut ? (
                            manilaDateTime(d.clockOut)
                          ) : (
                            <span className="text-amber-300">never clocked out</span>
                          )}
                        </td>
                        <td className="px-5 py-2 text-right tabular-nums">{d.hours}</td>
                        <td className="px-5 py-2 text-right tabular-nums">
                          {d.late ? (
                            <span className="text-amber-300">{d.lateByMinutes} min</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
