import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listEmployees, listLeave } from "@/server/pharmacy/hr";
import { can } from "@/lib/pharmacy/roles";
import { LeaveForm, LeaveRow } from "./LeavePanel";

export const dynamic = "force-dynamic";

/**
 * Leave.
 *
 * FILING NEEDS `sell`, DECIDING NEEDS `manageStaff`. Anybody who works here can
 * put a request in — a system where only a manager can file one produces
 * requests filed by the manager on somebody's behalf, which is a record of the
 * wrong thing.
 *
 * NO PAY RATES HERE either, which is why this is not gated at the page like the
 * employee list is.
 */
export default async function LeavePage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const [requests, employees] = await Promise.all([
    listLeave(staff.pharmacyId),
    listEmployees(staff.pharmacyId),
  ]);

  const canDecide = can(staff.role, "manageStaff");
  const pending = requests.filter((r) => r.status === "pending");
  const settled = requests.filter((r) => r.status !== "pending");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Leave</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          {pending.length > 0
            ? `${pending.length} request${pending.length === 1 ? "" : "s"} waiting to be decided.`
            : "Nothing waiting to be decided."}
        </p>

        <div className="mb-8">
          <LeaveForm
            key={`leave-${requests.length}`}
            employees={employees
              .filter((e) => e.isActive)
              .map((e) => ({ id: e.id, fullName: e.fullName }))}
          />
        </div>

        {pending.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Waiting
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {pending.map((r) => (
                <LeaveRow key={r.id} request={r} canDecide={canDecide} />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Decided
          </h2>
          {settled.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Nothing decided yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {settled.map((r) => (
                <LeaveRow key={r.id} request={r} canDecide={false} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
