import { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { hasModule } from "@/server/billing/entitlements";
import { getPayroll } from "@/server/hr/payroll";

function cell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["admin", "manager"].includes(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await hasModule(user.restaurantId, "hris"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") === "last" ? "last" : "this";
  const now = new Date();
  const m = now.getMonth() - (period === "last" ? 1 : 0);
  const from = new Date(now.getFullYear(), m, 1);
  const to = period === "last" ? new Date(now.getFullYear(), m + 1, 0, 23, 59, 59) : now;

  const payroll = await getPayroll(user.restaurantId, from, to);

  const header = [
    "employee", "pay_type", "hours", "overtime_hours", "base_php",
    "absent_days", "late_minutes", "absence_late_php",
    "sss_php", "philhealth_php", "pagibig_php", "bir_php",
    "other_deductions_php", "other_deductions_detail",
    "deductions_php", "net_php", "13th_month_accrual_php",
  ];
  const rows = payroll.map((r) => [
    r.name,
    r.payType,
    r.hours.toFixed(2),
    r.ot.toFixed(2),
    (r.base / 100).toFixed(2),
    r.absentDays,
    r.lateMinutes,
    ((r.absenceDeduction + r.lateDeduction) / 100).toFixed(2),
    (r.sss / 100).toFixed(2),
    (r.philhealth / 100).toFixed(2),
    (r.pagibig / 100).toFixed(2),
    (r.bir / 100).toFixed(2),
    (r.otherDeductions / 100).toFixed(2),
    r.otherItems.map((i) => `${i.label} ${(i.amount / 100).toFixed(2)}`).join("; "),
    ((r.absenceDeduction + r.lateDeduction + r.sss + r.philhealth + r.pagibig + r.bir + r.otherDeductions) / 100).toFixed(2),
    (r.net / 100).toFixed(2),
    (r.thirteenthAccrual / 100).toFixed(2),
  ]);

  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="servd-payroll-${period}.csv"`,
    },
  });
}
