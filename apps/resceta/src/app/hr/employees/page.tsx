import { redirect } from "next/navigation";
import { getCurrentStaff, requireStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listEmployees, staffOptions } from "@/server/pharmacy/hr";
import { EmployeeList } from "./EmployeeList";

export const dynamic = "force-dynamic";

/**
 * The payroll.
 *
 * GATED ON `manageStaff` AT THE PAGE, not just the action, because every row
 * here shows a pay rate. That is the one piece of data in this app where
 * rendering it to the wrong person is the harm, rather than writing it.
 */
export default async function EmployeesPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  await requireStaff("manageStaff");

  const [rows, logins] = await Promise.all([
    listEmployees(staff.pharmacyId),
    staffOptions(staff.pharmacyId),
  ]);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Who is on the payroll. Separate from who has a login — a rider on the
          payroll never signs into the till, and a pay rate does not belong on an
          account row.
        </p>
        <EmployeeList rows={rows} staff={logins.map((l) => ({ ...l, role: String(l.role) }))} />
      </main>
    </AppShell>
  );
}
