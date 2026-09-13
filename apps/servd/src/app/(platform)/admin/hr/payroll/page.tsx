import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { getPayroll } from "@/server/hr/payroll";
import { listEmployees } from "@/server/hr/queries";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { addPayrollDeduction, deletePayrollDeduction } from "@/server/hr/actions";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";

function monthRange(which: "this" | "last") {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() - (which === "last" ? 1 : 0);
  const from = new Date(y, m, 1);
  const to = which === "last" ? new Date(y, m + 1, 0, 23, 59, 59) : now;
  return { from, to };
}

/** "YYYY-MM-DD" → Date at the start (or end) of that day. Invalid → null. */
function parseDay(v: string | undefined, endOfDay = false): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const isoDay = (d: Date) => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;

  const sp = await searchParams;
  const period = sp.period === "last" ? "last" : "this";
  const preset = monthRange(period);
  // An explicit covered-date range wins over the month presets.
  const customFrom = parseDay(sp.from);
  const customTo = parseDay(sp.to, true);
  const custom = !!(customFrom || customTo);
  const from = customFrom ?? preset.from;
  const to = customTo ?? preset.to;

  const [rows, employees, deductions] = await Promise.all([
    getPayroll(restaurantId, from, to),
    listEmployees(restaurantId),
    tenantDb(restaurantId, (tx) =>
      tx.payrollDeduction.findMany({
        where: { appliedOn: { gte: from, lte: to } },
        orderBy: { appliedOn: "desc" },
        include: { employee: { select: { fullName: true } } },
      }),
    ).catch(() => []),
  ]);

  const statutoryOf = (r: (typeof rows)[number]) =>
    r.absenceDeduction + r.lateDeduction + r.sss + r.philhealth + r.pagibig + r.bir;
  const totals = rows.reduce(
    (s, r) => ({
      ded: s.ded + statutoryOf(r) + r.otherDeductions,
      other: s.other + r.otherDeductions,
      net: s.net + r.net,
    }),
    { ded: 0, other: 0, net: 0 },
  );

  const qs = custom ? `from=${isoDay(from)}&to=${isoDay(to)}` : `period=${period}`;
  const field = "rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
          <h1 className="font-heading text-2xl font-bold">Payroll</h1>
          <p className="text-sm text-plum-ink/50">
            Covered: {manilaDate(from)} – {manilaDate(to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/hr/payroll?period=this" className={`rounded-full px-3 py-1 text-sm font-semibold ${!custom && period === "this" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>This month</Link>
          <Link href="/admin/hr/payroll?period=last" className={`rounded-full px-3 py-1 text-sm font-semibold ${!custom && period === "last" ? "btn-brand text-white" : "border border-plum-ink/15"}`}>Last month</Link>
          <Link href="/admin/hr/payroll/settings" className="rounded-full border border-plum-ink/15 px-3 py-1 text-sm font-semibold">Deductions ⚙</Link>
          <a href={`/admin/hr/payroll/export?period=${period}`} className="rounded-full border border-plum-ink/15 px-3 py-1 text-sm font-semibold">Export CSV</a>
        </div>
      </div>

      {/* Covered-date filter */}
      <form className="flex flex-wrap items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Covered from</label>
          <input type="date" name="from" defaultValue={isoDay(from)} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Covered to</label>
          <input type="date" name="to" defaultValue={isoDay(to)} className={field} />
        </div>
        <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Apply</button>
        {custom && (
          <Link href="/admin/hr/payroll?period=this" className="px-2 py-2 text-sm font-semibold text-plum-ink/50 hover:text-plum-ink">
            Reset
          </Link>
        )}
      </form>

      <p className="rounded-lg bg-cream px-3 py-2 text-xs text-plum-ink/60">
        Fixed-salary employees: net = monthly salary − absent days − late (pro-rated from a{" "}
        {26}-day month, 8h/day). Hourly = rate × hours. Statutory deductions (SSS, PhilHealth,
        Pag-IBIG, BIR, 13th-month) are NOT applied.
      </p>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr>
              <th className="p-3">Employee</th><th>Type</th><th className="text-right">Base</th>
              <th className="text-right">Absent</th><th className="text-right">Late</th>
              <th className="text-right">Other</th>
              <th className="text-right">Deductions</th><th className="text-right">Net pay</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-t border-plum-ink/10">
                <td className="p-3 font-medium">{r.name}</td>
                <td>{r.payType}</td>
                <td className="text-right">{formatPeso(r.base)}</td>
                <td className="text-right">{r.absentDays > 0 ? `${r.absentDays}d` : "—"}</td>
                <td className="text-right">{r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—"}</td>
                <td className="text-right text-guava" title={r.otherItems.map((i) => `${i.label} ${formatPeso(i.amount)}`).join(", ")}>
                  {r.otherDeductions > 0 ? `−${formatPeso(r.otherDeductions)}` : "—"}
                </td>
                <td className="text-right text-guava">
                  {statutoryOf(r) + r.otherDeductions > 0
                    ? `−${formatPeso(statutoryOf(r) + r.otherDeductions)}`
                    : "—"}
                </td>
                <td className="text-right font-semibold">{formatPeso(r.net)}</td>
                <td className="pr-3 text-right">
                  <Link href={`/admin/hr/payroll/${r.employeeId}?${qs}`} className="text-xs font-semibold text-brand-primary">Payslip</Link>
                </td>
              </tr>
            ))}
            <tr className="border-t border-plum-ink/10 font-heading font-bold">
              <td className="p-3" colSpan={5}>Total</td>
              <td className="text-right text-guava">{totals.other > 0 ? `−${formatPeso(totals.other)}` : "—"}</td>
              <td className="text-right text-guava">−{formatPeso(totals.ded)}</td>
              <td className="text-right">{formatPeso(totals.net)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Other deductions — one-off amounts inside the covered period. */}
      <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
        <h2 className="font-heading text-lg font-bold">Other deductions</h2>
        <p className="mb-3 text-sm text-plum-ink/55">
          Cash advance, loan, uniform, breakage… Dated inside the covered period, taken once from
          that period&apos;s net pay.
        </p>

        <form action={addPayrollDeduction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Employee</label>
            <select name="employeeId" required className={`${field} w-52`}>
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.fullName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Reason</label>
            <input name="label" required maxLength={80} placeholder="e.g. Cash advance" className={`${field} w-48`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Amount (₱)</label>
            <input name="amountPesos" type="number" step="0.01" min="0.01" required placeholder="0.00" className={`${field} w-32`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-plum-ink/60">Date</label>
            <input type="date" name="appliedOn" defaultValue={isoDay(to)} className={field} />
          </div>
          <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Add</button>
        </form>

        {deductions.length > 0 && (
          <ul className="mt-4 divide-y divide-plum-ink/10">
            {deductions.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-plum-ink">{d.employee.fullName}</span>
                  <span className="text-plum-ink/55"> · {d.label} · {manilaDate(d.appliedOn)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-semibold text-guava">−{formatPeso(d.amount)}</span>
                  <form action={deletePayrollDeduction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="text-xs font-semibold text-plum-ink/45 hover:text-guava">remove</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
