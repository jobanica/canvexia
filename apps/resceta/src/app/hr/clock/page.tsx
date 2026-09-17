import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listEmployees } from "@/server/pharmacy/hr";
import { ClockPanel } from "./ClockPanel";

export const dynamic = "force-dynamic";

/**
 * The clock.
 *
 * NO PAY RATES ON THIS SCREEN. Everybody who works here uses it, so it shows
 * names and nothing else — the employee list, which does show rates, is gated
 * on `manageStaff` separately.
 */
export default async function ClockPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const rows = await listEmployees(staff.pharmacyId);
  const active = rows.filter((e) => e.isActive);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Clock in</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          Tap your name. Every punch is kept — a correction is another punch, not
          an edit, so the pair stays visible.
        </p>
        <ClockPanel
          rows={active.map((e) => ({
            id: e.id,
            fullName: e.fullName,
            position: e.position,
            isIn: e.lastPunch?.kind === "clock_in",
            lastAt: e.lastPunch?.at ?? null,
          }))}
        />
      </main>
    </AppShell>
  );
}
