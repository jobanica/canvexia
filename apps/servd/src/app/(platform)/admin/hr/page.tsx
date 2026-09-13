import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { listEmployees } from "@/server/hr/queries";
import { qrSvg } from "@/lib/qr";
import { formatPeso } from "@/lib/money";
import { AddEmployeeForm } from "@/components/admin/hr/AddEmployeeForm";

export default async function HrPage() {
  const { restaurantId, eligible } = await requireHrPage();
  const locked = await featureLockOr(restaurantId, "hr", "HR");
  if (locked) return locked;
  const employees = await listEmployees(restaurantId);

  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({ select: { slug: true } }),
  );
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const attendUrl = `${base.replace(/\/$/, "")}/attend/${restaurant.slug}`;
  const attendQr = await qrSvg(attendUrl);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold">HR · Employees</h1>
        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ["Attendance", "/admin/hr/attendance"],
            ["Late report", "/admin/hr/late"],
            ["Staff performance", "/admin/hr/performance"],
            ["Schedule", "/admin/hr/schedule"],
            ["Timesheets", "/admin/hr/timesheets"],
            ["Leave", "/admin/hr/leave"],
            ["Payroll", "/admin/hr/payroll"],
          ].map(([l, h]) => (
            <Link key={h} href={h} className="rounded-full border border-plum-ink/15 px-3 py-1 font-semibold">
              {l}
            </Link>
          ))}
        </nav>
      </div>

      {/* Shared workplace attendance QR */}
      <div className="flex flex-col items-center gap-4 rounded-tile border border-plum-ink/10 bg-white p-5 sm:flex-row">
        <div className="h-36 w-36 shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: attendQr }} />
        <div className="min-w-0 text-center sm:text-left">
          <h2 className="font-heading text-lg font-bold">Workplace attendance QR</h2>
          <p className="mt-1 text-sm text-plum-ink/60">
            Print &amp; post this at your workplace. Employees scan it, sign in with their phone +
            PIN, then take a selfie to clock in/out. Set each employee&apos;s phone &amp; PIN on
            their profile.
          </p>
          <p className="mt-2 break-all text-xs text-plum-ink/40">{attendUrl}</p>
        </div>
      </div>

      <AddEmployeeForm />

      <ul className="space-y-2">
        {employees.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/hr/${e.id}`} className="flex items-center justify-between rounded-tile border border-plum-ink/10 bg-white p-4 hover:border-brand-primary">
              <div>
                <span className="font-medium">{e.fullName}</span>
                {e.status === "inactive" && <span className="ml-2 text-xs text-muted">(inactive)</span>}
                <span className="block text-xs text-plum-ink/40">
                  {e.title ?? "—"} · {e.employmentType.replace("_", "-")}
                </span>
              </div>
              <span className="text-sm text-plum-ink/60">
                {formatPeso(e.payRate)}/{e.payType === "hourly" ? "hr" : "mo"}
              </span>
            </Link>
          </li>
        ))}
        {employees.length === 0 && <p className="text-sm text-plum-ink/40">No employees yet.</p>}
      </ul>
    </div>
  );
}
