import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listStaff } from "@/server/pharmacy/staff";
import { can, ROLE_LABEL, permissionsOf, type PharmacyRole } from "@/lib/pharmacy/roles";
import { AddStaffForm, RemoveStaffButton } from "./StaffForms";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fstaff");

  if (!can(staff.role, "manageStaff")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            This account cannot manage staff.
          </p>
        </main>
      </AppShell>
    );
  }

  const people = await listStaff(staff.pharmacyId);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Staff</h1>

        <section className="mb-10">
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {p.displayName ?? p.email}
                  </span>
                  <span className="block truncate text-slate-500">
                    {p.displayName ? p.email : null}
                    {p.displayName ? " · " : null}
                    {permissionsOf(p.role as PharmacyRole).length} permission
                    {permissionsOf(p.role as PharmacyRole).length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {ROLE_LABEL[p.role as PharmacyRole]}
                  </span>
                  {p.id !== staff.staffId && <RemoveStaffButton staffId={p.id} />}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Add someone
          </h2>
          <AddStaffForm />
          <p className="mt-3 text-xs text-slate-500">
            A cashier can sell and nothing else. Only a{" "}
            <strong>pharmacist</strong> or the owner can complete a sale
            containing a prescription-only item — under PH practice an Rx
            medicine is dispensed by, or under the direct supervision of, a
            registered pharmacist.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
